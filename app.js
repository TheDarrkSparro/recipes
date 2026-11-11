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
  var recipes = local.slice();

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

  function rebuild() {
    var ids = Object.create(null);
    local.forEach(function (r) {
      ids[recipeId(r)] = true;
    });
    recipes = local.concat(
      saved.filter(function (r) {
        return !ids[r.id];
      })
    );
  }

  function loadSaved() {
    if (!window.Reviews || !window.Reviews.enabled || !window.Reviews.api) {
      savedState = "failed";
      return Promise.resolve();
    }
    return window.Reviews.api(
      "/recipes?select=id,title,category,tags,time_minutes,servings,image,ingredients,steps,notes,source_url,created_at&order=created_at.desc&limit=500"
    )
      .then(function (rows) {
        saved = (Array.isArray(rows) ? rows : []).filter(function (r) {
          return r && r.id && r.title;
        }).map(fromRow);
        savedState = "ready";
        rebuild();
      })
      .catch(function () {
        savedState = "failed";
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
    "Pickles": "teal"
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
      var c = str(recipe.category) || "Other";
      if (!counts[c]) {
        counts[c] = 0;
        list.push(c);
      }
      counts[c] += 1;
    });
    list.sort(function (a, b) {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    return list.map(function (name) {
      return { name: name, count: counts[name] };
    });
  }

  function categoryOf(recipe) {
    return str(recipe.category) || "Other";
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
    var cls = "card hue-" + hue(cat);
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
      '<figure class="intro-photo">' +
      '<img src="https://images.unsplash.com/photo-1469014221409-dea4fc6a6b2e?auto=format&fit=crop&w=900&q=75" width="900" height="600" alt="A crusty loaf of bread on a wooden board with a bread knife" loading="eager" decoding="async">' +
      '<figcaption>Photo: <a href="https://unsplash.com/photos/VWQM9MbZDDw" target="_blank" rel="noopener">Arturro on Unsplash</a></figcaption>' +
      "</figure>" +
      "</section>" +
      '<nav class="tabs" id="tabs" aria-label="Categories">' + tabsHtml() + "</nav>" +
      '<div class="toolbar">' +
      '<p class="count" id="count" aria-live="polite"></p>' +
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

  function renderDetail(id) {
    var recipe = findRecipe(id);

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

    app.innerHTML =
      '<article class="recipe hue-' + hue(cat) + '">' +
      '<a class="back" href="#/">' + backArrow() + "All recipes</a>" +
      '<header class="recipe-head">' +
      '<p class="recipe-cat"><span class="card-tab">' + esc(cat) + "</span></p>" +
      '<h1 class="recipe-title" tabindex="-1">' + esc(title) + "</h1>" +
      (tags.length
        ? '<ul class="tags" aria-label="Tags">' + tags.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>"
        : "") +
      '<dl class="facts">' + factItems.join("") + "</dl>" +
      '<div class="recipe-actions">' +
      '<button type="button" class="btn btn-quiet" data-print="1">' +
      '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.5 7V3h9v4M5.5 14h-2V8.5a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5V14h-2M5.5 11.5h9V17h-9z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>' +
      "Print</button>" +
      "</div>" +
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
      } else if (t.hasAttribute("data-jump")) {
        e.preventDefault();
        var target = document.getElementById(t.getAttribute("data-jump"));
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

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

  function backArrow() {
    return '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M11.5 5L6.5 10l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /* ---------- Add a recipe ---------- */

  function renderAdd() {
    document.title = "Add a recipe · The Dark Sparrow Eats";
    if (!window.AddRecipe) {
      app.innerHTML = emptyBlock("Adding recipes isn't available", "The add-recipe script didn't load. Refresh the page and try again.");
      return;
    }
    window.AddRecipe.mount(app, {
      categories: categories()
        .map(function (c) {
          return c.name;
        })
        .filter(function (n) {
          return n !== "Other";
        }),
      takenIds: recipes.map(recipeId),
      onSaved: function (recipe) {
        saved.unshift(recipe);
        rebuild();
        location.hash = "#/recipe/" + encodeURIComponent(recipe.id);
      }
    });
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
    var match = hash.match(/^\/?recipe\/([^/]+)\/?$/);
    if (match) return { name: "detail", id: match[1] };
    return { name: "list" };
  }

  function markNav() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-nav]"), function (a) {
      var on = a.getAttribute("data-nav") === current.name;
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function route() {
    var prev = current.name;
    current = parseRoute();
    document.body.setAttribute("data-view", current.name);
    markNav();
    if (current.name === "detail") renderDetail(current.id);
    else if (current.name === "add") renderAdd();
    else renderList();
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
  route();

  loadSaved().then(function () {
    if (current.name === "list" && saved.length) {
      paintTabs();
      paintResults();
    } else if (current.name === "detail" && !app.querySelector(".recipe")) {
      renderDetail(current.id);
    }
  });
})();
