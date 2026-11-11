/*
 * "Add a recipe" page. Paste a link and the site reads the recipe from that
 * page (through /api/import on Cloudflare), or type one in. Saving needs the
 * owner code, which is checked by the database (see supabase/add-recipes-table.sql).
 */
(function () {
  "use strict";

  var CODE_STORE = "dse-owner-code";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function readCode() {
    try {
      return localStorage.getItem(CODE_STORE) || "";
    } catch (e) {
      return "";
    }
  }

  function storeCode(code, keep) {
    try {
      if (keep && code) localStorage.setItem(CODE_STORE, code);
      else localStorage.removeItem(CODE_STORE);
    } catch (e) {
      /* Not important. */
    }
  }

  function slug(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70)
      .replace(/-+$/g, "") || "recipe";
  }

  function lines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map(function (l) {
        return l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
      })
      .filter(Boolean);
  }

  /* Match the page's category to one already on the site where it's obvious. */
  var CATEGORY_HINTS = [
    [/breakfast|brunch|pancake|waffle/i, "Breakfast"],
    [/soup|stew|chili|chowder/i, "Soups & Stews"],
    [/bread|loaf|roll|biscuit/i, "Bread"],
    [/side|salad|vegetable/i, "Sides"],
    [/spice|seasoning|rub|blend/i, "Spice Blends"],
    [/pickl|ferment|preserv|canning/i, "Pickles"],
    [/main|dinner|entr[eé]e|supper|lunch/i, "Mains"]
  ];

  function pickCategory(found, existing) {
    var text = String(found || "").trim();
    if (!text) return "";
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].toLowerCase() === text.toLowerCase()) return existing[i];
    }
    for (var j = 0; j < CATEGORY_HINTS.length; j++) {
      if (CATEGORY_HINTS[j][0].test(text) && existing.indexOf(CATEGORY_HINTS[j][1]) !== -1) return CATEGORY_HINTS[j][1];
    }
    return text.slice(0, 60);
  }

  var IMPORT_ERRORS = {
    bad_url: "That doesn’t look like a full web address. Copy the link from your browser’s address bar; it should start with https://.",
    unreachable: "The site didn’t answer. Check the link, or fill in the recipe yourself below.",
    blocked: "That site doesn’t let other sites read its pages. Fill in the recipe yourself below; the link is already in the Source box.",
    not_html: "That link isn’t a web page. Use the link to the recipe page itself.",
    no_recipe: "That page doesn’t include recipe details we can read. The title and link are filled in; add the ingredients and method yourself.",
    network: "The recipe reader isn’t available right now. Fill in the recipe yourself below, or try again in a minute."
  };

  var SAVE_ERRORS = {
    wrong_code: "That owner code isn’t right. Check it and try again.",
    too_many_attempts: "Too many wrong codes were tried, so saving is paused for 10 minutes.",
    missing_title: "Give the recipe a title.",
    invalid_input: "Something is too long or not in the right form. Photo links must start with https://, and steps can be up to about 40,000 characters in all.",
    network: "Couldn’t reach the recipe database. Check your connection and try again."
  };

  function importRecipe(url) {
    return fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url: url })
    })
      .catch(function () {
        return null;
      })
      .then(function (res) {
        if (!res) return { ok: false, error: "network" };
        var type = res.headers.get("content-type") || "";
        if (type.indexOf("application/json") === -1) return { ok: false, error: "network" };
        return res.json().catch(function () {
          return { ok: false, error: "network" };
        });
      });
  }

  function mount(root, ctx) {
    var cats = ctx.categories || [];
    var taken = Object.create(null);
    (ctx.takenIds || []).forEach(function (id) {
      taken[id] = true;
    });
    var savedCode = readCode();

    root.innerHTML =
      '<section class="add">' +
      '<a class="back" href="#/"><svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M11.5 5L6.5 10l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>All recipes</a>' +
      '<h1 class="add-title">Add a recipe</h1>' +
      '<p class="add-sub">Paste a link to a recipe page and the details fill in for you to check. Or type a family recipe in by hand.</p>' +

      '<form class="link-form" id="link-form" novalidate>' +
      '<label class="field-label" for="link">Recipe link</label>' +
      '<div class="link-row">' +
      '<input id="link" type="url" inputmode="url" placeholder="https://" autocomplete="off" spellcheck="false">' +
      '<button class="btn" type="submit" id="link-btn">Get recipe</button>' +
      "</div>" +
      '<p class="form-msg" id="link-msg" role="status" aria-live="polite"></p>' +
      '<button type="button" class="link-btn" id="manual">Type a recipe in instead</button>' +
      "</form>" +

      '<form class="recipe-form" id="recipe-form" novalidate hidden>' +
      '<div class="form-head"><h2>Check the details</h2><p class="muted">Change anything you like before saving. One ingredient or step per line.</p></div>' +
      '<div class="grid-2">' +
      field("Title", '<input name="title" required maxlength="200">', "wide") +
      field("Category",
        '<select name="category">' +
        '<option value="">Choose a category</option>' +
        cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("") +
        '<option value="__new">New category…</option>' +
        "</select>" +
        '<input name="newCategory" maxlength="60" placeholder="New category name" hidden>') +
      field("Tags", '<input name="tags" placeholder="e.g. beef, slow cooker" maxlength="300">', "", "Separate with commas.") +
      field("Total time (minutes)", '<input name="timeMinutes" type="number" min="1" max="10000" inputmode="numeric">') +
      field("Servings", '<input name="servings" maxlength="20" placeholder="e.g. 4 or 6-8">') +
      field("Ingredients", '<textarea name="ingredients" rows="9"></textarea>', "wide") +
      field("Method", '<textarea name="steps" rows="10"></textarea>', "wide",
        "Steps copied from another site are that cook’s own words. It’s good practice to rewrite them in yours; the source is credited on the recipe page either way.") +
      field("Cook’s notes", '<textarea name="notes" rows="3" maxlength="4000"></textarea>', "wide") +
      field("Photo link", '<input name="image" type="url" placeholder="https://" maxlength="1000">', "wide",
        "Optional. Use a link to your own photo; pictures on other sites belong to their owners.") +
      field("Source", '<input name="source" type="url" placeholder="https://" maxlength="1000">', "wide",
        "Where the recipe came from. Shown as “Adapted from” on the recipe page.") +
      "</div>" +
      '<div class="save-row">' +
      field("Owner code", '<input name="code" type="password" autocomplete="off" maxlength="100" required value="' + esc(savedCode) + '">', "", "Only you can save recipes.") +
      '<label class="check"><input type="checkbox" name="keep"' + (savedCode ? " checked" : "") + "> Remember the code on this device</label>" +
      "</div>" +
      '<div class="form-foot">' +
      '<button class="btn" type="submit" id="save-btn">Save recipe</button>' +
      '<p class="form-msg" id="save-msg" role="status" aria-live="polite"></p>' +
      "</div>" +
      "</form>" +
      "</section>";

    var linkForm = root.querySelector("#link-form");
    var linkInput = root.querySelector("#link");
    var linkBtn = root.querySelector("#link-btn");
    var linkMsg = root.querySelector("#link-msg");
    var form = root.querySelector("#recipe-form");
    var saveBtn = root.querySelector("#save-btn");
    var saveMsg = root.querySelector("#save-msg");
    var catSelect = form.elements.category;
    var newCat = form.elements.newCategory;

    function setMsg(el, text, kind) {
      el.textContent = text;
      el.className = "form-msg" + (kind ? " is-" + kind : "");
    }

    function setCategory(name) {
      if (!name) {
        catSelect.value = "";
        newCat.hidden = true;
        return;
      }
      if (cats.indexOf(name) !== -1) {
        catSelect.value = name;
        newCat.hidden = true;
      } else {
        catSelect.value = "__new";
        newCat.hidden = false;
        newCat.value = name;
      }
    }

    catSelect.addEventListener("change", function () {
      newCat.hidden = catSelect.value !== "__new";
      if (!newCat.hidden) newCat.focus();
    });

    function fill(r, source) {
      r = r || {};
      form.elements.title.value = r.title || "";
      setCategory(pickCategory(r.category, cats));
      form.elements.tags.value = (r.tags || []).join(", ");
      form.elements.timeMinutes.value = r.timeMinutes || "";
      form.elements.servings.value = r.servings || "";
      form.elements.ingredients.value = (r.ingredients || []).join("\n");
      form.elements.steps.value = (r.steps || []).join("\n");
      form.elements.notes.value = "";
      form.elements.image.value = "";
      form.elements.source.value = source || "";
      form.hidden = false;
    }

    function showForm(r, source, focusTitle) {
      fill(r, source);
      setMsg(saveMsg, "", "");
      var target = focusTitle || !form.elements.title.value ? form.elements.title : form.querySelector("h2");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      if (target) {
        if (target.tagName === "H2") target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
    }

    root.querySelector("#manual").addEventListener("click", function () {
      setMsg(linkMsg, "", "");
      showForm({}, "", true);
    });

    linkForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (linkBtn.disabled) return;
      var url = linkInput.value.trim();
      if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
      if (!url) {
        setMsg(linkMsg, "Paste a link first.", "error");
        linkInput.focus();
        return;
      }
      linkBtn.disabled = true;
      linkBtn.textContent = "Reading…";
      setMsg(linkMsg, "Reading the recipe page…", "");
      importRecipe(url).then(function (data) {
        linkBtn.disabled = false;
        linkBtn.textContent = "Get recipe";
        if (data && data.ok && data.recipe) {
          setMsg(linkMsg, "Found “" + (data.recipe.title || "a recipe") + "”. Check the details below, then save.", "ok");
          showForm(data.recipe, data.source || url, false);
          return;
        }
        var code = (data && data.error) || "network";
        setMsg(linkMsg, IMPORT_ERRORS[code] || IMPORT_ERRORS.network, "error");
        if (code === "bad_url") {
          linkInput.focus();
          return;
        }
        showForm({ title: data && data.title }, (data && data.source) || url, true);
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (saveBtn.disabled) return;
      var el = form.elements;
      var title = el.title.value.trim();
      var category = catSelect.value === "__new" ? newCat.value.trim() : catSelect.value;
      var ingredients = lines(el.ingredients.value);
      var steps = lines(el.steps.value);
      var code = el.code.value.trim();
      var image = el.image.value.trim();
      var source = el.source.value.trim();

      if (!title) {
        setMsg(saveMsg, SAVE_ERRORS.missing_title, "error");
        el.title.focus();
        return;
      }
      if (!ingredients.length && !steps.length) {
        setMsg(saveMsg, "Add at least the ingredients or the method.", "error");
        el.ingredients.focus();
        return;
      }
      if (image && !/^https:\/\//i.test(image)) {
        setMsg(saveMsg, "The photo link must start with https://.", "error");
        el.image.focus();
        return;
      }
      if (source && !/^https?:\/\//i.test(source)) {
        setMsg(saveMsg, "The source must be a full link starting with https://.", "error");
        el.source.focus();
        return;
      }
      if (!code) {
        setMsg(saveMsg, "Enter your owner code.", "error");
        el.code.focus();
        return;
      }

      var id = slug(title);
      var base = id;
      var n = 1;
      while (taken[id]) {
        n += 1;
        id = base + "-" + n;
      }
      var minutes = parseInt(el.timeMinutes.value, 10);
      var recipe = {
        id: id,
        title: title,
        category: category,
        tags: el.tags.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 12),
        timeMinutes: minutes > 0 ? minutes : null,
        servings: el.servings.value.trim(),
        image: image,
        ingredients: ingredients,
        steps: steps,
        notes: el.notes.value.trim(),
        source: source
      };

      if (!window.Reviews || !window.Reviews.api) {
        setMsg(saveMsg, SAVE_ERRORS.network, "error");
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      setMsg(saveMsg, "", "");
      window.Reviews.api("/rpc/add_recipe", { method: "POST", body: { p_code: code, p_recipe: recipe } })
        .then(function (data) {
          if (!data || data.ok !== true) {
            var err = new Error((data && data.error) || "invalid_input");
            err.kind = "server";
            throw err;
          }
          storeCode(code, el.keep.checked);
          recipe.id = data.id || recipe.id;
          recipe._saved = true;
          recipe._added = new Date().toISOString();
          setMsg(saveMsg, "Saved.", "ok");
          if (ctx.onSaved) ctx.onSaved(recipe);
        })
        .catch(function (err) {
          var key = err && err.kind === "network" ? "network" : (err && err.message) || "";
          if (key === "wrong_code") {
            storeCode("", false);
            el.code.value = "";
            el.code.focus();
          }
          setMsg(saveMsg, SAVE_ERRORS[key] || "The recipe didn’t save. Check the details and try again.", "error");
        })
        .then(function () {
          saveBtn.disabled = false;
          saveBtn.textContent = "Save recipe";
        });
    });

    linkInput.focus();
  }

  function field(label, control, extra, help) {
    return (
      '<label class="field' + (extra === "wide" ? " field-wide" : "") + '">' +
      '<span class="field-label">' + label + "</span>" +
      control +
      (help ? '<span class="field-help">' + help + "</span>" : "") +
      "</label>"
    );
  }

  window.AddRecipe = { mount: mount, _slug: slug, _pickCategory: pickCategory };
})();
