/*
 * Suggest an improvement to the SITE (not a recipe).
 *
 * Any signed-in contributor can file a suggestion for the website itself:
 * a feature idea, a problem, or anything else. The site owner reviews them
 * on the same page, sets a status (New / Planned / Done / Declined), can add
 * a private note, and can delete one.
 *
 * Backed by Supabase (see supabase/add-suggestions.sql). Reuses the shared
 * REST helper on window.Reviews.api and the sign-in from window.Auth.
 */
(function () {
  "use strict";

  function esc(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function signedIn() {
    return !!(window.Auth && window.Auth.signedIn());
  }

  function api(path, options) {
    if (!window.Reviews || !window.Reviews.api) {
      var e = new Error("not_set_up");
      e.key = "not_set_up";
      return Promise.reject(e);
    }
    return window.Reviews.api(path, options);
  }

  /* A fresh contributor token, or a rejection if signed out. */
  function withToken() {
    if (!window.Auth || !window.Auth.token) {
      var e = new Error("not_signed_in");
      e.key = "not_signed_in";
      return Promise.reject(e);
    }
    return window.Auth.token().then(function (t) {
      if (!t) {
        var err = new Error("not_signed_in");
        err.key = "not_signed_in";
        throw err;
      }
      return t;
    });
  }

  var MESSAGES = {
    not_signed_in: "Your sign-in has ended. Sign in again, then try once more.",
    not_contributor: "This account can’t suggest changes.",
    not_owner: "Only the site owner can do that.",
    missing_title: "Add a short title first.",
    invalid_input: "That didn’t fit. A title up to 120 characters, details up to 4,000.",
    rate_limited: "That’s a lot of suggestions at once. Give it a minute and try again.",
    not_found: "That suggestion is no longer there.",
    not_set_up: "Suggestions aren’t switched on yet. In Supabase, run supabase/add-suggestions.sql (see README.md).",
    network: "Couldn’t reach the site database. Check your connection and try again.",
    failed: "That didn’t go through. Refresh the page and try again."
  };

  /* Turn any thrown error (or an {ok:false,error} result passed as a key)
     into one of the keys above. */
  function keyOf(err) {
    if (err && err.key) return err.key;
    if (err && err.kind === "network") return "network";
    if (err && err.kind === "server" && (err.status === 404 || err.code === "PGRST202")) return "not_set_up";
    if (err && err.kind === "server" && (err.status === 401 || err.status === 403)) return "not_signed_in";
    return "failed";
  }
  function message(err) {
    return MESSAGES[keyOf(err)] || MESSAGES.failed;
  }
  /* RPCs resolve even on failure, as { ok:false, error:"..." }. */
  function fromResult(res) {
    if (res && res.ok === true) return null;
    var key = (res && res.error) || "failed";
    return MESSAGES[key] || MESSAGES.failed;
  }

  var KINDS = { idea: "Idea", problem: "Problem", other: "Other" };
  var STATUSES = [
    ["new", "New"],
    ["planned", "Planned"],
    ["done", "Done"],
    ["declined", "Declined"]
  ];
  function statusLabel(s) {
    for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i][0] === s) return STATUSES[i][1];
    return "New";
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function badge(status) {
    return '<span class="sugg-badge is-' + esc(status) + '">' + esc(statusLabel(status)) + "</span>";
  }

  var backIcon =
    '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M11.5 5L6.5 10l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- The page ---------- */

  function render(root) {
    if (!root) return;

    if (!window.Auth) {
      root.innerHTML =
        '<section class="add"><a class="back" href="#/">' + backIcon + "All recipes</a>" +
        '<div class="empty"><h2>Sign-in isn’t available</h2><p>The sign-in script didn’t load. Refresh the page and try again.</p></div></section>';
      return;
    }
    if (!signedIn()) {
      window.Auth.renderSignIn(root, {
        next: "#/suggest",
        reason: "Suggesting improvements to the site is for invited contributors. Sign in with the account you were invited to."
      });
      return;
    }

    document.title = "Suggest an improvement · The Dark Sparrow Eats";
    root.innerHTML =
      '<section class="add suggest">' +
      '<a class="back" href="#/">' + backIcon + "All recipes</a>" +
      '<h1 class="add-title">Suggest an improvement</h1>' +
      '<p class="add-sub">An idea for the site, something that isn’t working, or anything you’d like changed. ' +
      "This is about the website itself — to fix a recipe, open it and use <strong>Edit</strong>.</p>" +
      '<form class="link-form suggest-form" id="suggest-form" novalidate>' +
      '<label class="field"><span class="field-label">What kind?</span>' +
      '<select name="kind">' +
      '<option value="idea">Idea / feature</option>' +
      '<option value="problem">Something’s not working</option>' +
      '<option value="other">Other</option>' +
      "</select></label>" +
      '<label class="field"><span class="field-label">Title</span>' +
      '<input name="title" type="text" maxlength="120" autocomplete="off" required placeholder="e.g. A way to tag recipes by season"></label>' +
      '<label class="field field-wide"><span class="field-label">Details <span class="optional">(optional)</span></span>' +
      '<textarea name="details" rows="5" maxlength="4000" placeholder="What would you like, and why? The more detail, the better."></textarea>' +
      '<span class="char-count" aria-hidden="true">0 / 4000</span></label>' +
      '<div class="auth-row"><button class="btn" type="submit">Send suggestion</button>' +
      '<p class="form-msg" id="suggest-msg" role="status" aria-live="polite"></p></div>' +
      "</form>" +
      '<section class="sugg-mine" id="sugg-mine" aria-labelledby="sugg-mine-h">' +
      '<h2 id="sugg-mine-h" class="sugg-h">Your suggestions</h2>' +
      '<div id="sugg-mine-list"><p class="loading">Loading…</p></div>' +
      "</section>" +
      '<section class="sugg-owner" id="sugg-owner" hidden aria-labelledby="sugg-owner-h">' +
      '<h2 id="sugg-owner-h" class="sugg-h">All suggestions</h2>' +
      '<div id="sugg-owner-list"></div>' +
      "</section>" +
      "</section>";

    wireForm(root);
    loadMine(root);
    loadOwner(root);
  }

  function wireForm(root) {
    var form = root.querySelector("#suggest-form");
    var msg = root.querySelector("#suggest-msg");
    var btn = form.querySelector('button[type="submit"]');
    var details = form.elements.details;
    var counter = form.querySelector(".char-count");

    details.addEventListener("input", function () {
      counter.textContent = details.value.length + " / 4000";
    });

    function setMsg(text, kind) {
      msg.textContent = text || "";
      msg.className = "form-msg" + (kind ? " is-" + kind : "");
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (btn.disabled) return;
      var title = form.elements.title.value.trim();
      if (!title) {
        setMsg(MESSAGES.missing_title, "error");
        form.elements.title.focus();
        return;
      }
      var body = {
        p_kind: form.elements.kind.value,
        p_title: title,
        p_details: details.value.trim() || null
      };
      btn.disabled = true;
      btn.textContent = "Sending…";
      setMsg("", "");
      withToken()
        .then(function (token) {
          return api("/rpc/suggest_improvement", { method: "POST", token: token, body: body });
        })
        .then(function (res) {
          var bad = fromResult(res);
          if (bad) {
            setMsg(bad, "error");
            return;
          }
          form.reset();
          counter.textContent = "0 / 4000";
          setMsg("Thanks! Your suggestion is in. Art will see it.", "ok");
          loadMine(document);
        })
        .catch(function (err) {
          setMsg(message(err), "error");
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = "Send suggestion";
        });
    });

    form.elements.title.focus();
  }

  /* ---------- A contributor's own suggestions ---------- */

  function mineItem(s) {
    return (
      '<li class="sugg-item">' +
      '<div class="sugg-item-top">' +
      '<span class="sugg-kind">' + esc(KINDS[s.kind] || "Idea") + "</span>" +
      badge(s.status) +
      (s.created_at ? '<span class="sugg-when">' + esc(fmtDate(s.created_at)) + "</span>" : "") +
      "</div>" +
      '<p class="sugg-title">' + esc(s.title) + "</p>" +
      (s.details ? '<p class="sugg-details">' + esc(s.details) + "</p>" : "") +
      (s.owner_note ? '<p class="sugg-note"><strong>Art:</strong> ' + esc(s.owner_note) + "</p>" : "") +
      "</li>"
    );
  }

  function loadMine(scope) {
    var box = (scope || document).querySelector
      ? (scope.querySelector("#sugg-mine-list") || document.getElementById("sugg-mine-list"))
      : document.getElementById("sugg-mine-list");
    if (!box) return;
    withToken()
      .then(function (token) {
        return api("/rpc/my_suggestions", { method: "POST", token: token, body: {} });
      })
      .then(function (res) {
        if (!document.getElementById("sugg-mine-list")) return;
        if (!res || !res.ok) {
          box.innerHTML = '<p class="muted">' + esc(fromResult(res) || MESSAGES.failed) + "</p>";
          return;
        }
        var rows = Array.isArray(res.rows) ? res.rows : [];
        box.innerHTML = rows.length
          ? '<ul class="sugg-list">' + rows.map(mineItem).join("") + "</ul>"
          : '<p class="muted">You haven’t suggested anything yet. Use the form above.</p>';
      })
      .catch(function (err) {
        if (!document.getElementById("sugg-mine-list")) return;
        box.innerHTML = '<p class="muted">' + esc(message(err)) + "</p>";
      });
  }

  /* ---------- The owner's review panel ---------- */

  function ownerItem(s) {
    var opts = STATUSES.map(function (pair) {
      return '<option value="' + pair[0] + '"' + (pair[0] === s.status ? " selected" : "") + ">" + pair[1] + "</option>";
    }).join("");
    return (
      '<li class="sugg-item sugg-admin" data-id="' + esc(s.id) + '">' +
      '<div class="sugg-item-top">' +
      '<span class="sugg-kind">' + esc(KINDS[s.kind] || "Idea") + "</span>" +
      badge(s.status) +
      (s.from ? '<span class="sugg-from">' + esc(s.from) + "</span>" : "") +
      (s.created_at ? '<span class="sugg-when">' + esc(fmtDate(s.created_at)) + "</span>" : "") +
      "</div>" +
      '<p class="sugg-title">' + esc(s.title) + "</p>" +
      (s.details ? '<p class="sugg-details">' + esc(s.details) + "</p>" : "") +
      '<div class="sugg-controls">' +
      '<label class="sugg-status"><span class="field-label">Status</span>' +
      '<select data-role="status">' + opts + "</select></label>" +
      '<label class="field sugg-notefield"><span class="field-label">Note <span class="optional">(only you see this)</span></span>' +
      '<input type="text" data-role="note" maxlength="2000" value="' + esc(s.owner_note || "") + '" placeholder="Optional"></label>' +
      '<div class="sugg-actions">' +
      '<button type="button" class="btn btn-small" data-role="save">Save</button>' +
      '<button type="button" class="link-btn sugg-del" data-role="delete">Delete</button>' +
      "</div>" +
      '<p class="form-msg sugg-msg" role="status" aria-live="polite"></p>' +
      "</div>" +
      "</li>"
    );
  }

  function loadOwner(root) {
    var panel = root.querySelector("#sugg-owner");
    var box = root.querySelector("#sugg-owner-list");
    if (!panel || !box) return;
    withToken()
      .then(function (token) {
        return api("/rpc/am_i_site_owner", { method: "POST", token: token, body: {} }).then(function (owner) {
          if (owner !== true) return null;
          return api("/rpc/owner_list_suggestions", { method: "POST", token: token, body: {} });
        });
      })
      .then(function (res) {
        if (!document.getElementById("sugg-owner")) return;
        if (res === null) return; // Not the owner: leave the panel hidden.
        panel.hidden = false;
        if (!res.ok) {
          box.innerHTML = '<p class="muted">' + esc(fromResult(res) || MESSAGES.failed) + "</p>";
          return;
        }
        var rows = Array.isArray(res.rows) ? res.rows : [];
        box.innerHTML = rows.length
          ? '<ul class="sugg-list">' + rows.map(ownerItem).join("") + "</ul>"
          : '<p class="muted">No suggestions yet.</p>';
        wireOwner(box);
      })
      .catch(function () {
        /* Owner panel is a bonus; stay quiet if the check can't run. */
      });
  }

  function wireOwner(box) {
    box.addEventListener("click", function (event) {
      var btn = event.target.closest ? event.target.closest("button[data-role]") : null;
      if (!btn) return;
      var li = btn.closest(".sugg-admin");
      if (!li) return;
      var role = btn.getAttribute("data-role");
      if (role === "save") saveRow(li);
      else if (role === "delete") confirmDelete(li, btn);
    });
    box.addEventListener("change", function (event) {
      var sel = event.target;
      if (!sel || sel.getAttribute("data-role") !== "status") return;
      var li = sel.closest(".sugg-admin");
      if (li) saveRow(li);
    });
  }

  function rowMsg(li, text, kind) {
    var msg = li.querySelector(".sugg-msg");
    if (!msg) return;
    msg.textContent = text || "";
    msg.className = "form-msg sugg-msg" + (kind ? " is-" + kind : "");
  }

  function saveRow(li) {
    var id = Number(li.getAttribute("data-id"));
    var status = li.querySelector('[data-role="status"]').value;
    var note = li.querySelector('[data-role="note"]').value;
    var saveBtn = li.querySelector('[data-role="save"]');
    if (saveBtn) saveBtn.disabled = true;
    rowMsg(li, "Saving…", "");
    withToken()
      .then(function (token) {
        return api("/rpc/owner_set_suggestion_status", {
          method: "POST",
          token: token,
          body: { p_id: id, p_status: status, p_note: note.trim() || null }
        });
      })
      .then(function (res) {
        var bad = fromResult(res);
        if (bad) {
          rowMsg(li, bad, "error");
          return;
        }
        var b = li.querySelector(".sugg-badge");
        if (b) b.outerHTML = badge(status);
        rowMsg(li, "Saved.", "ok");
      })
      .catch(function (err) {
        rowMsg(li, message(err), "error");
      })
      .then(function () {
        if (saveBtn) saveBtn.disabled = false;
      });
  }

  /* Inline confirm (no browser dialog). */
  function confirmDelete(li, btn) {
    if (li.querySelector(".sugg-confirm")) return;
    var wrap = document.createElement("span");
    wrap.className = "sugg-confirm";
    wrap.innerHTML =
      "<span>Delete this?</span> " +
      '<button type="button" class="link-btn sugg-del" data-yes="1">Yes, delete</button> ' +
      '<button type="button" class="link-btn" data-no="1">Cancel</button>';
    btn.hidden = true;
    btn.parentNode.insertBefore(wrap, btn.nextSibling);
    wrap.addEventListener("click", function (event) {
      var b = event.target.closest ? event.target.closest("button") : null;
      if (!b) return;
      if (b.hasAttribute("data-no")) {
        wrap.remove();
        btn.hidden = false;
      } else if (b.hasAttribute("data-yes")) {
        b.disabled = true;
        doDelete(li);
      }
    });
  }

  function doDelete(li) {
    var id = Number(li.getAttribute("data-id"));
    rowMsg(li, "Deleting…", "");
    withToken()
      .then(function (token) {
        return api("/rpc/owner_delete_suggestion", { method: "POST", token: token, body: { p_id: id } });
      })
      .then(function (res) {
        var bad = fromResult(res);
        if (bad) {
          rowMsg(li, bad, "error");
          return;
        }
        var list = li.parentNode;
        li.remove();
        if (list && !list.querySelector(".sugg-item")) {
          list.parentNode.innerHTML = '<p class="muted">No suggestions yet.</p>';
        }
      })
      .catch(function (err) {
        rowMsg(li, message(err), "error");
      });
  }

  window.Suggestions = { render: render };
})();
