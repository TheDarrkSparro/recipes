/*
 * Weekly meal plan (#/plan) and shopping list (#/shopping), plus the
 * "Add to meal plan" button on recipe pages.
 *
 * - One dinner per day, weeks run Sunday to Saturday.
 * - Everything is saved in this browser on this device (localStorage), so
 *   no account is needed. Clearing the browser's site data clears the plan.
 * - The shopping list groups the same ingredient from different recipes
 *   (see ingredients.js) and lets you tick off what you already have.
 */
(function () {
  "use strict";

  var PLAN_STORE = "dse-meal-plan"; // { "YYYY-MM-DD": { id: "recipe-id" } | { note: "Pizza night" } }
  var SHOP_STORE = "dse-shopping"; // { "<week start>": { have: { key: true }, extras: [{ id, text, have }] } }
  var memory = {};

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function read(name) {
    try {
      var v = JSON.parse(localStorage.getItem(name) || "null");
      if (v && typeof v === "object") return v;
    } catch (e) {
      /* Private browsing or blocked storage: keep it for this visit only. */
    }
    return memory[name] || {};
  }

  function write(name, value) {
    memory[name] = value;
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch (e) {
      /* Kept in memory for this visit. */
    }
  }

  /* ---------- Dates (local time, weeks start Sunday) ---------- */

  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function dayKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function fromKey(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || "");
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? null : d;
  }
  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }
  function startOfWeek(d) {
    return addDays(d, -d.getDay());
  }
  function today() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function short(d) {
    return DAYS[d.getDay()].slice(0, 3) + ", " + MONTHS[d.getMonth()] + " " + d.getDate();
  }
  function range(start) {
    var end = addDays(start, 6);
    var a = MONTHS[start.getMonth()] + " " + start.getDate();
    var b = (end.getMonth() !== start.getMonth() ? MONTHS[end.getMonth()] + " " : "") + end.getDate();
    return a + " – " + b + ", " + end.getFullYear();
  }
  function weekFrom(key) {
    var d = fromKey(key);
    return startOfWeek(d || today());
  }

  /* ---------- Plan storage ---------- */

  function getPlan() {
    return read(PLAN_STORE);
  }
  function setDay(key, value) {
    var plan = getPlan();
    if (value && (value.id || value.note)) plan[key] = value;
    else delete plan[key];
    // Keep a year back at most.
    var cutoff = dayKey(addDays(today(), -366));
    Object.keys(plan).forEach(function (k) {
      if (k < cutoff) delete plan[k];
    });
    write(PLAN_STORE, plan);
  }

  function weekDays(start) {
    var out = [];
    for (var i = 0; i < 7; i++) out.push(addDays(start, i));
    return out;
  }

  function recipeMap(recipes) {
    var map = Object.create(null);
    recipes.forEach(function (r) {
      map[r.id] = r;
    });
    return map;
  }

  /* <select> of every recipe, grouped by category. */
  function recipeOptions(recipes, selected) {
    var byCat = {};
    var cats = [];
    recipes.forEach(function (r) {
      var c = r.category || "Other";
      if (!byCat[c]) {
        byCat[c] = [];
        cats.push(c);
      }
      byCat[c].push(r);
    });
    cats.sort(function (a, b) {
      return a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b);
    });
    return cats
      .map(function (c) {
        return (
          '<optgroup label="' + esc(c) + '">' +
          byCat[c]
            .slice()
            .sort(function (a, b) {
              return a.title.localeCompare(b.title);
            })
            .map(function (r) {
              return '<option value="r:' + esc(r.id) + '"' + (r.id === selected ? " selected" : "") + ">" + esc(r.title) + "</option>";
            })
            .join("") +
          "</optgroup>"
        );
      })
      .join("");
  }

  var arrowL = '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M11.5 5L6.5 10l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var arrowR = '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M8.5 5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- Meal plan page ---------- */

  function mountPlan(root, ctx) {
    var start = weekFrom(ctx.week);
    var startKey = dayKey(start);
    var thisWeek = dayKey(startOfWeek(today()));
    var todayKey = dayKey(today());
    var map = recipeMap(ctx.recipes);
    var plan = getPlan();
    var days = weekDays(start);
    document.title = "Meal plan · The Dark Sparrow Eats";

    var count = 0;
    var rows = days
      .map(function (d) {
        var k = dayKey(d);
        var entry = plan[k] || {};
        var r = entry.id ? map[entry.id] : null;
        if (entry.id || entry.note) count++;
        var value = entry.id ? "r:" + entry.id : entry.note != null && entry.note !== "" ? "note" : "";
        var missing = entry.id && !r;
        return (
          '<li class="plan-day' + (k === todayKey ? " is-today" : "") + (value ? " is-set" : "") + '" data-day="' + k + '">' +
          '<div class="plan-date"><span class="plan-dow">' + DAYS[d.getDay()] + "</span>" +
          '<span class="plan-dm">' + MONTHS[d.getMonth()] + " " + d.getDate() + (k === todayKey ? ' <span class="plan-today">Today</span>' : "") + "</span></div>" +
          '<div class="plan-pick">' +
          '<label class="sr-only" for="pick-' + k + '">Dinner on ' + DAYS[d.getDay()] + "</label>" +
          '<select id="pick-' + k + '" class="plan-select">' +
          '<option value="">— No dinner planned —</option>' +
          '<option value="note"' + (value === "note" ? " selected" : "") + ">Write a note (leftovers, eating out…)</option>" +
          (missing
            ? '<option value="r:' + esc(entry.id) + '" selected>' + (ctx.loading ? "Loading…" : "A recipe that’s no longer on the site") + "</option>"
            : "") +
          recipeOptions(ctx.recipes, entry.id || "") +
          "</select>" +
          '<input class="plan-note" type="text" maxlength="80" placeholder="e.g. Leftovers, pizza night" value="' + esc(entry.note || "") + '"' + (value === "note" ? "" : " hidden") + ' aria-label="Note for ' + DAYS[d.getDay()] + '">' +
          (r ? '<a class="plan-open" href="#/recipe/' + encodeURIComponent(r.id) + '">Open recipe' + arrowR + "</a>" : "") +
          "</div>" +
          "</li>"
        );
      })
      .join("");

    root.innerHTML =
      '<section class="plan">' +
      '<h1 class="add-title">Meal plan</h1>' +
      '<p class="add-sub">Pick a dinner for each day, then get the shopping list. Your plan is saved on this device.</p>' +
      '<div class="week-nav">' +
      '<a class="btn btn-quiet week-step" href="#/plan/' + dayKey(addDays(start, -7)) + '" aria-label="Previous week">' + arrowL + "</a>" +
      '<div class="week-label"><strong>' + range(start) + "</strong>" +
      (startKey === thisWeek
        ? '<span class="week-tag">This week</span>'
        : '<a class="week-tag week-tag-link" href="#/plan">Back to this week</a>') +
      "</div>" +
      '<a class="btn btn-quiet week-step" href="#/plan/' + dayKey(addDays(start, 7)) + '" aria-label="Next week">' + arrowR + "</a>" +
      "</div>" +
      '<ol class="plan-days">' + rows + "</ol>" +
      '<div class="plan-foot">' +
      '<a class="btn" href="#/shopping/' + startKey + '">' +
      '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 4h2l1.6 8.2a1.5 1.5 0 0 0 1.5 1.2h6.3a1.5 1.5 0 0 0 1.5-1.1L17 7H6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.5" cy="16.5" r="1.1" fill="currentColor"/><circle cx="14.5" cy="16.5" r="1.1" fill="currentColor"/></svg>' +
      "Shopping list</a>" +
      '<span class="plan-count" id="plan-count">' + countText(count) + "</span>" +
      '<button type="button" class="link-btn" id="plan-clear"' + (count ? "" : " hidden") + ">Clear this week</button>" +
      "</div>" +
      "</section>";

    var countEl = root.querySelector("#plan-count");
    var clearBtn = root.querySelector("#plan-clear");

    function refreshCount() {
      var p = getPlan();
      var n = days.filter(function (d) {
        var e = p[dayKey(d)];
        return e && (e.id || e.note);
      }).length;
      countEl.textContent = countText(n);
      clearBtn.hidden = !n;
      clearBtn.textContent = "Clear this week";
      clearBtn.removeAttribute("data-armed");
    }

    Array.prototype.forEach.call(root.querySelectorAll(".plan-day"), function (li) {
      var k = li.getAttribute("data-day");
      var sel = li.querySelector("select");
      var note = li.querySelector(".plan-note");
      sel.addEventListener("change", function () {
        var v = sel.value;
        var open = li.querySelector(".plan-open");
        if (open) open.remove();
        if (v === "note") {
          note.hidden = false;
          note.focus();
          setDay(k, note.value.trim() ? { note: note.value.trim() } : null);
        } else {
          note.hidden = true;
          if (v.indexOf("r:") === 0) {
            var id = v.slice(2);
            setDay(k, { id: id });
            if (map[id]) {
              var a = document.createElement("a");
              a.className = "plan-open";
              a.href = "#/recipe/" + encodeURIComponent(id);
              a.innerHTML = "Open recipe" + arrowR;
              li.querySelector(".plan-pick").appendChild(a);
            }
          } else {
            setDay(k, null);
          }
        }
        li.classList.toggle("is-set", !!v);
        refreshCount();
      });
      note.addEventListener("input", function () {
        var t = note.value.trim();
        setDay(k, t ? { note: t } : null);
        refreshCount();
      });
    });

    clearBtn.addEventListener("click", function () {
      // Two taps instead of a pop-up confirm.
      if (!clearBtn.hasAttribute("data-armed")) {
        clearBtn.setAttribute("data-armed", "1");
        clearBtn.textContent = "Tap again to clear the week";
        return;
      }
      days.forEach(function (d) {
        setDay(dayKey(d), null);
      });
      mountPlan(root, ctx);
    });
  }

  function countText(n) {
    return n === 0 ? "Nothing planned yet" : n === 1 ? "1 day planned" : n + " days planned";
  }

  /* ---------- Shopping list page ---------- */

  function getShop(week) {
    var all = read(SHOP_STORE);
    var w = all[week] || {};
    return { have: w.have || {}, extras: Array.isArray(w.extras) ? w.extras : [] };
  }
  function setShop(week, data) {
    var all = read(SHOP_STORE);
    all[week] = data;
    // Keep the last 12 weeks.
    var cutoff = dayKey(addDays(startOfWeek(today()), -84));
    Object.keys(all).forEach(function (k) {
      if (k < cutoff) delete all[k];
    });
    write(SHOP_STORE, all);
  }

  function mountShopping(root, ctx) {
    var start = weekFrom(ctx.week);
    var week = dayKey(start);
    var map = recipeMap(ctx.recipes);
    var plan = getPlan();
    var meals = [];
    weekDays(start).forEach(function (d) {
      var e = plan[dayKey(d)];
      if (e && e.id && map[e.id]) meals.push({ day: d, recipe: map[e.id] });
    });
    var items = window.Ingredients.group(
      meals.map(function (m) {
        return { recipe: { id: m.recipe.id, title: m.recipe.title }, lines: m.recipe.ingredients };
      })
    );
    var shop = getShop(week);
    document.title = "Shopping list · The Dark Sparrow Eats";

    function save() {
      setShop(week, shop);
    }

    function itemHtml(item) {
      var have = !!shop.have[item.key];
      var uses = item.uses
        .map(function (u) {
          return (
            '<span class="shop-use">' +
            (u.amount ? esc(u.amount) : "as needed") +
            ' <span class="shop-from">· ' + esc(u.recipe.title) + "</span>" +
            "</span>"
          );
        })
        .join("");
      return (
        '<li class="shop-item' + (have ? " is-have" : "") + '">' +
        '<label class="shop-check"><input type="checkbox" data-key="' + esc(item.key) + '"' + (have ? " checked" : "") + ">" +
        '<span class="shop-text"><span class="shop-name">' + esc(item.name) + (item.optional ? ' <span class="shop-opt">optional</span>' : "") + "</span>" +
        '<span class="shop-uses">' + uses + "</span></span></label>" +
        "</li>"
      );
    }

    function extraHtml(x) {
      return (
        '<li class="shop-item shop-extra' + (x.have ? " is-have" : "") + '">' +
        '<label class="shop-check"><input type="checkbox" data-extra="' + esc(x.id) + '"' + (x.have ? " checked" : "") + ">" +
        '<span class="shop-text"><span class="shop-name">' + esc(x.text) + '</span><span class="shop-uses"><span class="shop-use">added by you</span></span></span></label>' +
        '<button type="button" class="shop-remove" data-remove="' + esc(x.id) + '" aria-label="Remove ' + esc(x.text) + '">×</button>' +
        "</li>"
      );
    }

    function paint() {
      var need = [];
      var got = [];
      items.forEach(function (it) {
        (shop.have[it.key] ? got : need).push(itemHtml(it));
      });
      shop.extras.forEach(function (x) {
        (x.have ? got : need).push(extraHtml(x));
      });
      var total = items.length + shop.extras.length;
      root.querySelector("#shop-lists").innerHTML =
        (total === 0
          ? ""
          : '<h2 class="shop-h">To buy <span class="shop-n">' + need.length + "</span></h2>" +
            (need.length
              ? '<ul class="shop-list">' + need.join("") + "</ul>"
              : '<p class="shop-done">You have everything. Enjoy the week’s cooking!</p>') +
            (got.length
              ? '<section class="shop-have"><h2 class="shop-h">Already have <span class="shop-n">' + got.length + "</span></h2>" +
                '<ul class="shop-list">' + got.join("") + "</ul></section>"
              : ""));
      root.querySelector("#shop-uncheck").hidden = !got.length;
    }

    var mealChips = meals
      .map(function (m) {
        return '<li><a href="#/recipe/' + encodeURIComponent(m.recipe.id) + '"><span>' + DAYS[m.day.getDay()].slice(0, 3) + "</span> " + esc(m.recipe.title) + "</a></li>";
      })
      .join("");

    root.innerHTML =
      '<section class="shop">' +
      '<a class="back" href="#/plan/' + week + '">' + arrowL + "Meal plan</a>" +
      '<h1 class="add-title">Shopping list</h1>' +
      '<p class="add-sub">For dinners ' + range(start) + ". Tick anything you already have and it moves out of the way.</p>" +
      (ctx.loading && !meals.length
        ? '<p class="loading">Loading your recipes…</p>'
        : meals.length
          ? '<ul class="shop-meals" aria-label="Dinners on this list">' + mealChips + "</ul>"
          : '<div class="empty"><h2>No dinners planned this week</h2><p>Pick some dinners first and their ingredients show up here. You can still add your own items below.</p><a class="btn" href="#/plan/' + week + '">Plan this week</a></div>') +
      '<div class="shop-actions">' +
      '<button type="button" class="btn btn-quiet" id="shop-print">' +
      '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.5 7V3h9v4M5.5 14h-2V8.5a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5V14h-2M5.5 11.5h9V17h-9z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>Print</button>' +
      '<button type="button" class="btn btn-quiet" id="shop-copy">' +
      '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="7" y="7" width="9" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 13V4.5A1.5 1.5 0 0 1 5.5 3H12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Copy list</button>' +
      '<button type="button" class="link-btn" id="shop-uncheck" hidden>Untick everything</button>' +
      '<span class="form-msg" id="shop-msg" role="status" aria-live="polite"></span>' +
      "</div>" +
      '<div id="shop-lists"></div>' +
      '<form class="shop-add" id="shop-add">' +
      '<label class="sr-only" for="shop-add-text">Add an item</label>' +
      '<input id="shop-add-text" type="text" maxlength="80" placeholder="Add an item, like paper towels" autocomplete="off">' +
      '<button class="btn" type="submit">Add</button>' +
      "</form>" +
      "</section>";

    var msg = root.querySelector("#shop-msg");
    paint();

    root.querySelector("#shop-lists").addEventListener("change", function (e) {
      var box = e.target;
      if (!box || box.type !== "checkbox") return;
      var key = box.getAttribute("data-key");
      var ex = box.getAttribute("data-extra");
      if (key) {
        if (box.checked) shop.have[key] = true;
        else delete shop.have[key];
      } else if (ex) {
        shop.extras.forEach(function (x) {
          if (x.id === ex) x.have = box.checked;
        });
      }
      save();
      paint();
    });

    root.querySelector("#shop-lists").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-remove]") : null;
      if (!btn) return;
      var id = btn.getAttribute("data-remove");
      shop.extras = shop.extras.filter(function (x) {
        return x.id !== id;
      });
      save();
      paint();
    });

    root.querySelector("#shop-add").addEventListener("submit", function (e) {
      e.preventDefault();
      var input = root.querySelector("#shop-add-text");
      var text = input.value.trim();
      if (!text) return;
      shop.extras.push({ id: "x" + Date.now().toString(36) + Math.floor(Math.random() * 1e4), text: text, have: false });
      save();
      input.value = "";
      paint();
      input.focus();
    });

    root.querySelector("#shop-uncheck").addEventListener("click", function () {
      shop.have = {};
      shop.extras.forEach(function (x) {
        x.have = false;
      });
      save();
      paint();
    });

    root.querySelector("#shop-print").addEventListener("click", function () {
      window.print();
    });

    root.querySelector("#shop-copy").addEventListener("click", function () {
      var lines = [];
      items.forEach(function (it) {
        if (shop.have[it.key]) return;
        var amounts = it.uses
          .map(function (u) {
            return u.amount;
          })
          .filter(Boolean);
        lines.push("- " + it.name + (amounts.length ? " (" + amounts.join(" + ") + ")" : ""));
      });
      shop.extras.forEach(function (x) {
        if (!x.have) lines.push("- " + x.text);
      });
      if (!lines.length) {
        setMsg("Nothing left to buy.", "ok");
        return;
      }
      var text = "Shopping list, " + range(start) + "\n" + lines.join("\n");
      copy(text).then(
        function () {
          setMsg("Copied. Paste it into a text or note.", "ok");
        },
        function () {
          setMsg("Couldn’t copy on this device. Use Print instead.", "error");
        }
      );
    });

    function setMsg(text, kind) {
      msg.textContent = text;
      msg.className = "form-msg" + (kind ? " is-" + kind : "");
    }
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        ta.remove();
        if (ok) resolve();
        else reject();
      } catch (e) {
        reject(e);
      }
    });
  }

  /* ---------- "Add to meal plan" on a recipe page ---------- */

  function mountAddButton(holder, recipe, titleOf) {
    if (!holder || !recipe || !recipe.id) return;
    holder.innerHTML =
      '<button type="button" class="btn btn-quiet" aria-expanded="false">' +
      '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="3" y="4.5" width="14" height="12.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 8h14M7 3v3M13 3v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
      "Add to meal plan</button>";
    var btn = holder.querySelector("button");
    var panel = null;

    btn.addEventListener("click", function () {
      if (panel) {
        panel.remove();
        panel = null;
        btn.setAttribute("aria-expanded", "false");
        return;
      }
      btn.setAttribute("aria-expanded", "true");
      var plan = getPlan();
      var t = today();
      var opts = "";
      for (var i = 0; i < 14; i++) {
        var d = addDays(t, i);
        var k = dayKey(d);
        var e = plan[k];
        var taken = e ? (e.id ? titleOf(e.id) : e.note) : "";
        opts +=
          '<option value="' + k + '">' +
          (i === 0 ? "Today, " : i === 1 ? "Tomorrow, " : "") + short(d) +
          (taken ? " (now: " + esc(taken) + ")" : "") +
          "</option>";
      }
      panel = document.createElement("div");
      panel.className = "plan-add-panel";
      panel.innerHTML =
        '<label class="field"><span class="field-label">Dinner on</span><select>' + opts + "</select></label>" +
        '<button type="button" class="btn">Add</button>' +
        '<p class="form-msg" role="status" aria-live="polite"></p>';
      // Below the row of buttons, not squeezed into it.
      var row = holder.closest(".recipe-actions") || holder.parentNode;
      row.parentNode.insertBefore(panel, row.nextSibling);
      var sel = panel.querySelector("select");
      var go = panel.querySelector(".btn");
      var out = panel.querySelector(".form-msg");
      // Start on the first free day.
      for (var j = 0; j < sel.options.length; j++) {
        if (!plan[sel.options[j].value]) {
          sel.selectedIndex = j;
          break;
        }
      }
      go.addEventListener("click", function () {
        var k = sel.value;
        setDay(k, { id: recipe.id });
        var d = fromKey(k);
        out.className = "form-msg is-ok";
        out.innerHTML =
          "Added for " + esc(DAYS[d.getDay()]) + ", " + MONTHS[d.getMonth()] + " " + d.getDate() + ". " +
          '<a href="#/plan/' + dayKey(startOfWeek(d)) + '">See the meal plan</a>';
        var o = sel.options[sel.selectedIndex];
        o.textContent = o.textContent.replace(/ \(now: .*\)$/, "") + " (now: " + recipe.title + ")";
      });
      sel.focus();
    });
  }

  window.Planner = {
    mountPlan: mountPlan,
    mountShopping: mountShopping,
    mountAddButton: mountAddButton
  };
})();
