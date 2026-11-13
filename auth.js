/*
 * Contributor accounts (Supabase Auth), for adding and editing recipes.
 * Reading recipes and leaving reviews need no account.
 *
 * - Accounts are invite-only: invite people from the Supabase dashboard
 *   (Authentication > Users > Invite user). The invite email links back to
 *   this site, where they choose a password (#/set-password).
 * - Sign in with email and password (#/signin). "Forgot your password?"
 *   emails a reset link that also lands on #/set-password.
 * - The sign-in is kept on this device until they sign out.
 *
 * See "Contributor accounts" in README.md and supabase/add-accounts.sql.
 */
(function () {
  "use strict";

  var cfg = window.REVIEWS_CONFIG || {};
  var base = typeof cfg.url === "string" ? cfg.url.replace(/\/+$/, "") + "/auth/v1" : "";
  var key = typeof cfg.key === "string" ? cfg.key : "";
  var STORE = "dse-session";
  var session = load();
  var listeners = [];
  var pending = null; // message or link type picked up from an email link
  var refreshing = null;

  function esc(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------- Session storage ---------- */

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE) || "null");
      return s && s.access_token && s.refresh_token ? s : null;
    } catch (e) {
      return null;
    }
  }

  function save(s) {
    session = s;
    try {
      if (s) localStorage.setItem(STORE, JSON.stringify(s));
      else localStorage.removeItem(STORE);
    } catch (e) {
      /* Private browsing: the sign-in lasts until the tab closes. */
    }
    listeners.forEach(function (fn) {
      try {
        fn();
      } catch (e) {
        /* ignore */
      }
    });
  }

  function claims(token) {
    try {
      var part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (part.length % 4) part += "=";
      return JSON.parse(decodeURIComponent(escape(atob(part))));
    } catch (e) {
      return {};
    }
  }

  function fromTokens(t) {
    var c = claims(t.access_token);
    var expiresAt = Number(t.expires_at) || (c.exp ? c.exp : Math.floor(Date.now() / 1000) + Number(t.expires_in || 3600));
    return {
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: expiresAt,
      email: (t.user && t.user.email) || c.email || ""
    };
  }

  /* ---------- Talking to Supabase Auth ---------- */

  function call(path, options) {
    options = options || {};
    if (!base || !key || !window.fetch) return Promise.reject(fail("not_set_up"));
    var headers = { apikey: key, "Content-Type": "application/json", Accept: "application/json" };
    if (options.token) headers.Authorization = "Bearer " + options.token;
    return fetch(base + path, {
      method: options.method || "POST",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store"
    })
      .catch(function () {
        throw fail("network");
      })
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            data = null;
          }
          if (!res.ok) {
            var err = fail(errorCode(res.status, data));
            err.status = res.status;
            throw err;
          }
          return data;
        });
      });
  }

  function fail(code) {
    var e = new Error(code);
    e.code = code;
    return e;
  }

  function errorCode(status, data) {
    var code = (data && (data.error_code || data.code || data.error)) || "";
    var msg = String((data && (data.msg || data.message || data.error_description)) || "").toLowerCase();
    if (code === "invalid_credentials" || code === "invalid_grant" || /invalid login credentials/.test(msg)) return "bad_login";
    if (code === "email_not_confirmed" || /not confirmed/.test(msg)) return "not_confirmed";
    if (code === "weak_password" || /password should/.test(msg)) return "weak_password";
    if (code === "same_password" || /different from the old/.test(msg)) return "same_password";
    if (status === 429 || /rate limit|too many/.test(msg)) return "rate_limit";
    if (status === 401 || status === 403) return "expired";
    return "failed";
  }

  var MESSAGES = {
    bad_login: "That email or password isn’t right. Check them and try again.",
    not_confirmed: "This account hasn’t been set up yet. Open the invite email and click its link first.",
    weak_password: "Choose a longer password: at least 8 characters.",
    same_password: "That’s your current password. Choose a new one.",
    rate_limit: "Too many tries just now. Wait a few minutes and try again.",
    expired: "That link has expired or was already used. Sign in, or use “Forgot your password?” to get a new one.",
    network: "Couldn’t reach the sign-in service. Check your connection and try again.",
    not_set_up: "Sign-in isn’t available right now.",
    failed: "Something went wrong. Try again in a minute."
  };

  function signIn(email, password) {
    return call("/token?grant_type=password", { body: { email: email, password: password } }).then(function (t) {
      save(fromTokens(t));
      return session;
    });
  }

  function refresh() {
    if (!session) return Promise.resolve(null);
    if (refreshing) return refreshing;
    var rt = session.refresh_token;
    refreshing = call("/token?grant_type=refresh_token", { body: { refresh_token: rt } })
      .then(function (t) {
        save(fromTokens(t));
        return session.access_token;
      })
      .catch(function (err) {
        // A refresh token that's no longer valid means signed out; a network
        // problem keeps the session for next time.
        if (err && err.code !== "network") save(null);
        return null;
      })
      .then(function (token) {
        refreshing = null;
        return token;
      });
    return refreshing;
  }

  /* A fresh access token for saving, or null when signed out. */
  function token() {
    if (!session) return Promise.resolve(null);
    var now = Math.floor(Date.now() / 1000);
    if (session.expires_at - now > 60) return Promise.resolve(session.access_token);
    return refresh();
  }

  function signOut() {
    var t = session && session.access_token;
    save(null);
    if (t) call("/logout", { token: t }).catch(function () {});
  }

  function setPassword(password) {
    return token().then(function (t) {
      if (!t) throw fail("expired");
      return call("/user", { method: "PUT", token: t, body: { password: password } });
    });
  }

  function sendReset(email) {
    var back = location.origin + location.pathname;
    return call("/recover?redirect_to=" + encodeURIComponent(back), { body: { email: email } });
  }

  /* ---------- Links from invite and reset emails ----------
     Supabase sends people back to the site with the sign-in in the address:
     #access_token=…&refresh_token=…&type=invite (or type=recovery), or
     #error=…&error_description=… when the link is old. This runs before the
     page's router, turns that into a session, and tidies the address. */

  function pickUpEmailLink() {
    var hash = location.hash.replace(/^#/, "");
    if (!/(^|&)(access_token|error_description|error_code)=/.test(hash)) return;
    var params = {};
    hash.split("&").forEach(function (pair) {
      var i = pair.indexOf("=");
      if (i > 0) {
        try {
          params[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, " "));
        } catch (e) {
          params[pair.slice(0, i)] = pair.slice(i + 1);
        }
      }
    });
    var next = "#/signin";
    if (params.access_token && params.refresh_token) {
      save(fromTokens(params));
      pending = { type: params.type || "" };
      next = params.type === "invite" || params.type === "recovery" ? "#/set-password" : "#/add";
    } else {
      pending = { error: "expired" };
    }
    try {
      history.replaceState(null, "", location.pathname + location.search + next);
    } catch (e) {
      location.hash = next;
    }
  }

  pickUpEmailLink();
  // Also when the site is already open in this tab. This runs before the
  // page's own router (auth.js loads first), so the router sees the tidied address.
  window.addEventListener("hashchange", pickUpEmailLink);

  /* ---------- Pages ---------- */

  var backIcon =
    '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M11.5 5L6.5 10l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function setMsg(el, text, kind) {
    el.textContent = text || "";
    el.className = "form-msg" + (kind ? " is-" + kind : "");
  }

  function busy(btn, on, label) {
    btn.disabled = on;
    btn.textContent = label;
  }

  /* Sign-in page. opts.next = where to go after (default #/add);
     opts.reason = a line explaining why sign-in is needed. */
  function renderSignIn(root, opts) {
    opts = opts || {};
    var next = opts.next || "#/add";
    var note = pending && pending.error ? MESSAGES[pending.error] : "";
    pending = null;
    document.title = "Contributor sign in · The Dark Sparrow Eats";
    root.innerHTML =
      '<section class="add auth">' +
      '<a class="back" href="#/">' + backIcon + "All recipes</a>" +
      '<h1 class="add-title">Contributor sign in</h1>' +
      '<p class="add-sub">' +
      esc(opts.reason || "Reading recipes needs no account. To add or edit recipes, sign in with the account you were invited to.") +
      "</p>" +
      '<form class="link-form auth-form" id="signin-form" novalidate>' +
      '<label class="field"><span class="field-label">Email</span>' +
      '<input name="email" type="email" autocomplete="username" inputmode="email" required spellcheck="false"></label>' +
      '<label class="field"><span class="field-label">Password</span>' +
      '<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<div class="auth-row"><button class="btn" type="submit">Sign in</button>' +
      '<button type="button" class="link-btn" id="forgot">Forgot your password?</button></div>' +
      '<p class="form-msg" id="signin-msg" role="status" aria-live="polite"></p>' +
      "</form>" +
      '<form class="link-form auth-form" id="reset-form" novalidate hidden>' +
      '<p class="auth-help">Enter your email and we’ll send a link to choose a new password.</p>' +
      '<label class="field"><span class="field-label">Email</span>' +
      '<input name="email" type="email" autocomplete="username" inputmode="email" required spellcheck="false"></label>' +
      '<div class="auth-row"><button class="btn" type="submit">Email me a reset link</button>' +
      '<button type="button" class="link-btn" id="back-signin">Back to sign in</button></div>' +
      '<p class="form-msg" id="reset-msg" role="status" aria-live="polite"></p>' +
      "</form>" +
      '<p class="auth-help">No account? Contributors are invited by Art. <a href="/guide/">How adding recipes works</a></p>' +
      "</section>";

    var form = root.querySelector("#signin-form");
    var msg = root.querySelector("#signin-msg");
    var reset = root.querySelector("#reset-form");
    var resetMsg = root.querySelector("#reset-msg");
    if (note) setMsg(msg, note, "error");

    root.querySelector("#forgot").addEventListener("click", function () {
      form.hidden = true;
      reset.hidden = false;
      reset.elements.email.value = form.elements.email.value;
      reset.elements.email.focus();
    });
    root.querySelector("#back-signin").addEventListener("click", function () {
      reset.hidden = true;
      form.hidden = false;
      form.elements.email.focus();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = form.elements.email.value.trim();
      var pw = form.elements.password.value;
      if (!email || !pw) {
        setMsg(msg, "Enter your email and password.", "error");
        (email ? form.elements.password : form.elements.email).focus();
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      busy(btn, true, "Signing in…");
      setMsg(msg, "", "");
      signIn(email, pw)
        .then(function () {
          if (location.hash === next) {
            // Same address: tell the page to draw itself again.
            window.dispatchEvent(new HashChangeEvent("hashchange"));
          } else {
            location.hash = next;
          }
        })
        .catch(function (err) {
          busy(btn, false, "Sign in");
          setMsg(msg, MESSAGES[(err && err.code) || "failed"] || MESSAGES.failed, "error");
          form.elements.password.select();
        });
    });

    reset.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = reset.elements.email.value.trim();
      if (!email) {
        setMsg(resetMsg, "Enter your email.", "error");
        reset.elements.email.focus();
        return;
      }
      var btn = reset.querySelector('button[type="submit"]');
      busy(btn, true, "Sending…");
      sendReset(email)
        .then(function () {
          busy(btn, false, "Email me a reset link");
          setMsg(resetMsg, "If that email has an account, a reset link is on its way. Check your inbox (and spam folder).", "ok");
        })
        .catch(function (err) {
          busy(btn, false, "Email me a reset link");
          setMsg(resetMsg, MESSAGES[(err && err.code) || "failed"] || MESSAGES.failed, "error");
        });
    });

    form.elements.email.focus();
  }

  /* Choose a password, after an invite or reset link. */
  function renderSetPassword(root) {
    var type = pending && pending.type;
    pending = null;
    if (!session) {
      renderSignIn(root, { reason: "That link has expired or was already used. Sign in, or use “Forgot your password?” to get a new link." });
      return;
    }
    var welcome = type === "invite";
    document.title = (welcome ? "Welcome" : "Choose a new password") + " · The Dark Sparrow Eats";
    root.innerHTML =
      '<section class="add auth">' +
      '<h1 class="add-title">' + (welcome ? "Welcome to The Dark Sparrow Eats" : "Choose a new password") + "</h1>" +
      '<p class="add-sub">' +
      (welcome
        ? "You’ve been invited to add and edit recipes. Choose a password for <strong>" + esc(session.email) + "</strong>; you’ll use it to sign in."
        : "Choose a new password for <strong>" + esc(session.email) + "</strong>.") +
      "</p>" +
      '<form class="link-form auth-form" id="pw-form" novalidate>' +
      '<label class="field"><span class="field-label">New password</span>' +
      '<input name="pw" type="password" autocomplete="new-password" minlength="8" required></label>' +
      '<label class="field"><span class="field-label">Type it again</span>' +
      '<input name="pw2" type="password" autocomplete="new-password" minlength="8" required></label>' +
      '<p class="field-help">At least 8 characters.</p>' +
      '<div class="auth-row"><button class="btn" type="submit">Save password</button></div>' +
      '<p class="form-msg" id="pw-msg" role="status" aria-live="polite"></p>' +
      "</form>" +
      "</section>";

    var form = root.querySelector("#pw-form");
    var msg = root.querySelector("#pw-msg");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = form.elements.pw.value;
      if (pw.length < 8) {
        setMsg(msg, MESSAGES.weak_password, "error");
        form.elements.pw.focus();
        return;
      }
      if (pw !== form.elements.pw2.value) {
        setMsg(msg, "The two passwords don’t match.", "error");
        form.elements.pw2.focus();
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      busy(btn, true, "Saving…");
      setPassword(pw)
        .then(function () {
          form.innerHTML =
            '<p class="form-msg is-ok">Password saved. You’re signed in on this device.</p>' +
            '<div class="auth-row"><a class="btn" href="#/add">Add a recipe</a><a class="link-btn" href="/guide/">Read the guide</a></div>';
        })
        .catch(function (err) {
          busy(btn, false, "Save password");
          setMsg(msg, MESSAGES[(err && err.code) || "failed"] || MESSAGES.failed, "error");
        });
    });
    form.elements.pw.focus();
  }

  /* "Signed in as … · Sign out" / "Contributor sign in" in the footer. */
  function paintAccount() {
    var el = document.getElementById("footer-account");
    if (!el) return;
    if (session) {
      el.innerHTML =
        "Signed in as " + esc(session.email || "a contributor") +
        ' · <button type="button" class="link-btn" id="sign-out">Sign out</button>';
      el.querySelector("#sign-out").addEventListener("click", function () {
        signOut();
        if (/^#\/(add|edit\/)/.test(location.hash)) location.hash = "#/";
      });
    } else {
      el.innerHTML = '<a href="#/signin">Contributor sign in</a>';
    }
  }

  listeners.push(paintAccount);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paintAccount);
  else paintAccount();

  window.Auth = {
    signedIn: function () {
      return !!session;
    },
    email: function () {
      return session ? session.email : "";
    },
    userId: function () {
      return session ? claims(session.access_token).sub || "" : "";
    },
    token: token,
    signOut: signOut,
    onChange: function (fn) {
      listeners.push(fn);
    },
    renderSignIn: renderSignIn,
    renderSetPassword: renderSetPassword,
    message: function (code) {
      return MESSAGES[code] || MESSAGES.failed;
    }
  };
})();
