/*
 * Pull a recipe out of a web page's HTML.
 * Most recipe sites publish their recipe as schema.org "Recipe" data inside
 * <script type="application/ld+json"> tags (that's what Google reads), so we
 * look there. Returns null when the page has no recipe data.
 */

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  frac12: "½", frac14: "¼", frac34: "¾", deg: "°", rsquo: "’", lsquo: "‘", rdquo: "”",
  ldquo: "“", hellip: "…", eacute: "é", egrave: "è", times: "×", reg: "®", trade: "™", copy: "©"
};

export function cleanText(value) {
  if (value == null) return "";
  let s = String(value);
  // Decode twice: some sites double-encode (&amp;#39;).
  for (let i = 0; i < 2; i += 1) {
    s = s
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => safeChar(parseInt(dec, 10)))
      .replace(/&([a-z]+);/gi, (m, name) => (name.toLowerCase() in ENTITIES ? ENTITIES[name.toLowerCase()] : m));
  }
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function safeChar(code) {
  if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch (e) {
    return "";
  }
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function hasType(node, type) {
  return asArray(node && node["@type"]).some((t) => String(t).toLowerCase() === type.toLowerCase());
}

function findRecipe(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipe(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (hasType(node, "Recipe")) return node;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) {
    if (node[key]) {
      const found = findRecipe(node[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/* ISO 8601 duration ("PT1H30M", "P0DT2H") to minutes. */
export function durationMinutes(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!m) return null;
  const mins = (Number(m[1] || 0) * 1440) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) + Number(m[4] || 0) / 60;
  return mins > 0 ? Math.round(mins) : null;
}

function servingsFrom(yieldValue) {
  for (const item of asArray(yieldValue)) {
    if (typeof item === "number" && item > 0) return String(Math.round(item));
    const text = cleanText(item);
    const range = text.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
    if (range) return range[1] + "-" + range[2];
    const single = text.match(/\d+/);
    if (single) return single[0];
  }
  return "";
}

function instructionsFrom(value, out = [], depth = 0) {
  if (depth > 6) return out;
  for (const item of asArray(value)) {
    if (typeof item === "string") {
      cleanText(item)
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:step\s*)?\d+[.)]\s+/i, "").trim())
        .filter(Boolean)
        .forEach((line) => out.push(line));
    } else if (item && typeof item === "object") {
      if (hasType(item, "HowToSection") || item.itemListElement) {
        instructionsFrom(item.itemListElement, out, depth + 1);
      } else {
        const text = cleanText(item.text || item.name || "");
        if (text) out.push(text);
      }
    }
  }
  return out;
}

function imageFrom(value) {
  for (const item of asArray(value)) {
    if (typeof item === "string" && /^https?:\/\//i.test(item)) return item;
    if (item && typeof item === "object" && typeof item.url === "string") return item.url;
  }
  return "";
}

function listOfText(value) {
  return asArray(value).map(cleanText).filter(Boolean);
}

function keywordsFrom(recipe) {
  const words = [];
  for (const k of asArray(recipe.keywords)) {
    String(cleanText(k))
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean)
      .forEach((w) => words.push(w));
  }
  for (const c of listOfText(recipe.recipeCuisine)) words.push(c.toLowerCase());
  const seen = new Set();
  return words.filter((w) => w.length <= 30 && !seen.has(w) && seen.add(w)).slice(0, 6);
}

function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch (e) {
      // Some sites leave raw newlines inside strings; try once more without them.
      try {
        blocks.push(JSON.parse(raw.replace(/[\r\n\t]+/g, " ")));
      } catch (e2) {
        /* skip unreadable block */
      }
    }
  }
  return blocks;
}

export function pageTitle(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return cleanText(og[1]);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return t ? cleanText(t[1]) : "";
}

export function parseRecipe(html) {
  let recipe = null;
  for (const block of jsonLdBlocks(html)) {
    recipe = findRecipe(block);
    if (recipe) break;
  }
  if (!recipe) return null;

  const total =
    durationMinutes(recipe.totalTime) ||
    ((durationMinutes(recipe.prepTime) || 0) + (durationMinutes(recipe.cookTime) || 0)) ||
    null;

  return {
    title: cleanText(recipe.name || recipe.headline || "").slice(0, 200),
    category: listOfText(recipe.recipeCategory)[0] || "",
    tags: keywordsFrom(recipe),
    timeMinutes: total,
    servings: servingsFrom(recipe.recipeYield),
    image: imageFrom(recipe.image),
    ingredients: listOfText(recipe.recipeIngredient || recipe.ingredients).slice(0, 150),
    steps: instructionsFrom(recipe.recipeInstructions).slice(0, 100),
    author: listOfText(asArray(recipe.author).map((a) => (a && typeof a === "object" ? a.name : a)))[0] || ""
  };
}
