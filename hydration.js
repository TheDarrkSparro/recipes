/* Sourdough hydration calculator for The Dark Sparrow Eats.
   Page: #/hydration. app.js calls Hydration.mount(container).

   Baker's percentages, counted against TOTAL flour: the flour and water inside
   the starter are part of the dough's hydration, so they come off what you add.

   Two tools on one page:
   - "Plan a dough": pick flour (or a finished dough weight), hydration, salt and
     starter; get the grams of flour, water, starter and salt to weigh out.
   - "Check a dough": enter what you weighed; get the true hydration. */
(function () {
  "use strict";

  var STORE = "dse-hydration-v1";

  var DEFAULTS = {
    tab: "plan",
    basis: "flour",        // "flour" or "dough"
    flour: "1000",
    loaves: "2",
    loafWeight: "900",
    hydration: "75",
    salt: "2",
    starterPct: "20",
    starterHyd: "100",
    cFlour: "",
    cWater: "",
    cStarter: "",
    cStarterHyd: "100",
    cSalt: ""
  };

  var PRESETS = [
    { label: "Sandwich loaf", pct: 65 },
    { label: "Everyday boule", pct: 72 },
    { label: "Open crumb", pct: 80 },
    { label: "Ciabatta / focaccia", pct: 85 }
  ];

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (e) { s = {}; }
    var out = {};
    for (var k in DEFAULTS) out[k] = typeof s[k] === "string" ? s[k] : DEFAULTS[k];
    return out;
  }

  function save(state) {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  function num(v) {
    var n = parseFloat(String(v == null ? "" : v).replace(",", "."));
    return isFinite(n) ? n : NaN;
  }

  function grams(n) {
    if (!isFinite(n)) return "–";
    var r = Math.round(n * (Math.abs(n) < 20 ? 10 : 1)) / (Math.abs(n) < 20 ? 10 : 1);
    return r.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " g";
  }

  function ounces(n) {
    if (!isFinite(n)) return "";
    return (n / 28.3495).toLocaleString(undefined, { maximumFractionDigits: 1 }) + " oz";
  }

  function pct(n) {
    if (!isFinite(n)) return "–";
    return (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 }) + "%";
  }

  function feel(h) {
    if (!isFinite(h)) return "";
    if (h < 60) return "Very stiff. Bagels and pretzels live here.";
    if (h < 68) return "Firm and easy to shape. Good for sandwich loaves and a first loaf.";
    if (h < 76) return "The everyday sourdough range. Soft, still shapes cleanly.";
    if (h < 82) return "Wet and slack. More open crumb; needs good folds and a confident shape.";
    return "Very wet. Ciabatta and focaccia territory; handle with wet hands or a scraper.";
  }

  /* ---------- Math ---------- */

  function plan(s) {
    var H = num(s.hydration) / 100;
    var S = num(s.salt) / 100;
    var L = num(s.starterPct) / 100;
    var h = num(s.starterHyd) / 100;
    var F;
    if (s.basis === "dough") {
      var D = num(s.loaves) * num(s.loafWeight);
      F = D / (1 + H + S);
    } else {
      F = num(s.flour);
    }
    if (!(F > 0) || !(H >= 0) || !(S >= 0) || !(L >= 0) || !(h >= 0)) return null;
    var starter = L * F;
    var starterFlour = starter / (1 + h);
    var starterWater = starter - starterFlour;
    return {
      totalFlour: F,
      totalWater: H * F,
      flour: F - starterFlour,
      water: H * F - starterWater,
      starter: starter,
      salt: S * F,
      dough: F * (1 + H + S),
      starterFlour: starterFlour,
      starterWater: starterWater
    };
  }

  function check(s) {
    var f = num(s.cFlour) || 0;
    var w = num(s.cWater) || 0;
    var st = num(s.cStarter) || 0;
    var h = num(s.cStarterHyd);
    var salt = num(s.cSalt) || 0;
    if (!(h >= 0)) h = 1; else h = h / 100;
    var tf = f + st / (1 + h);
    var tw = w + st - st / (1 + h);
    if (!(tf > 0)) return null;
    return {
      totalFlour: tf,
      totalWater: tw,
      hydration: (tw / tf) * 100,
      starterPct: (st / tf) * 100,
      saltPct: (salt / tf) * 100,
      dough: f + w + st + salt
    };
  }

  /* ---------- Markup ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function field(id, label, value, unit, help) {
    return (
      '<div class="hy-field">' +
      '<label for="hy-' + id + '">' + label + "</label>" +
      '<div class="hy-input">' +
      '<input id="hy-' + id + '" data-k="' + id + '" type="text" inputmode="decimal" autocomplete="off" value="' + esc(value) + '">' +
      '<span class="hy-unit" aria-hidden="true">' + unit + "</span>" +
      "</div>" +
      (help ? '<p class="hy-help">' + help + "</p>" : "") +
      "</div>"
    );
  }

  function row(label, value, sub, strong) {
    return (
      '<div class="hy-row' + (strong ? " is-strong" : "") + '">' +
      "<dt>" + label + "</dt>" +
      "<dd><span>" + value + "</span>" + (sub ? '<small>' + sub + "</small>" : "") + "</dd>" +
      "</div>"
    );
  }

  function planForm(s) {
    return (
      '<div class="hy-basis" role="radiogroup" aria-label="Start from">' +
      '<label><input type="radio" name="hy-basis" value="flour"' + (s.basis !== "dough" ? " checked" : "") + "> Flour weight</label>" +
      '<label><input type="radio" name="hy-basis" value="dough"' + (s.basis === "dough" ? " checked" : "") + "> Finished dough weight</label>" +
      "</div>" +
      '<div class="hy-grid">' +
      (s.basis === "dough"
        ? field("loaves", "Loaves", s.loaves, "×") + field("loafWeight", "Dough per loaf", s.loafWeight, "g", "About 900 g fills a standard banneton.")
        : field("flour", "Total flour", s.flour, "g", "Includes the flour inside your starter.")) +
      field("hydration", "Hydration", s.hydration, "%") +
      field("salt", "Salt", s.salt, "%", "2% is standard.") +
      field("starterPct", "Starter", s.starterPct, "%", "Of total flour. 15–25% is typical.") +
      field("starterHyd", "Starter hydration", s.starterHyd, "%", "100% means equal flour and water.") +
      "</div>" +
      '<div class="hy-presets" aria-label="Hydration presets">' +
      PRESETS.map(function (p) {
        return '<button type="button" class="hy-chip' + (num(s.hydration) === p.pct ? " is-on" : "") + '" data-preset="' + p.pct + '">' +
          esc(p.label) + " <b>" + p.pct + "%</b></button>";
      }).join("") +
      "</div>"
    );
  }

  function planResult(s) {
    var r = plan(s);
    if (!r) return '<p class="hy-empty">Fill in the numbers to see what to weigh out.</p>';
    var warn = "";
    if (r.water < 0) {
      warn = '<p class="hy-warn">Your starter holds more water than the whole dough needs. Lower the starter amount or raise the hydration.</p>';
    }
    return (
      '<h2 class="hy-out-title">Weigh out</h2>' +
      '<dl class="hy-list">' +
      row("Flour", grams(r.flour), ounces(r.flour), true) +
      row("Water", grams(r.water), ounces(r.water), true) +
      row("Starter", grams(r.starter), ounces(r.starter), true) +
      row("Salt", grams(r.salt), "", true) +
      "</dl>" +
      warn +
      '<dl class="hy-list hy-totals">' +
      row("Dough weight", grams(r.dough), ounces(r.dough)) +
      row("Total flour", grams(r.totalFlour), "incl. " + grams(r.starterFlour) + " in starter") +
      row("Total water", grams(r.totalWater), "incl. " + grams(r.starterWater) + " in starter") +
      "</dl>" +
      '<p class="hy-feel"><strong>' + pct(num(s.hydration)) + "</strong> " + esc(feel(num(s.hydration))) + "</p>"
    );
  }

  function checkForm(s) {
    return (
      '<p class="hy-lead">Enter what went in the bowl. The starter\'s own flour and water are counted for you.</p>' +
      '<div class="hy-grid">' +
      field("cFlour", "Flour", s.cFlour, "g") +
      field("cWater", "Water", s.cWater, "g", "Add milk or other liquids here too.") +
      field("cStarter", "Starter", s.cStarter, "g") +
      field("cStarterHyd", "Starter hydration", s.cStarterHyd, "%") +
      field("cSalt", "Salt", s.cSalt, "g", "Optional.") +
      "</div>"
    );
  }

  function checkResult(s) {
    var r = check(s);
    if (!r) return '<p class="hy-empty">Enter your flour, water and starter to see the hydration.</p>';
    return (
      '<h2 class="hy-out-title">Your dough</h2>' +
      '<p class="hy-big">' + pct(r.hydration) + '<span>hydration</span></p>' +
      '<p class="hy-feel">' + esc(feel(r.hydration)) + "</p>" +
      '<dl class="hy-list hy-totals">' +
      row("Total flour", grams(r.totalFlour)) +
      row("Total water", grams(r.totalWater)) +
      row("Starter", pct(r.starterPct), "of total flour") +
      (num(s.cSalt) > 0 ? row("Salt", pct(r.saltPct), "of total flour") : "") +
      row("Dough weight", grams(r.dough), ounces(r.dough)) +
      "</dl>"
    );
  }

  /* ---------- Mount ---------- */

  function mount(app) {
    var s = load();

    function render() {
      app.innerHTML =
        '<a class="back" href="#/">' +
        '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M11.5 5L6.5 10l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        "All recipes</a>" +
        '<section class="hy">' +
        '<header class="hy-head">' +
        '<h1 class="hy-title">Sourdough hydration calculator</h1>' +
        '<p class="hy-sub">Hydration is the water as a share of the flour. Starter counts too: its flour and water are part of the dough.</p>' +
        "</header>" +
        '<div class="hy-tabs" role="tablist">' +
        '<button type="button" role="tab" class="hy-tab' + (s.tab === "plan" ? " is-on" : "") + '" aria-selected="' + (s.tab === "plan") + '" data-tab="plan">Plan a dough</button>' +
        '<button type="button" role="tab" class="hy-tab' + (s.tab === "check" ? " is-on" : "") + '" aria-selected="' + (s.tab === "check") + '" data-tab="check">Check a dough</button>' +
        "</div>" +
        '<div class="hy-body">' +
        '<form class="hy-form" novalidate>' + (s.tab === "check" ? checkForm(s) : planForm(s)) + "</form>" +
        '<div class="hy-out" aria-live="polite">' + (s.tab === "check" ? checkResult(s) : planResult(s)) + "</div>" +
        "</div>" +
        '<p class="hy-reset"><button type="button" class="link-btn" data-reset="1">Reset to defaults</button></p>' +
        "</section>";
    }

    function refreshOutput() {
      var out = app.querySelector(".hy-out");
      if (out) out.innerHTML = s.tab === "check" ? checkResult(s) : planResult(s);
      Array.prototype.forEach.call(app.querySelectorAll(".hy-chip"), function (b) {
        b.classList.toggle("is-on", num(b.getAttribute("data-preset")) === num(s.hydration));
      });
    }

    render();
    document.title = "Sourdough hydration calculator · The Dark Sparrow Eats";

    app.oninput = function (e) {
      var k = e.target && e.target.getAttribute("data-k");
      if (!k) return;
      s[k] = e.target.value;
      save(s);
      refreshOutput();
    };

    app.onchange = function (e) {
      if (e.target && e.target.name === "hy-basis") {
        s.basis = e.target.value;
        save(s);
        render();
        var first = app.querySelector(".hy-grid input");
        if (first) first.focus();
      }
    };

    app.onclick = function (e) {
      var t = e.target.closest ? e.target.closest("[data-tab],[data-preset],[data-reset]") : null;
      if (!t) return;
      if (t.hasAttribute("data-tab")) {
        s.tab = t.getAttribute("data-tab");
        save(s);
        render();
        var tab = app.querySelector('[data-tab="' + s.tab + '"]');
        if (tab) tab.focus();
      } else if (t.hasAttribute("data-preset")) {
        s.hydration = t.getAttribute("data-preset");
        save(s);
        var input = app.querySelector("#hy-hydration");
        if (input) input.value = s.hydration;
        refreshOutput();
      } else if (t.hasAttribute("data-reset")) {
        var tabNow = s.tab;
        s = load();
        for (var k in DEFAULTS) s[k] = DEFAULTS[k];
        s.tab = tabNow;
        save(s);
        render();
      }
    };

    app.onsubmit = function (e) { e.preventDefault(); };
  }

  /* Other pages reuse #app, so drop our handlers when they render. */
  function unmount(app) {
    app.oninput = app.onchange = app.onclick = app.onsubmit = null;
  }

  window.Hydration = { mount: mount, unmount: unmount, plan: plan, check: check };
})();
