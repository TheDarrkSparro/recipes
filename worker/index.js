/*
 * Cloudflare Worker for The Dark Sparrow Eats.
 * Everything is served from the static files, except /api/import, which reads
 * a recipe web page and returns its recipe as JSON for the "Add a recipe" page.
 * (A browser can't read other websites directly, so this does it instead.)
 * It only reads and returns recipe data; saving happens in Supabase.
 */
import { parseRecipe, pageTitle } from "./parse-recipe.js";

const MAX_BYTES = 3 * 1024 * 1024;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function badHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // Only real website names, not raw IP addresses.
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return true;
  return !h.includes(".");
}

async function readLimited(response) {
  const reader = response.body && response.body.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(Math.min(size, MAX_BYTES));
  let offset = 0;
  for (const c of chunks) {
    all.set(c.subarray(0, all.length - offset), offset);
    offset += c.byteLength;
    if (offset >= all.length) break;
  }
  return new TextDecoder("utf-8").decode(all);
}

async function handleImport(request) {
  if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "bad_url" }, 400);
  }
  let target;
  try {
    target = new URL(String((body && body.url) || "").trim());
  } catch (e) {
    return json({ ok: false, error: "bad_url" }, 400);
  }
  if (!/^https?:$/.test(target.protocol) || badHost(target.hostname) || target.username || target.password) {
    return json({ ok: false, error: "bad_url" }, 400);
  }

  let res;
  try {
    res = await fetch(target.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DarkSparrowEats-RecipeImport/1.0)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.8"
      }
    });
  } catch (e) {
    return json({ ok: false, error: "unreachable" }, 502);
  }
  if (!res.ok) return json({ ok: false, error: "blocked", status: res.status }, 502);
  const type = res.headers.get("content-type") || "";
  if (type && !/html|xml|text\/plain/i.test(type)) return json({ ok: false, error: "not_html" }, 422);

  const html = await readLimited(res);
  const recipe = parseRecipe(html);
  const finalUrl = res.url || target.toString();
  if (!recipe || (!recipe.ingredients.length && !recipe.steps.length)) {
    return json({ ok: false, error: "no_recipe", title: pageTitle(html).slice(0, 200), source: finalUrl }, 422);
  }
  return json({ ok: true, recipe, source: finalUrl });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/import") return handleImport(request);
    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  }
};
