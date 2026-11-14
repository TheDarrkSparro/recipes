/* Color schemes for The Dark Sparrow Eats.
   Loaded in <head> so the saved scheme is applied before the page paints
   (no flash of the default colors). The picker sits in the footer.
   The colors themselves are in styles.css under [data-theme="..."]. */
(function () {
  "use strict";

  var KEY = "dse-theme";
  var THEMES = [
    { id: "rojigualda", label: "Red & Gold", color: "#aa151b", stripe: "#f1bf00" },
    { id: "basque", label: "Basque Green", color: "#00753a", stripe: "#d52b1e" },
    { id: "ink", label: "Ink & Copper", color: "#1f3a5f", stripe: "#d08a3c" }
  ];

  function find(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return THEMES[0];
  }

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function apply(id) {
    var t = find(id);
    document.documentElement.setAttribute("data-theme", t.id);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t.color);
    return t.id;
  }

  var current = apply(saved());

  function paint() {
    var el = document.getElementById("footer-theme");
    if (!el) return;
    el.innerHTML =
      '<span class="theme-label" id="theme-label">Colors</span>' +
      '<span class="theme-swatches" role="radiogroup" aria-labelledby="theme-label">' +
      THEMES.map(function (t) {
        var on = t.id === current;
        return (
          '<button type="button" class="theme-swatch' + (on ? " is-on" : "") + '" role="radio" aria-checked="' + on + '" data-theme-id="' + t.id + '" title="' + t.label + '">' +
          '<span class="theme-dot" style="background:' + t.color + ";box-shadow:inset 0 -5px 0 " + t.stripe + '"></span>' +
          '<span class="theme-name">' + t.label + "</span>" +
          "</button>"
        );
      }).join("") +
      "</span>";
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-theme-id]") : null;
    if (!b) return;
    current = apply(b.getAttribute("data-theme-id"));
    try { localStorage.setItem(KEY, current); } catch (err) { /* private mode: applies for this visit only */ }
    paint();
    var again = document.querySelector('[data-theme-id="' + current + '"]');
    if (again) again.focus();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();

  window.Theme = { list: THEMES, current: function () { return current; }, set: function (id) { current = apply(id); paint(); } };
})();
