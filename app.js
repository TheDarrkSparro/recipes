(function () {
  "use strict";

  var app = document.getElementById("app");
  if (!app) return;

  /* ---------- Recipes: the ones in recipes.js, plus ones added on the site ---------- */

  /* If recipes.js has a typo (a missing comma or quote), the browser skips the
     whole file and window.RECIPES never gets set. Tell that apart from an
     empty list so a broken file doesn't look like "no recipes yet". */
  var recipesLoaded = Array.isArray(window.RECIPES);
  var local = (recipesLoaded ? window.RECIPES : []).filter(function (r) {
    return r && typeof r === "object";
  });
  local.forEach(function (r, i) {
    r._order = i;
  });
  var saved = [];
  var savedState = "loading"; // loading | ready | failed
  /* Hidden recipes (see "Hide a recipe" in README.md). hiddenIds comes from
     Supabase; hiddenSaved holds hidden recipes added on the site, which only
     signed-in contributors can load. */
  var hiddenIds = Object.create(null);
  var hiddenSaved = [];
  /* Only the site owner (set in supabase/add-recipe-hiding.sql) sees hidden
     recipes and can hide or show them. Checked with Supabase after sign-in. */
  var isOwner = false;
  var allRecipes = local.slice();
  var recipes = local.filter(function (r) {
    return r.hidden !== true;
  });

  if (window.console && console.warn) {
    if (!recipesLoaded) {
      console.warn("recipes.js did not load or has a syntax error. Look for a missing comma, quote, or bracket.");
    }
    var seenIds = Object.create(null);
    local.forEach(function (recipe, index) {
      var id = recipeId(recipe);
      if (!id) console.warn("Recipe #" + (index + 1) + " (" + (recipe.title || "untitled") + ") has no id.");
      else if (seenIds[id]) console.warn('Two recipes share the id "' + id + '". Give each recipe its own id.');
      seenIds[id] = true;
    });
  }

  function fromRow(row) {
    return {
      id: row.id,
      title: row.title,
      category: row.category || "",
      tags: row.tags || [],
      timeMinutes: row.time_minutes,
      servings: row.servings,
      image: row.image || "",
      ingredients: row.ingredients || [],
      steps: row.steps || [],
      notes: row.notes || "",
      source: row.source_url || "",
      _added: row.created_at || "",
      _saved: true
    };
  }

  /* A recipe saved on the site with the same id as one in recipes.js is an
     edited version of it (see "Edit a recipe" in README.md), so it replaces
     that one but keeps its place in the list. */
  function rebuild() {
    var byId = Object.create(null);
    saved.forEach(function (r) {
      byId[r.id] = r;
    });
    var localIds = Object.create(null);
    var merged = local.map(function (r) {
      var id = recipeId(r);
      localIds[id] = true;
      var edit = byId[id];
      if (!edit) return r;
      var copy = {};
      Object.keys(r).forEach(function (k) {
        copy[k] = r[k];
      });
      Object.keys(edit).forEach(function (k) {
        copy[k] = edit[k];
      });
      copy._order = r._order;
      copy._added = "";
      copy._builtIn = true;
      return copy;
    });
    var savedIds = Object.create(null);
    var extra = saved.concat(hiddenSaved).filter(function (r) {
      if (localIds[r.id] || savedIds[r.id]) return false;
      savedIds[r.id] = true;
      return true;
    });
    allRecipes = merged.concat(extra);
    allRecipes.forEach(function (r) {
      var id = recipeId(r);
      r._contributor = (id && contribNames[id]) || "";
      r._hiddenInFile = r.hidden === true && !r._saved;
      r._hidden = r._hiddenInFile || !!(id && hiddenIds[id]);
    });
    // The site owner still sees hidden recipes, under the Hidden category, so
    // they can check and un-hide them; nobody else gets them.
    recipes = ownerMode()
      ? allRecipes
      : allRecipes.filter(function (r) {
          return !r._hidden;
        });
  }

  function ownerMode() {
    return isOwner && signedIn();
  }

  /* Signed in as a contributor (see auth.js). */
  function signedIn() {
    return !!(window.Auth && window.Auth.signedIn());
  }

  /* Adding and editing need a contributor sign-in; returns true when the
     sign-in page was shown instead. */
  function needSignIn(next, reason) {
    if (signedIn()) return false;
    if (!window.Auth) {
      app.innerHTML = emptyBlock("Sign-in isn't available", "The sign-in script didn't load. Refresh the page and try again.");
      return true;
    }
    window.Auth.renderSignIn(app, { next: next, reason: reason });
    return true;
  }

  /* Which recipes in recipes.js are hidden. The database only answers for ids
     we already know, so hidden recipes added on the site never show up here
     (they reach the owner through owner_hidden_recipes instead). Before
     supabase/add-recipe-hiding.sql has been run, nothing is hidden. */
  function loadHiddenIds() {
    var ids = local.map(recipeId).filter(Boolean);
    if (!ids.length) return Promise.resolve();
    return window.Reviews.api("/rpc/hidden_among", { method: "POST", body: { p_ids: ids } })
      .then(function (list) {
        hiddenIds = Object.create(null);
        (Array.isArray(list) ? list : []).forEach(function (id) {
          if (id) hiddenIds[id] = true;
        });
        hiddenSaved.forEach(function (r) {
          hiddenIds[r.id] = true;
        });
      })
      .catch(function () {
        /* Keep what we had. */
      });
  }

  /* Whether the signed-in account is the site owner, then (for the owner only)
     the hidden recipes that were added on the site. */
  function loadHiddenSaved() {
    if (!signedIn() || !window.Auth.token || !window.Reviews || !window.Reviews.api) {
      isOwner = false;
      hiddenSaved = [];
      return Promise.resolve();
    }
    var token = null;
    return window.Auth.token()
      .then(function (t) {
        token = t;
        if (!token) return false;
        return window.Reviews.api("/rpc/am_i_site_owner", { method: "POST", token: token, body: {} });
      })
      .then(function (owner) {
        isOwner = owner === true;
        if (!isOwner) return null;
        return window.Reviews.api("/rpc/owner_hidden_recipes", { method: "POST", token: token, body: {} });
      })
      .then(function (res) {
        hiddenSaved = res && res.ok && Array.isArray(res.recipes)
          ? res.recipes.filter(function (r) {
              return r && r.id && r.title;
            }).map(fromRow)
          : [];
        hiddenSaved.forEach(function (r) {
          hiddenIds[r.id] = true;
        });
      })
      .catch(function () {
        isOwner = false;
        hiddenSaved = [];
      });
  }

  /* ---------- The category list (supabase/add-categories.sql) ----------
     catList is the owner's list in order, each with the old names it used to
     have. It stays null until that SQL has been run; then the categories
     already used by recipes are offered instead, as before. */
  var catList = null;
  var allLoaded = false;

  function loadCategories() {
    return window.Reviews.api("/recipe_categories?select=name,sort_order,also_matches&order=sort_order")
      .then(function (rows) {
        var list = (Array.isArray(rows) ? rows : [])
          .filter(function (r) {
            return r && str(r.name);
          })
          .map(function (r) {
            return { name: str(r.name), aliases: stringList(r.also_matches) };
          });
        catList = list.length ? list : null;
      })
      .catch(function () {
        /* Not set up yet, or offline: keep what we had. */
      });
  }

  /* The list's spelling of a category, following renames. */
  function canonicalCategory(name) {
    var n = str(name);
    if (!n || !catList) return n;
    var low = n.toLowerCase();
    for (var i = 0; i < catList.length; i++) {
      if (catList[i].name.toLowerCase() === low) return catList[i].name;
    }
    for (var j = 0; j < catList.length; j++) {
      for (var k = 0; k < catList[j].aliases.length; k++) {
        if (catList[j].aliases[k].toLowerCase() === low) return catList[j].name;
      }
    }
    return n;
  }

  /* What the Category drop-down offers, in order. */
  function categoryChoices() {
    if (catList)
      return catList.map(function (c) {
        return c.name;
      });
    var seen = Object.create(null);
    var out = [];
    allRecipes.forEach(function (r) {
      var c = str(r.category);
      if (c && !seen[c]) {
        seen[c] = true;
        out.push(c);
      }
    });
    return out.sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  /* ---------- Contributors (supabase/add-contributors.sql) ----------
     contribNames: the public "Contributed by" name for each recipe id.
     contribDetails: for the owner only, who added each recipe and when. */
  var contribNames = Object.create(null);
  var contribDetails = Object.create(null);

  function loadContributors() {
    return window.Reviews.api("/recipe_contributors?select=id,contributor&limit=2000")
      .then(function (rows) {
        var next = Object.create(null);
        (Array.isArray(rows) ? rows : []).forEach(function (r) {
          if (r && r.id && str(r.contributor)) next[r.id] = str(r.contributor);
        });
        contribNames = next;
      })
      .catch(function () {
        /* Not set up yet, or offline: no names shown. */
      });
  }

  function loadContributorDetails() {
    contribDetails = Object.create(null);
    if (!ownerMode()) return Promise.resolve();
    return window.Auth.token()
      .then(function (token) {
        if (!token) return null;
        return window.Reviews.api("/rpc/owner_contributor_details", { method: "POST", token: token, body: {} });
      })
      .then(function (res) {
        if (!res || !res.ok || !Array.isArray(res.rows)) return;
        res.rows.forEach(function (r) {
          if (!r || !r.id) return;
          contribDetails[r.id] = { addedBy: str(r.added_by), addedAt: str(r.added_at) };
          // Includes hidden recipes, which the public list leaves out.
          if (str(r.contributor)) contribNames[r.id] = str(r.contributor);
        });
      })
      .catch(function () {
        /* Not set up yet: nothing extra to show. */
      });
  }

  /* Save a "Contributed by" name (owner only). Resolves, or rejects with an
     Error whose .key is one of CONTRIB_ERRORS. */
  var CONTRIB_ERRORS = {
    not_signed_in: "Your sign-in has ended. Sign in again, then save.",
    not_contributor: "This account can’t change contributors.",
    not_owner: "Only the site owner can change who contributed a recipe.",
    invalid_input: "Use a plain name of 80 characters or fewer, without web links.",
    not_set_up: "Contributors aren’t switched on yet. In Supabase, run supabase/add-contributors.sql (see README.md).",
    network: "Couldn’t reach the recipe database. Check your connection and try again.",
    failed: "That didn’t save. Refresh the page and try again."
  };

  function saveContributor(id, name) {
    name = String(name || "").trim();
    return window.Auth.token()
      .then(function (token) {
        if (!token) {
          var e = new Error("not_signed_in");
          e.key = "not_signed_in";
          throw e;
        }
        return window.Reviews.api("/rpc/owner_set_contributor", { method: "POST", token: token, body: { p_id: id, p_name: name } });
      })
      .then(function (res) {
        if (!res || !res.ok) {
          var e = new Error((res && res.error) || "failed");
          e.key = (res && res.error) || "failed";
          throw e;
        }
        if (name) contribNames[id] = name;
        else delete contribNames[id];
        rebuild();
      })
      .catch(function (err) {
        var key = (err && err.key) || "";
        if (!key && err && err.kind === "network") key = "network";
        if (!key && err && err.kind === "server" && (err.status === 404 || err.code === "PGRST202")) key = "not_set_up";
        if (!key && err && err.kind === "server" && (err.status === 401 || err.status === 403)) key = "not_signed_in";
        var out = new Error(CONTRIB_ERRORS[key] || CONTRIB_ERRORS.failed);
        out.key = key || "failed";
        throw out;
      });
  }

  function loadSaved() {
    allLoaded = false;
    if (!window.Reviews || !window.Reviews.enabled || !window.Reviews.api) {
      savedState = "failed";
      allLoaded = true;
      return Promise.resolve();
    }
    var extras = Promise.all([loadHiddenIds(), loadHiddenSaved(), loadCategories(), loadContributors()]).then(function () {
      // The owner check happens in loadHiddenSaved, so this goes after it.
      return loadContributorDetails();
    });
    var rows = window.Reviews.api(
      "/recipes?select=id,title,category,tags,time_minutes,servings,image,ingredients,steps,notes,source_url,created_at&order=created_at.desc&limit=500"
    )
      .then(function (rows) {
        saved = (Array.isArray(rows) ? rows : []).filter(function (r) {
          return r && r.id && r.title;
        }).map(fromRow);
        savedState = "ready";
      })
      .catch(function () {
        savedState = "failed";
      });
    return Promise.all([rows, extras]).then(function () {
      allLoaded = true;
      rebuild();
    });
  }

  /* ---------- Helpers ---------- */

  function esc(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function str(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function stringList(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(function (item) {
        return item == null ? "" : String(item).trim();
      })
      .filter(Boolean);
  }

  function recipeId(recipe) {
    if (typeof recipe.id === "string" && recipe.id.trim()) return recipe.id.trim();
    if (typeof recipe.id === "number" && Number.isFinite(recipe.id)) return String(recipe.id);
    return "";
  }

  function safeSrc(value) {
    var src = str(value);
    if (!src) return "";
    if (/^https:\/\//i.test(src)) return src;
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.indexOf("//") === 0) return "";
    return src;
  }

  function safeLink(value) {
    var href = str(value);
    return /^https?:\/\//i.test(href) ? href : "";
  }

  function hostOf(href) {
    try {
      return new URL(href).hostname.replace(/^www\./, "");
    } catch (e) {
      return "";
    }
  }

  function formatTime(mins) {
    if (mins == null || mins === "") return "";
    var n = Number(mins);
    if (!Number.isFinite(n) || n <= 0) return "";
    var rounded = Math.round(n);
    var hours = Math.floor(rounded / 60);
    var minutes = rounded % 60;
    if (hours && minutes) return hours + " hr " + minutes + " min";
    if (hours) return hours + " hr";
    return minutes + " min";
  }

  function formatServings(value) {
    if (value == null || value === "") return "";
    if (typeof value === "string" && /^\s*\d+\s*[-–]\s*\d+\s*$/.test(value)) {
      return "Serves " + value.replace(/\s*[-–]\s*/, "–").trim();
    }
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "";
    return "Serves " + (Number.isInteger(n) ? n : Math.round(n * 10) / 10);
  }

  function titleOf(recipe) {
    return str(recipe.title) || "Untitled";
  }

  function byTitle(a, b) {
    return titleOf(a).localeCompare(titleOf(b));
  }

  /* One quiet colour per category, used for its index-card tab. */
  var HUES = ["sage", "slate", "rust", "ochre", "plum", "teal", "olive"];
  var FIXED = {
    "Bread": "ochre",
    "Breakfast": "rust",
    "Soups & Stews": "slate",
    "Mains": "plum",
    "Sides": "sage",
    "Spice Blends": "olive",
    "Pickles": "teal",
    "Hidden": "hidden"
  };
  function hue(category) {
    if (FIXED[category]) return FIXED[category];
    var h = 0;
    for (var i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
    return HUES[h % HUES.length];
  }

  function categories() {
    var counts = Object.create(null);
    var list = [];
    recipes.forEach(function (recipe) {
      var c = categoryOf(recipe);
      if (!counts[c]) {
        counts[c] = 0;
        list.push(c);
      }
      counts[c] += 1;
    });
    // The owner's order first, then any category not in the list, then
    // Other and Hidden.
    var rank = Object.create(null);
    (catList || []).forEach(function (c, i) {
      rank[c.name] = i + 1;
    });
    var LAST = { Other: 1001, Hidden: 1002 };
    list.sort(function (a, b) {
      var la = LAST[a] || rank[a] || 1000;
      var lb = LAST[b] || rank[b] || 1000;
      if (la !== lb) return la - lb;
      return a.localeCompare(b);
    });
    return list.map(function (name) {
      return { name: name, count: counts[name] };
    });
  }

  /* A hidden recipe is listed under "Hidden" (only the owner sees it). Its own
     category is kept, so it goes back there when it's shown again. */
  var HIDDEN_CATEGORY = "Hidden";
  function categoryOf(recipe) {
    if (recipe._hidden) return HIDDEN_CATEGORY;
    return canonicalCategory(recipe.category) || "Other";
  }

  /* ---------- Ratings (from reviews.js) ---------- */

  var statsMap = null;

  function statFor(recipe) {
    var row = statsMap && statsMap[recipeId(recipe)];
    var count = row ? Number(row.review_count) || 0 : 0;
    return { avg: count ? Number(row.avg_rating) || 0 : 0, count: count };
  }

  /* The best-rated recipe in each category gets a "Top rated" mark,
     but only with a genuinely good average. */
  var BADGE_MIN_AVG = 4;
  function topIds() {
    var best = Object.create(null);
    recipes.forEach(function (r) {
      if (r._hidden) return;
      var s = statFor(r);
      if (!s.count || s.avg < BADGE_MIN_AVG) return;
      var c = categoryOf(r);
      var cur = best[c];
      if (!cur || s.avg > cur.s.avg || (s.avg === cur.s.avg && s.count > cur.s.count)) best[c] = { r: r, s: s };
    });
    var ids = Object.create(null);
    Object.keys(best).forEach(function (c) {
      ids[recipeId(best[c].r)] = true;
    });
    return ids;
  }

  /* ---------- Home: search, category tabs, recipe cards ---------- */

  var state = { query: "", category: "", sort: "top" };

  function haystack(recipe) {
    return [
      str(recipe.title),
      str(recipe.category),
      str(recipe.notes),
      stringList(recipe.tags).join("\n"),
      stringList(recipe.ingredients).join("\n"),
      stringList(recipe.steps).join("\n")
    ]
      .join("\n")
      .toLowerCase();
  }

  function visible() {
    var words = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var list = recipes.filter(function (recipe) {
      if (state.category && categoryOf(recipe) !== state.category) return false;
      if (!words.length) return true;
      var hay = haystack(recipe);
      return words.every(function (w) {
        return hay.indexOf(w) !== -1;
      });
    });
    var sorters = {
      top: function (a, b) {
        var sa = statFor(a);
        var sb = statFor(b);
        if (sb.avg !== sa.avg) return sb.avg - sa.avg;
        if (sb.count !== sa.count) return sb.count - sa.count;
        return byTitle(a, b);
      },
      az: byTitle,
      quick: function (a, b) {
        var ta = Number(a.timeMinutes) > 0 ? Number(a.timeMinutes) : Infinity;
        var tb = Number(b.timeMinutes) > 0 ? Number(b.timeMinutes) : Infinity;
        if (ta !== tb) return ta - tb;
        return byTitle(a, b);
      },
      newest: function (a, b) {
        var da = a._added || "";
        var db = b._added || "";
        if (da !== db) return da < db ? 1 : -1;
        return (b._order || 0) - (a._order || 0);
      }
    };
    return list.sort(sorters[state.sort] || byTitle);
  }

  var ICON_CLOCK =
    '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v4.3l2.8 1.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  var ICON_PLATE =
    '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

  var ICON_EYE_OFF =
    '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 10s2.6-5 7-5 7 5 7 5-2.6 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 16L16 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  var ICON_EYE =
    '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 10s2.6-5 7-5 7 5 7 5-2.6 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

  function facts(recipe) {
    var time = formatTime(recipe.timeMinutes);
    var serves = formatServings(recipe.servings);
    var out = "";
    if (time) out += '<span class="fact">' + ICON_CLOCK + esc(time) + "</span>";
    if (serves) out += '<span class="fact">' + ICON_PLATE + esc(serves) + "</span>";
    return out;
  }

  function card(recipe, top) {
    var id = recipeId(recipe);
    var cat = categoryOf(recipe);
    var image = safeSrc(recipe.image);
    var count = stringList(recipe.ingredients).length;
    var f = facts(recipe);
    var inner =
      '<span class="card-tab">' + esc(cat) + "</span>" +
      '<span class="card-face">' +
      (image ? '<span class="card-photo"><img src="' + esc(image) + '" alt="" loading="lazy"></span>' : "") +
      (top ? '<span class="top-mark"><span aria-hidden="true">★</span> Top rated</span>' : "") +
      '<span class="card-title">' + esc(titleOf(recipe)) + "</span>" +
      '<span class="card-facts">' +
      (f || (count ? '<span class="fact">' + count + (count === 1 ? " ingredient" : " ingredients") + "</span>" : "")) +
      "</span>" +
      (id ? '<span class="card-rating" data-rating-for="' + esc(id) + '" hidden></span>' : "") +
      "</span>";
    var cls = "card hue-" + hue(cat) + (recipe._hidden ? " is-hidden" : "");
    if (!id) return '<li><div class="' + cls + '">' + inner + "</div></li>";
    return '<li><a class="' + cls + '" href="#/recipe/' + encodeURIComponent(id) + '">' + inner + "</a></li>";
  }

  function emptyBlock(title, body, action) {
    return (
      '<div class="empty">' +
      "<h2>" + title + "</h2>" +
      "<p>" + body + "</p>" +
      (action || "") +
      "</div>"
    );
  }

  function paintResults() {
    var box = document.getElementById("results");
    var countEl = document.getElementById("count");
    if (!box) return;

    if (!recipesLoaded) {
      box.innerHTML = emptyBlock(
        "The recipe list didn't load",
        "There's a small typo in <code>recipes.js</code>, usually a missing comma between recipes or an unclosed quote. Undo your last edit or check around it, save, and refresh."
      );
      if (countEl) countEl.textContent = "";
      return;
    }

    var list = visible();
    var tops = topIds();
    if (countEl) {
      var n = list.length;
      countEl.textContent =
        n + (n === 1 ? " recipe" : " recipes") +
        (state.category ? " in " + state.category : "") +
        (state.query.trim() ? " matching “" + state.query.trim() + "”" : "");
    }

    if (!recipes.length) {
      box.innerHTML = emptyBlock(
        "No recipes yet",
        "Add your first one from a link, or type it in.",
        '<a class="btn" href="#/add">Add a recipe</a>'
      );
      return;
    }
    if (!list.length) {
      box.innerHTML = emptyBlock(
        "No recipes match",
        "Try fewer words, or search all categories.",
        '<button type="button" class="btn btn-quiet" data-reset="1">Show all recipes</button>'
      );
      return;
    }
    box.innerHTML =
      '<ul class="cards">' +
      list
        .map(function (r) {
          return card(r, tops[recipeId(r)]);
        })
        .join("") +
      "</ul>";
    if (window.Reviews) window.Reviews.paintCards(box);
  }

  function tabsHtml() {
    var cats = categories();
    var all = '<button type="button" class="tab' + (state.category ? "" : " is-on") + '" data-cat="" aria-pressed="' + !state.category + '">All <span class="tab-n">' + recipes.length + "</span></button>";
    return (
      all +
      cats
        .map(function (c) {
          var on = state.category === c.name;
          return (
            '<button type="button" class="tab hue-' + hue(c.name) + (on ? " is-on" : "") + '" data-cat="' + esc(c.name) + '" aria-pressed="' + on + '">' +
            esc(c.name) + ' <span class="tab-n">' + c.count + "</span></button>"
          );
        })
        .join("")
    );
  }

  function paintTabs() {
    var el = document.getElementById("tabs");
    if (el) el.innerHTML = tabsHtml();
    var edit = document.getElementById("cat-edit");
    if (edit) edit.innerHTML = ownerMode() ? '<a class="cat-edit-link" href="#/categories">Edit categories</a>' : "";
  }

  function renderList() {
    document.title = "The Dark Sparrow Eats";
    app.innerHTML =
      '<section class="intro">' +
      '<div class="intro-text">' +
      '<h1 class="intro-title">Recipes from the Dark Sparrow kitchen</h1>' +
      '<p class="intro-sub">Sourdough, the smoker, a jar of Herbes de Provence, and the comfort food in between. What you cook, kept simply.</p>' +
      '<form class="search" role="search" id="search-form">' +
      '<label class="sr-only" for="search">Search recipes</label>' +
      '<svg class="search-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="8.5" cy="8.5" r="5.75" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
      '<input id="search" type="search" placeholder="Search recipes or ingredients" autocomplete="off" value="' + esc(state.query) + '">' +
      "</form>" +
      "</div>" +
      introPhoto() +
      "</section>" +
      '<nav class="tabs" id="tabs" aria-label="Categories">' + tabsHtml() + "</nav>" +
      '<div class="toolbar">' +
      '<p class="count" id="count" aria-live="polite"></p>' +
      '<span class="cat-edit" id="cat-edit"></span>' +
      '<label class="sort"><span>Sort</span><select id="sort">' +
      '<option value="top">Top rated</option>' +
      '<option value="az">A to Z</option>' +
      '<option value="quick">Quickest first</option>' +
      '<option value="newest">Newest first</option>' +
      "</select></label>" +
      "</div>" +
      '<div id="results"></div>';

    var search = document.getElementById("search");
    var sort = document.getElementById("sort");
    sort.value = state.sort;

    document.getElementById("search-form").addEventListener("submit", function (e) {
      e.preventDefault();
      search.blur();
    });
    search.addEventListener("input", function () {
      state.query = search.value;
      paintResults();
    });
    sort.addEventListener("change", function () {
      state.sort = sort.value;
      paintResults();
    });
    document.getElementById("tabs").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-cat]") : null;
      if (!btn) return;
      state.category = btn.getAttribute("data-cat");
      paintTabs();
      paintResults();
    });
    document.getElementById("results").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-reset]") : null;
      if (!btn) return;
      state.query = "";
      state.category = "";
      search.value = "";
      paintTabs();
      paintResults();
      search.focus();
    });
    paintTabs();
    paintResults();

    if (!statsMap && window.Reviews && window.Reviews.getStats) {
      window.Reviews.getStats()
        .then(function (map) {
          statsMap = map || null;
          if (current.name === "list") paintResults();
        })
        .catch(function () {
          /* Ratings are optional. */
        });
    }
  }

  /* ---------- Recipe page ---------- */

  function findRecipe(id) {
    for (var i = 0; i < recipes.length; i += 1) {
      if (recipeId(recipes[i]) === id) return recipes[i];
    }
    return null;
  }

  var shownRecipe = null;

  function renderDetail(id) {
    var recipe = findRecipe(id);
    shownRecipe = recipe;

    if (!recipe) {
      if (savedState === "loading") {
        app.innerHTML = '<p class="loading">Opening the recipe…</p>';
        return;
      }
      document.title = "Recipe not found · The Dark Sparrow Eats";
      app.innerHTML =
        '<a class="back" href="#/">' + backArrow() + "All recipes</a>" +
        emptyBlock("That recipe isn't here", "The link may be old, or the recipe was renamed. Browse the full list instead.", '<a class="btn" href="#/">See all recipes</a>');
      return;
    }

    var title = titleOf(recipe);
    document.title = title + " · The Dark Sparrow Eats";
    var cat = categoryOf(recipe);
    var ingredients = stringList(recipe.ingredients);
    var steps = stringList(recipe.steps);
    var notes = str(recipe.notes);
    var image = safeSrc(recipe.image);
    var tags = stringList(recipe.tags);
    var source = safeLink(recipe.source);
    var time = formatTime(recipe.timeMinutes);
    var serves = formatServings(recipe.servings);
    var rid = recipeId(recipe);

    var factItems = [];
    if (time) factItems.push('<div class="fact-box"><dt>Time</dt><dd>' + esc(time) + "</dd></div>");
    if (serves) factItems.push('<div class="fact-box"><dt>Makes</dt><dd>' + esc(serves.replace(/^Serves /, "") + " servings") + "</dd></div>");
    factItems.push('<div class="fact-box"><dt>Ingredients</dt><dd>' + ingredients.length + "</dd></div>");
    factItems.push('<div class="fact-box fact-rating"><dt>Rating</dt><dd><a href="#reviews" data-jump="reviews" class="card-rating" data-rating-for="' + esc(rid) + '">Not rated yet</a></dd></div>');

    var hiddenNote = "";
    if (recipe._hiddenInFile) {
      hiddenNote =
        '<p class="hidden-note">' + ICON_EYE_OFF +
        "<span><strong>Hidden from the public.</strong> Only you can see this recipe. It is marked <code>hidden: true</code> in <code>recipes.js</code>; remove that line to publish it.</span></p>";
    } else if (recipe._hidden) {
      hiddenNote =
        '<p class="hidden-note">' + ICON_EYE_OFF +
        "<span><strong>Hidden from the public.</strong> Only you can see this recipe. Click <strong>Show on site</strong> to publish it again" + (str(recipe.category) ? " under " + esc(str(recipe.category)) : "") + ".</span></p>";
    }

    app.innerHTML =
      '<article class="recipe hue-' + hue(cat) + '">' +
      '<a class="back" href="#/">' + backArrow() + "All recipes</a>" +
      hiddenNote +
      '<header class="recipe-head">' +
      '<p class="recipe-cat"><span class="card-tab">' + esc(cat) + "</span></p>" +
      '<h1 class="recipe-title" tabindex="-1">' + esc(title) + "</h1>" +
      contributorHtml(recipe, rid) +
      (tags.length
        ? '<ul class="tags" aria-label="Tags">' + tags.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>"
        : "") +
      '<dl class="facts">' + factItems.join("") + "</dl>" +
      '<div class="recipe-actions">' +
      '<button type="button" class="btn btn-quiet" data-print="1">' +
      '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.5 7V3h9v4M5.5 14h-2V8.5a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5V14h-2M5.5 11.5h9V17h-9z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>' +
      "Print</button>" +
      '<span class="plan-add" id="plan-add"></span>' +
      (wakeSupported()
        ? '<label class="wake-switch"><input type="checkbox" role="switch" id="wake-toggle"' + (wake.want ? " checked" : "") + ">" +
          '<span class="wake-track" aria-hidden="true"><span class="wake-thumb"></span></span>' +
          "<span>Keep screen on</span></label>"
        : "") +
      (signedIn()
        ? '<a class="btn btn-quiet" href="#/edit/' + esc(encodeURIComponent(rid)) + '">' +
          '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M12.8 4.2l3 3L7.5 15.5l-3.7.7.7-3.7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>' +
          "Edit</a>" +
          (recipe._hiddenInFile || !ownerMode()
            ? ""
            : '<button type="button" class="btn btn-quiet" data-visibility="' + (recipe._hidden ? "show" : "hide") + '">' +
              (recipe._hidden ? ICON_EYE + "Show on site" : ICON_EYE_OFF + "Hide from site") +
              "</button>")
        : "") +
      "</div>" +
      '<p class="wake-msg" id="wake-msg" role="status" hidden></p>' +
      '<p class="visibility-msg" id="visibility-msg" role="status" hidden></p>' +
      "</header>" +
      (image ? '<figure class="photo"><img src="' + esc(image) + '" alt=""></figure>' : "") +
      '<div class="recipe-body">' +
      '<section class="ingredients-box" aria-labelledby="ing-h">' +
      '<div class="box-head"><h2 id="ing-h">Ingredients</h2>' +
      '<button type="button" class="link-btn" data-clear="1" hidden>Clear ticks</button></div>' +
      (ingredients.length
        ? '<ul class="ingredients">' +
          ingredients
            .map(function (item, i) {
              return (
                '<li><label><input type="checkbox" data-ing="' + i + '"><span>' + esc(item) + "</span></label></li>"
              );
            })
            .join("") +
          "</ul>" +
          '<p class="hint">Tick each one off as you set it out.</p>'
        : '<p class="muted">No ingredients listed.</p>') +
      "</section>" +
      '<section class="steps-box" aria-labelledby="steps-h">' +
      '<div class="box-head"><h2 id="steps-h">Method</h2></div>' +
      (steps.length
        ? '<ol class="steps">' +
          steps
            .map(function (step, i) {
              return '<li><button type="button" class="step" data-step="' + i + '" aria-pressed="false"><span class="step-n" aria-hidden="true">' + (i + 1) + '</span><span class="step-text">' + esc(step) + "</span></button></li>";
            })
            .join("") +
          "</ol>" +
          '<p class="hint">Tap a step to mark where you are.</p>'
        : '<p class="muted">No steps written down yet.</p>') +
      (notes ? '<aside class="notes"><h2>Cook’s notes</h2><p>' + esc(notes) + "</p></aside>" : "") +
      (source
        ? '<p class="source">Adapted from <a href="' + esc(source) + '" rel="noopener noreferrer nofollow" target="_blank">' + esc(hostOf(source) || "the original recipe") + "</a></p>"
        : "") +
      "</section>" +
      "</div>" +
      '<p class="owner-edit"><a href="#/edit/' + esc(encodeURIComponent(rid)) + '">Edit this recipe</a> (contributors only)</p>' +
      '<section class="reviews" id="reviews"></section>' +
      "</article>";

    var article = app.querySelector(".recipe");
    var storeKey = "dse-ticks:" + rid;
    var ticks = {};
    try {
      ticks = JSON.parse(sessionStorage.getItem(storeKey) || "{}") || {};
    } catch (e) {
      ticks = {};
    }
    var boxes = article.querySelectorAll("[data-ing]");
    var clearBtn = article.querySelector("[data-clear]");
    function syncTicks() {
      var any = false;
      Array.prototype.forEach.call(boxes, function (b) {
        b.checked = !!ticks[b.getAttribute("data-ing")];
        b.closest("li").classList.toggle("is-done", b.checked);
        if (b.checked) any = true;
      });
      if (clearBtn) clearBtn.hidden = !any;
      try {
        sessionStorage.setItem(storeKey, JSON.stringify(ticks));
      } catch (e) {
        /* Not important. */
      }
    }
    syncTicks();

    article.addEventListener("change", function (e) {
      var b = e.target;
      if (!b.hasAttribute || !b.hasAttribute("data-ing")) return;
      ticks[b.getAttribute("data-ing")] = b.checked;
      syncTicks();
    });
    article.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("button, a[data-jump]") : null;
      if (!t) return;
      if (t.hasAttribute("data-print")) {
        window.print();
      } else if (t.hasAttribute("data-clear")) {
        ticks = {};
        syncTicks();
      } else if (t.hasAttribute("data-step")) {
        var on = t.getAttribute("aria-pressed") !== "true";
        Array.prototype.forEach.call(article.querySelectorAll("[data-step]"), function (s) {
          s.setAttribute("aria-pressed", "false");
          s.parentNode.classList.remove("is-current");
        });
        if (on) {
          t.setAttribute("aria-pressed", "true");
          t.parentNode.classList.add("is-current");
        }
      } else if (t.hasAttribute("data-visibility")) {
        setHidden(rid, t.getAttribute("data-visibility") === "hide", t);
      } else if (t.hasAttribute("data-jump")) {
        e.preventDefault();
        var target = document.getElementById(t.getAttribute("data-jump"));
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    wireContributor(rid);

    var wakeToggle = document.getElementById("wake-toggle");
    if (wakeToggle) {
      wakeToggle.addEventListener("change", function () {
        setWake(wakeToggle.checked);
      });
      if (wake.want) acquireWake();
    }

    if (window.Planner && rid) {
      window.Planner.mountAddButton(document.getElementById("plan-add"), { id: rid, title: titleOf(recipe), category: str(recipe.category) }, function (pid) {
        var r = findRecipe(pid);
        return r ? titleOf(r) : "a recipe";
      });
    }

    var reviewsSection = document.getElementById("reviews");
    if (window.Reviews && rid) {
      try {
        window.Reviews.mountDetail(reviewsSection, rid);
        window.Reviews.paintCards(article.querySelector(".facts"));
      } catch (err) {
        reviewsSection.remove();
      }
    } else if (reviewsSection) {
      reviewsSection.remove();
    }
  }

  /* ---------- Hide or show a recipe ---------- */

  var VISIBILITY_ERRORS = {
    not_signed_in: "Your sign-in has ended. Sign in again, then try once more.",
    not_contributor: "This account can’t hide or show recipes.",
    not_owner: "Only the site owner can hide or show recipes.",
    not_set_up: "Hiding recipes isn’t switched on yet. In Supabase, run supabase/add-recipe-hiding.sql (see README.md).",
    network: "Couldn’t reach the recipe database. Check your connection and try again.",
    failed: "That didn’t save. Refresh the page and try again."
  };

  function setHidden(id, hide, button) {
    var msg = document.getElementById("visibility-msg");
    function say(text) {
      if (!msg) return;
      msg.textContent = text;
      msg.hidden = !text;
    }
    if (!id || !window.Auth || !window.Reviews || !window.Reviews.api) {
      say(VISIBILITY_ERRORS.failed);
      return;
    }
    button.disabled = true;
    say(hide ? "Hiding…" : "Publishing…");
    window.Auth.token()
      .then(function (token) {
        if (!token) {
          var e = new Error("not_signed_in");
          e.key = "not_signed_in";
          throw e;
        }
        return window.Reviews.api("/rpc/owner_set_recipe_hidden", {
          method: "POST",
          token: token,
          body: { p_id: id, p_hidden: hide }
        });
      })
      .then(function (res) {
        if (!res || !res.ok) {
          var e = new Error((res && res.error) || "failed");
          e.key = res && res.error;
          throw e;
        }
        if (hide) hiddenIds[id] = true;
        else delete hiddenIds[id];
        // A hidden recipe added on the site is no longer in the public list,
        // so keep a copy for this contributor.
        var r = findRecipe(id);
        if (hide && r && r._saved && !r._builtIn) {
          saved = saved.filter(function (x) {
            return x.id !== id;
          });
          hiddenSaved = hiddenSaved.filter(function (x) {
            return x.id !== id;
          });
          hiddenSaved.push(r);
        }
        rebuild();
        renderDetail(id);
        var m = document.getElementById("visibility-msg");
        if (m) {
          m.textContent = hide
            ? "Hidden. Visitors no longer see this recipe in the list, in search, or at its link."
            : "Published. Everyone can see this recipe again.";
          m.hidden = false;
        }
      })
      .catch(function (err) {
        var key = (err && err.key) || "";
        if (!key && err && err.kind === "network") key = "network";
        if (!key && err && err.kind === "server" && (err.status === 404 || err.code === "PGRST202")) key = "not_set_up";
        if (!key && err && err.kind === "server" && (err.status === 401 || err.status === 403)) key = "not_signed_in";
        button.disabled = false;
        say(VISIBILITY_ERRORS[key] || VISIBILITY_ERRORS.failed);
      });
  }

  /* ---------- "Contributed by" on the recipe page ---------- */

  function contributorHtml(recipe, rid) {
    var name = recipe._contributor;
    var owner = ownerMode() && rid;
    if (!name && !owner) return "";
    var detail = owner ? contribDetails[rid] : null;
    var added = "";
    if (detail && detail.addedBy) {
      var when = detail.addedAt ? new Date(detail.addedAt) : null;
      added =
        '<span class="contrib-added">Added by ' + esc(detail.addedBy) +
        (when && !isNaN(when) ? " on " + esc(when.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })) : "") +
        " · only you see this</span>";
    }
    return (
      '<div class="contrib" id="contrib">' +
      (name
        ? '<p class="contrib-line">Contributed by <strong>' + esc(name) + "</strong></p>"
        : '<p class="contrib-line contrib-empty">No contributor set</p>') +
      (owner
        ? '<button type="button" class="link-btn contrib-edit" id="contrib-edit">' + (name ? "Change" : "Add contributor") + "</button>"
        : "") +
      added +
      (owner
        ? '<form class="contrib-form" id="contrib-form" hidden>' +
          '<label class="sr-only" for="contrib-input">Contributed by</label>' +
          '<input id="contrib-input" maxlength="80" autocomplete="off" placeholder="e.g. Grandma Garro" value="' + esc(name) + '">' +
          '<button type="submit" class="btn btn-small">Save</button>' +
          '<button type="button" class="link-btn" id="contrib-cancel">Cancel</button>' +
          '<p class="form-msg" id="contrib-msg" role="status" aria-live="polite"></p>' +
          "</form>"
        : "") +
      "</div>"
    );
  }

  /* Contributor names arrive after the page is drawn; update just that line. */
  function repaintContributor() {
    var r = shownRecipe;
    var title = app.querySelector(".recipe-title");
    if (!r || !title) return;
    var old = document.getElementById("contrib");
    if (old) old.remove();
    title.insertAdjacentHTML("afterend", contributorHtml(r, recipeId(r)));
    wireContributor(recipeId(r));
  }

  /* A contributor name that didn't save with the recipe, shown once on the
     recipe page so it can be tried again there. */
  var pendingContribMsg = "";

  function wireContributor(rid) {
    var edit = document.getElementById("contrib-edit");
    var form = document.getElementById("contrib-form");
    var pending = pendingContribMsg;
    pendingContribMsg = "";
    if (!edit || !form) return;
    var input = document.getElementById("contrib-input");
    var msg = document.getElementById("contrib-msg");
    edit.addEventListener("click", function () {
      form.hidden = false;
      edit.hidden = true;
      input.focus();
      input.select();
    });
    document.getElementById("contrib-cancel").addEventListener("click", function () {
      form.hidden = true;
      edit.hidden = false;
      input.value = contribNames[rid] || "";
      msg.textContent = "";
    });
    if (pending) {
      form.hidden = false;
      edit.hidden = true;
      msg.className = "form-msg is-error";
      msg.textContent = "The recipe saved, but not the contributor name: " + pending;
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      msg.className = "form-msg";
      msg.textContent = "Saving…";
      saveContributor(rid, input.value)
        .then(function () {
          renderDetail(rid);
        })
        .catch(function (err) {
          btn.disabled = false;
          msg.className = "form-msg is-error";
          msg.textContent = err.message;
        });
    });
  }

  /* ---------- Keep screen on while cooking (Screen Wake Lock) ----------
     The choice lasts for this browser tab, so the next recipe opened stays
     on too. The lock is let go when leaving recipe pages; the browser also
     lets go when the tab is hidden, so it's taken again on return. */

  var WAKE_STORE = "dse-wake";
  var wake = { want: false, lock: null };
  try {
    wake.want = sessionStorage.getItem(WAKE_STORE) === "1";
  } catch (e) {
    /* Not important. */
  }

  function wakeSupported() {
    return !!(navigator.wakeLock && navigator.wakeLock.request);
  }

  function wakeUI(message) {
    var box = document.getElementById("wake-toggle");
    if (box) box.checked = wake.want;
    var msg = document.getElementById("wake-msg");
    if (msg) {
      msg.textContent = message || "";
      msg.hidden = !message;
    }
  }

  function acquireWake() {
    if (!wake.want || wake.lock || !wakeSupported() || document.visibilityState !== "visible") return;
    navigator.wakeLock
      .request("screen")
      .then(function (lock) {
        if (!wake.want || current.name !== "detail") {
          lock.release().catch(function () {});
          return;
        }
        wake.lock = lock;
        lock.addEventListener("release", function () {
          if (wake.lock === lock) wake.lock = null;
        });
        wakeUI("");
      })
      .catch(function () {
        wake.want = false;
        try {
          sessionStorage.removeItem(WAKE_STORE);
        } catch (e) {
          /* Not important. */
        }
        wakeUI("This device didn’t allow it. Battery saver can block keeping the screen on.");
      });
  }

  function releaseWake() {
    var lock = wake.lock;
    wake.lock = null;
    if (lock) lock.release().catch(function () {});
  }

  function setWake(on) {
    wake.want = !!on;
    try {
      if (on) sessionStorage.setItem(WAKE_STORE, "1");
      else sessionStorage.removeItem(WAKE_STORE);
    } catch (e) {
      /* Not important. */
    }
    wakeUI("");
    if (on) acquireWake();
    else releaseWake();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && current.name === "detail") acquireWake();
  });

  function backArrow() {
    return '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M11.5 5L6.5 10l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /* ---------- Family album ---------- */

  function familyPhotos() {
    var list = Array.isArray(window.FAMILY_PHOTOS) ? window.FAMILY_PHOTOS : [];
    return list.filter(function (p) {
      return p && typeof p.src === "string" && p.src;
    });
  }

  function featuredPhoto() {
    var list = familyPhotos();
    for (var i = 0; i < list.length; i++) if (list[i].feature) return list[i];
    return list[0] || null;
  }

  function photoImg(p, eager) {
    return (
      '<img src="' + esc(p.src) + '"' +
      (p.width && p.height ? ' width="' + Number(p.width) + '" height="' + Number(p.height) + '"' : "") +
      ' alt="' + esc(p.alt || "") + '" loading="' + (eager ? "eager" : "lazy") + '" decoding="async">'
    );
  }

  function introPhoto() {
    var p = featuredPhoto();
    if (!p) return "";
    return (
      '<figure class="intro-photo is-family">' +
      '<a class="intro-photo-link" href="#/family">' + photoImg(p, true) + "</a>" +
      '<figcaption><a href="#/family">From the family album</a></figcaption>' +
      "</figure>"
    );
  }

  function renderFamily() {
    document.title = "Family album · The Dark Sparrow Eats";
    var list = familyPhotos();
    app.innerHTML =
      '<a class="back" href="#/">' + backArrow() + "All recipes</a>" +
      '<section class="album">' +
      '<header class="album-head">' +
      '<h1 class="album-title">Family album</h1>' +
      '<p class="album-sub">The people these recipes were cooked for, and by.</p>' +
      "</header>" +
      (list.length
        ? '<ul class="album-grid">' +
          list
            .map(function (p, i) {
              return (
                '<li class="album-item' + (i === 0 ? " is-lead" : "") + '">' +
                '<figure class="album-photo">' +
                '<a href="' + esc(p.src) + '" target="_blank" rel="noopener" aria-label="Open full size photo in a new tab">' +
                photoImg(p, i === 0) +
                "</a>" +
                (p.caption ? "<figcaption>" + esc(p.caption) + "</figcaption>" : "") +
                "</figure>" +
                "</li>"
              );
            })
            .join("") +
          "</ul>"
        : emptyBlock("No photos yet", "Family photos will show up here.")) +
      "</section>";
  }

  /* ---------- Add a recipe ---------- */

  function renderAdd() {
    document.title = "Add a recipe · The Dark Sparrow Eats";
    if (needSignIn("#/add", "Reading recipes needs no account. To add a recipe, sign in with the account you were invited to.")) return;
    if (!window.AddRecipe) {
      app.innerHTML = emptyBlock("Adding recipes isn't available", "The add-recipe script didn't load. Refresh the page and try again.");
      return;
    }
    // Wait for the category list, so the drop-down is the right one.
    if (!allLoaded) {
      app.innerHTML = '<p class="loading">Opening the form…</p>';
      return;
    }
    window.AddRecipe.mount(app, {
      categories: categoryChoices(),
      canEditCategories: ownerMode(),
      canSetContributor: ownerMode(),
      saveContributor: saveContributor,
      takenIds: allRecipes.map(recipeId),
      onSaved: function (recipe, contribProblem) {
        pendingContribMsg = contribProblem || "";
        saved.unshift(recipe);
        rebuild();
        location.hash = "#/recipe/" + encodeURIComponent(recipe.id);
      }
    });
  }

  /* ---------- Edit a recipe ---------- */

  function renderEdit(id) {
    var recipe = findRecipe(id);
    // Wait for the saved recipes, so an earlier edit isn't overwritten by the
    // version in recipes.js.
    if (savedState === "loading") {
      app.innerHTML = '<p class="loading">Opening the recipe…</p>';
      return;
    }
    if (!recipe) {
      document.title = "Recipe not found · The Dark Sparrow Eats";
      app.innerHTML =
        '<a class="back" href="#/">' + backArrow() + "All recipes</a>" +
        emptyBlock("That recipe isn't here", "The link may be old, or the recipe was renamed.", '<a class="btn" href="#/">See all recipes</a>');
      return;
    }
    if (savedState === "failed" || !window.AddRecipe) {
      app.innerHTML =
        '<a class="back" href="#/recipe/' + esc(encodeURIComponent(id)) + '">' + backArrow() + "Back to the recipe</a>" +
        emptyBlock("Editing isn't available right now", "The recipe database couldn't be reached. Check your connection, then refresh the page.");
      return;
    }
    if (needSignIn("#/edit/" + encodeURIComponent(id), "To edit “" + titleOf(recipe) + "”, sign in with the account you were invited to.")) return;
    document.title = "Edit " + titleOf(recipe) + " · The Dark Sparrow Eats";
    window.AddRecipe.mount(app, {
      categories: categoryChoices(),
      canEditCategories: ownerMode(),
      canSetContributor: ownerMode(),
      saveContributor: saveContributor,
      edit: {
        id: recipeId(recipe),
        title: titleOf(recipe),
        category: canonicalCategory(recipe.category),
        contributor: recipe._contributor || "",
        tags: stringList(recipe.tags),
        timeMinutes: Number(recipe.timeMinutes) > 0 ? Number(recipe.timeMinutes) : "",
        servings: recipe.servings == null ? "" : String(recipe.servings),
        image: safeSrc(recipe.image) || "",
        ingredients: stringList(recipe.ingredients),
        steps: stringList(recipe.steps),
        notes: str(recipe.notes),
        source: safeLink(recipe.source) || "",
        _added: recipe._builtIn ? "" : recipe._added || ""
      },
      onSaved: function (updated, contribProblem) {
        pendingContribMsg = contribProblem || "";
        saved = saved.filter(function (r) {
          return r.id !== updated.id;
        });
        saved.push(updated);
        rebuild();
        location.hash = "#/recipe/" + encodeURIComponent(updated.id);
      }
    });
  }


  /* ---------- Edit the category list (site owner only) ---------- */

  var CATEGORY_ERRORS = {
    not_signed_in: "Your sign-in has ended. Sign in again, then save.",
    not_contributor: "This account can’t change categories.",
    not_owner: "Only the site owner can change categories.",
    invalid_name: "Each category needs a name of 60 characters or fewer.",
    reserved_name: "“Hidden” and “Other” are used by the site itself. Pick another name.",
    duplicate_name: "Two categories have the same name. Change or remove one.",
    invalid_input: "That list couldn’t be saved. Keep at least one category, and no more than 40.",
    not_set_up: "The category list isn’t switched on yet. In Supabase, run supabase/add-categories.sql (see README.md).",
    network: "Couldn’t reach the recipe database. Check your connection and try again.",
    failed: "That didn’t save. Refresh the page and try again."
  };

  /* How many recipes (hidden ones included) use each category. */
  function categoryCounts() {
    var counts = Object.create(null);
    allRecipes.forEach(function (r) {
      var c = canonicalCategory(r.category);
      if (c) counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  }

  function renderCategories() {
    document.title = "Edit categories · The Dark Sparrow Eats";
    if (needSignIn("#/categories", "Sign in to edit the category list.")) return;
    if (!allLoaded) {
      app.innerHTML = '<p class="loading">Opening the category list…</p>';
      return;
    }
    var back = '<a class="back" href="#/">' + backArrow() + "All recipes</a>";
    if (!ownerMode()) {
      app.innerHTML = back + emptyBlock("Only the site owner can edit categories", "Ask Art if a category is missing from the list.");
      return;
    }
    if (!catList) {
      app.innerHTML = back + emptyBlock("The category list isn’t switched on yet", "In Supabase, open SQL Editor, paste <code>supabase/add-categories.sql</code>, and click Run. Then refresh this page.");
      return;
    }

    var counts = categoryCounts();
    var rows = catList.map(function (c) {
      return { name: c.name, was: c.name };
    });

    app.innerHTML =
      back +
      '<section class="cat-editor">' +
      '<h1 class="add-title">Edit categories</h1>' +
      '<p class="add-sub">These are the only categories offered when anyone adds or edits a recipe, in this order. Only you can see this page.</p>' +
      '<ul class="cat-rows" id="cat-rows"></ul>' +
      '<form class="cat-add" id="cat-add" novalidate>' +
      '<label class="field-label" for="cat-new">Add a category</label>' +
      '<div class="link-row"><input id="cat-new" maxlength="60" autocomplete="off" placeholder="e.g. Desserts">' +
      '<button type="submit" class="btn btn-quiet">Add</button></div>' +
      "</form>" +
      '<div id="cat-loose"></div>' +
      '<ul class="cat-help">' +
      "<li><strong>Rename</strong> by typing over a name. Recipes in that category move with it.</li>" +
      "<li><strong>Remove</strong> works once no recipe uses the category; move those recipes first.</li>" +
      "<li>Nothing changes until you click <strong>Save categories</strong>.</li>" +
      "</ul>" +
      '<div class="form-foot">' +
      '<button type="button" class="btn" id="cat-save">Save categories</button>' +
      '<a class="link-btn" href="#/">Cancel</a>' +
      '<p class="form-msg" id="cat-msg" role="status" aria-live="polite"></p>' +
      "</div>" +
      "</section>";

    var list = document.getElementById("cat-rows");
    var msg = document.getElementById("cat-msg");
    var saveBtn = document.getElementById("cat-save");
    var newInput = document.getElementById("cat-new");

    function say(text, kind) {
      msg.textContent = text || "";
      msg.className = "form-msg" + (kind ? " is-" + kind : "");
    }

    function used(row) {
      return row.was ? counts[row.was] || 0 : 0;
    }

    function paint(focusIndex, focusSel) {
      list.innerHTML = rows
        .map(function (row, i) {
          var n = used(row);
          return (
            '<li class="cat-row" data-i="' + i + '">' +
            '<span class="cat-pos" aria-hidden="true">' + (i + 1) + "</span>" +
            '<label class="sr-only" for="cat-name-' + i + '">Category ' + (i + 1) + " name</label>" +
            '<input id="cat-name-' + i + '" class="cat-name" maxlength="60" value="' + esc(row.name) + '">' +
            '<span class="cat-count">' + (n ? n + (n === 1 ? " recipe" : " recipes") : "No recipes") +
            (row.was && row.was !== row.name.trim() ? ' · was “' + esc(row.was) + '”' : "") +
            (row.was ? "" : " · new") +
            "</span>" +
            '<span class="cat-btns">' +
            '<button type="button" class="icon-btn" data-move="-1" aria-label="Move ' + esc(row.name) + ' up"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
            '<button type="button" class="icon-btn" data-move="1" aria-label="Move ' + esc(row.name) + ' down"' + (i === rows.length - 1 ? " disabled" : "") + ">↓</button>" +
            '<button type="button" class="link-btn cat-remove" data-remove="1"' +
            (n ? ' disabled title="' + n + (n === 1 ? " recipe uses" : " recipes use") + ' this category"' : "") +
            ">Remove</button>" +
            "</span>" +
            "</li>"
          );
        })
        .join("");
      if (focusIndex != null) {
        var li = list.querySelector('[data-i="' + focusIndex + '"]');
        var el = li && li.querySelector(focusSel || ".cat-name");
        if (el && !el.disabled) el.focus();
      }
    }

    /* Categories some recipe uses that aren't in the list, with a quick add. */
    function paintLoose() {
      var inList = Object.create(null);
      rows.forEach(function (r) {
        if (r.was) inList[r.was] = true;
        inList[r.name.trim()] = true;
      });
      var loose = Object.keys(counts).filter(function (c) {
        return !inList[c];
      });
      document.getElementById("cat-loose").innerHTML = loose.length
        ? '<div class="cat-loose"><p><strong>Used by recipes but not in the list:</strong></p><ul>' +
          loose
            .map(function (c) {
              return (
                "<li>" + esc(c) + " (" + counts[c] + (counts[c] === 1 ? " recipe" : " recipes") + ") " +
                '<button type="button" class="link-btn" data-adopt="' + esc(c) + '">Add to list</button></li>'
              );
            })
            .join("") +
          "</ul><p class=\"muted\">To move those recipes into a category that’s already in the list, edit each recipe instead.</p></div>"
        : "";
    }

    function refresh(focusIndex, focusSel) {
      paint(focusIndex, focusSel);
      paintLoose();
    }
    refresh();

    list.addEventListener("input", function (e) {
      if (!e.target.classList.contains("cat-name")) return;
      var i = Number(e.target.closest(".cat-row").getAttribute("data-i"));
      rows[i].name = e.target.value;
      var note = e.target.parentNode.querySelector(".cat-count");
      var n = used(rows[i]);
      note.textContent =
        (n ? n + (n === 1 ? " recipe" : " recipes") : "No recipes") +
        (rows[i].was && rows[i].was !== rows[i].name.trim() ? " · was “" + rows[i].was + "”" : "") +
        (rows[i].was ? "" : " · new");
      say("");
    });

    list.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (!btn || btn.disabled) return;
      var i = Number(btn.closest(".cat-row").getAttribute("data-i"));
      if (btn.hasAttribute("data-move")) {
        var j = i + Number(btn.getAttribute("data-move"));
        if (j < 0 || j >= rows.length) return;
        var t = rows[i];
        rows[i] = rows[j];
        rows[j] = t;
        refresh(j, '[data-move="' + btn.getAttribute("data-move") + '"]');
      } else if (btn.hasAttribute("data-remove")) {
        rows.splice(i, 1);
        refresh(Math.min(i, rows.length - 1));
      }
      say("");
    });

    function addName(name) {
      name = name.trim();
      if (!name) return false;
      var low = name.toLowerCase();
      if (low === "hidden" || low === "other") {
        say(CATEGORY_ERRORS.reserved_name, "error");
        return false;
      }
      var clash = rows.some(function (r) {
        return r.name.trim().toLowerCase() === low;
      });
      if (clash) {
        say("“" + name + "” is already in the list.", "error");
        return false;
      }
      // A name some recipes already use keeps those recipes with it.
      rows.push({ name: name, was: counts[name] ? name : "" });
      refresh();
      say("Added “" + name + "”. Click Save categories to keep it.");
      return true;
    }

    document.getElementById("cat-add").addEventListener("submit", function (e) {
      e.preventDefault();
      if (addName(newInput.value)) newInput.value = "";
      newInput.focus();
    });

    document.getElementById("cat-loose").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-adopt]") : null;
      if (btn) addName(btn.getAttribute("data-adopt"));
    });

    saveBtn.addEventListener("click", function () {
      var seen = Object.create(null);
      for (var i = 0; i < rows.length; i++) {
        var name = rows[i].name.trim();
        var low = name.toLowerCase();
        var input = document.getElementById("cat-name-" + i);
        if (!name || name.length > 60) {
          say(CATEGORY_ERRORS.invalid_name, "error");
          if (input) input.focus();
          return;
        }
        if (low === "hidden" || low === "other") {
          say(CATEGORY_ERRORS.reserved_name, "error");
          if (input) input.focus();
          return;
        }
        if (seen[low]) {
          say("“" + name + "” is in the list twice. Change or remove one.", "error");
          if (input) input.focus();
          return;
        }
        seen[low] = true;
      }
      if (!rows.length) {
        say("Keep at least one category.", "error");
        return;
      }
      saveBtn.disabled = true;
      say("Saving…");
      var payload = rows.map(function (r) {
        return { name: r.name.trim(), was: r.was || null };
      });
      window.Auth.token()
        .then(function (token) {
          if (!token) {
            var e = new Error("not_signed_in");
            e.key = "not_signed_in";
            throw e;
          }
          return window.Reviews.api("/rpc/owner_save_categories", { method: "POST", token: token, body: { p_list: payload } });
        })
        .then(function (res) {
          if (!res || !res.ok) {
            var e = new Error((res && res.error) || "failed");
            e.key = (res && res.error) || "failed";
            throw e;
          }
          // Renames moved recipes saved on the site, so load everything again.
          return loadSaved();
        })
        .then(function () {
          renderCategories();
          var m = document.getElementById("cat-msg");
          if (m) {
            m.textContent = "Saved. The new list is in the Category drop-down now.";
            m.className = "form-msg is-ok";
          }
        })
        .catch(function (err) {
          var key = (err && err.key) || "";
          if (!key && err && err.kind === "network") key = "network";
          if (!key && err && err.kind === "server" && (err.status === 404 || err.code === "PGRST202")) key = "not_set_up";
          if (!key && err && err.kind === "server" && (err.status === 401 || err.status === 403)) key = "not_signed_in";
          saveBtn.disabled = false;
          say(CATEGORY_ERRORS[key] || CATEGORY_ERRORS.failed, "error");
        });
    });
  }

  /* ---------- Meal plan and shopping list (planner.js) ---------- */

  function plannerRecipes() {
    return recipes
      .map(function (r) {
        return {
          id: recipeId(r),
          title: titleOf(r),
          category: str(r.category) || "Other",
          ingredients: stringList(r.ingredients)
        };
      })
      .filter(function (r) {
        return r.id;
      });
  }

  function renderPlanner(kind, week) {
    if (!window.Planner || !window.Ingredients) {
      app.innerHTML = emptyBlock("The meal planner isn't available", "Its script didn't load. Refresh the page and try again.");
      return;
    }
    var ctx = { recipes: plannerRecipes(), loading: savedState === "loading", week: week };
    if (kind === "plan") window.Planner.mountPlan(app, ctx);
    else window.Planner.mountShopping(app, ctx);
  }

  /* ---------- Routing ---------- */

  var current = { name: "list" };

  function parseRoute() {
    var hash = location.hash.replace(/^#/, "");
    if (!hash || hash === "/") return { name: "list" };
    try {
      hash = decodeURIComponent(hash);
    } catch (err) {
      /* Keep the raw hash if it is not valid encoding. */
    }
    if (/^\/?add\/?$/.test(hash)) return { name: "add" };
    if (/^\/?family\/?$/.test(hash)) return { name: "family" };
    if (/^\/?categories\/?$/.test(hash)) return { name: "categories" };
    var si = hash.match(/^\/?signin(?:\/(plan|shopping))?\/?$/);
    if (si) return { name: "signin", next: si[1] || "" };
    var plan = hash.match(/^\/?(plan|shopping)(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/);
    if (plan) return { name: plan[1], week: plan[2] || "" };
    if (/^\/?set-password\/?$/.test(hash)) return { name: "set-password" };
    var match = hash.match(/^\/?recipe\/([^/]+)\/?$/);
    if (match) return { name: "detail", id: match[1] };
    var edit = hash.match(/^\/?edit\/([^/]+)\/?$/);
    if (edit) return { name: "edit", id: edit[1] };
    return { name: "list" };
  }

  function markNav() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-nav]"), function (a) {
      var nav = a.getAttribute("data-nav");
      var on = nav === current.name || (nav === "plan" && current.name === "shopping");
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function route() {
    var prev = current.name;
    current = parseRoute();
    if (current.name !== "detail") releaseWake();
    document.body.setAttribute("data-view", current.name);
    markNav();
    if (current.name === "detail") renderDetail(current.id);
    else if (current.name === "add") renderAdd();
    else if (current.name === "family") renderFamily();
    else if (current.name === "categories") renderCategories();
    else if (current.name === "edit") renderEdit(current.id);
    else if (current.name === "plan" || current.name === "shopping") renderPlanner(current.name, current.week);
    else if (current.name === "signin") {
      if (window.Auth)
        window.Auth.renderSignIn(
          app,
          current.next
            ? { next: "#/" + current.next, reason: "Sign in to keep your meal plan and shopping list on your account, so they’re the same on your phone and computer." }
            : { next: "#/add" }
        );
      else renderList();
    } else if (current.name === "set-password") {
      if (window.Auth) window.Auth.renderSetPassword(app);
      else renderList();
    } else renderList();
    window.scrollTo(0, 0);
    if (prev !== current.name || current.name === "detail") {
      var h = app.querySelector("h1");
      if (h && current.name !== "list") {
        h.setAttribute("tabindex", "-1");
        h.focus({ preventScroll: true });
      }
    }
  }

  app.addEventListener(
    "error",
    function (event) {
      var target = event.target;
      if (!target || target.tagName !== "IMG") return;
      var frame = target.closest("figure, .card-photo");
      if (frame) frame.remove();
    },
    true
  );

  window.addEventListener("hashchange", route);
  rebuild();
  route();

  /* Signing in or out changes whether hidden recipes are shown. */
  if (window.Auth && window.Auth.onChange) {
    var wasSignedIn = signedIn();
    window.Auth.onChange(function () {
      var now = signedIn();
      if (now === wasSignedIn) return;
      wasSignedIn = now;
      loadHiddenSaved().then(loadContributorDetails).then(function () {
        rebuild();
        if (current.name === "list") {
          paintTabs();
          paintResults();
        } else if (current.name === "detail") {
          renderDetail(current.id);
        } else if (current.name === "categories") {
          renderCategories();
        }
      });
    });
  }

  loadSaved().then(function () {
    if (current.name === "list") {
      paintTabs();
      paintResults();
    } else if (current.name === "detail") {
      // Re-draw in case this recipe has an edited version.
      if (!app.querySelector(".recipe") || findRecipe(current.id) !== shownRecipe) renderDetail(current.id);
      else repaintContributor();
    } else if (current.name === "edit") {
      renderEdit(current.id);
    } else if ((current.name === "add" || current.name === "categories") && app.querySelector(".loading")) {
      if (current.name === "add") renderAdd();
      else renderCategories();
    } else if (current.name === "plan" || current.name === "shopping") {
      // Saved recipes are in now; redraw so planned ones show their names.
      renderPlanner(current.name, current.week);
    }
  });
})();
