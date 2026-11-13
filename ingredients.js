/*
 * Splits an ingredient line into an amount and the ingredient itself, so the
 * shopping list can group the same ingredient from different recipes:
 *   "1 medium onion, diced"  -> amount "1 medium", name "onion"
 *   "3 garlic cloves, minced"-> amount "3 cloves", name "garlic"
 *   "Pinch of salt"          -> amount "pinch",    name "salt"
 * Amounts are shown side by side, never added up (units often differ).
 * Works in the browser (window.Ingredients) and in Node (module.exports).
 */
(function (root) {
  "use strict";

  var NUM = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?\\s?[¼½¾⅓⅔⅛]?|[¼½¾⅓⅔⅛])";
  var QTY = new RegExp("^(" + NUM + "(?:\\s*(?:to|-|–)\\s*" + NUM + ")?)\\s*");
  var UNITS =
    "cups?|c\\.|tablespoons?|tbsps?|tbs|teaspoons?|tsps?|lbs?|pounds?|oz|ounces?|g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|dl|" +
    "cans?|jars?|packages?|pkgs?|packets?|envelopes?|bags?|boxes|box|bottles?|cloves?|slices?|sticks?|pinch(?:es)?|dash(?:es)?|quarts?|qts?|pints?|pts?|" +
    "bunch(?:es)?|heads?|sprigs?|stalks?|handfuls?|pieces?|fillets?|strips?|loaf|loaves|dozen";
  var UNIT = new RegExp("^(" + UNITS + ")\\b\\.?\\s*", "i");
  var SIZE = /^(extra[- ]large|large|medium|small|heaping|level|scant|generous|whole)\s+/i;
  var OF = /^of\s+/i;
  var PAREN_LEAD = /^(\([^)]*\))\s*/;
  // Words describing preparation, dropped from the start of the ingredient name.
  var PREP = /^(very|ripe|chopped|diced|minced|sliced|shredded|grated|melted|softened|warm|cold|mashed|fresh|freshly|finely|roughly|thinly|packed|sifted|cooked|peeled|beaten)\s+/i;
  var NO_SINGULAR = /(ss|us|is|molasses|grits|oats|swiss|hummus|asparagus|couscous|provence|herbes|greens|lentils)$/i;

  function singular(word) {
    if (NO_SINGULAR.test(word) || word.length < 4) return word;
    if (/oes$/i.test(word)) return word.slice(0, -2);
    if (/ies$/i.test(word)) return word.slice(0, -3) + "y";
    if (/(ches|shes|xes)$/i.test(word)) return word.slice(0, -2);
    if (/s$/i.test(word)) return word.slice(0, -1);
    return word;
  }

  /* The grouping key and display name for an ingredient's name part. */
  function keyOf(name) {
    var k = name
      .replace(/\([^)]*\)/g, " ")
      .split(",")[0]
      .replace(/\s+(to taste|per\s|for (?:serving|garnish|frying|cooking|greasing|the pan)|as needed|if (?:needed|available|desired))\b.*$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    var prev;
    do {
      prev = k;
      k = k.replace(PREP, "");
    } while (k !== prev);
    k = k.replace(/[.;:]+$/, "").trim();
    var words = k.split(" ");
    if (words.length) words[words.length - 1] = singular(words[words.length - 1]);
    return words.join(" ");
  }

  function parse(line) {
    var text = String(line == null ? "" : line).replace(/\s+/g, " ").trim();
    if (!text) return null;
    // Group headings such as "For the glaze:" aren't things to buy.
    if (/:$/.test(text) || /^for the\b/i.test(text)) return null;

    var rest = text;
    var amount = [];
    // "Juice of 1 lemon" / "Zest of 2 limes" -> amount "1 (juice)", name "lemon".
    var jz = new RegExp("^(juice|zest)\\s+(?:and\\s+zest\\s+)?of\\s+(" + NUM + ")\\s+", "i").exec(rest);
    if (jz) {
      rest = rest.slice(jz[0].length);
      amount.push(jz[2].trim() + " (" + jz[1].toLowerCase() + ")");
    }
    var m = jz ? null : QTY.exec(rest);
    if (m) {
      amount.push(m[1].replace(/\s+/g, " ").trim());
      rest = rest.slice(m[0].length);
      m = PAREN_LEAD.exec(rest);
      if (m) {
        amount.push(m[1]);
        rest = rest.slice(m[0].length);
      }
    }
    m = SIZE.exec(rest);
    if (m && amount.length) {
      amount.push(m[1].toLowerCase());
      rest = rest.slice(m[0].length);
    }
    m = UNIT.exec(rest);
    // A unit needs a number before it, except "pinch of …" / "dash of …".
    if (m && (amount.length || /^(pinch|dash)/i.test(m[1]))) {
      amount.push(m[1].toLowerCase());
      rest = rest.slice(m[0].length);
      m = PAREN_LEAD.exec(rest);
      if (m) {
        amount.push(m[1]);
        rest = rest.slice(m[0].length);
      }
    }
    rest = rest.replace(OF, "");

    // "3 garlic cloves" -> amount "3 cloves", name "garlic".
    var tail = /^([^,(]+?)\s+(cloves?)\b/i.exec(rest);
    if (tail && amount.length) {
      amount.push(tail[2].toLowerCase());
      rest = tail[1] + rest.slice(tail[0].length);
    }

    var key = keyOf(rest) || keyOf(text);
    var display = key.charAt(0).toUpperCase() + key.slice(1);
    return {
      line: text,
      amount: amount.join(" ").replace(/\s+/g, " ").trim(),
      key: key,
      name: display,
      optional: /\boptional\b/i.test(text)
    };
  }

  /* Combine parsed lines from several recipes:
     [{ recipe: {id, title}, lines: [...] }] -> [{ key, name, uses: [{amount, line, optional, recipe}] }] */
  function group(sources) {
    var byKey = Object.create(null);
    var order = [];
    sources.forEach(function (src) {
      (src.lines || []).forEach(function (line) {
        var p = parse(line);
        if (!p) return;
        if (!byKey[p.key]) {
          byKey[p.key] = { key: p.key, name: p.name, uses: [] };
          order.push(p.key);
        }
        byKey[p.key].uses.push({ amount: p.amount, line: p.line, optional: p.optional, recipe: src.recipe });
      });
    });
    return order
      .map(function (k) {
        var item = byKey[k];
        item.optional = item.uses.every(function (u) {
          return u.optional;
        });
        return item;
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
  }

  var api = { parse: parse, group: group, keyOf: keyOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Ingredients = api;
})(typeof window !== "undefined" ? window : this);
