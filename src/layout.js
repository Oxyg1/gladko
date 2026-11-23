// Wrong keyboard layout (Russian ЙЦУКЕН <-> English QWERTY): conversion and detection.
// Pure functions, no browser APIs. Used by the content script (conversion only) and by the background
// script and tests (detection, which also needs layout-data.js).
(function (root) {
  const EN = "`qwertyuiop[]asdfghjkl;'zxcvbnm,.~QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>";
  const RU = "ёйцукенгшщзхъфывапролджэячсмитьбюЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ";
  const toRu = new Map(), toEn = new Map();
  for (let i = 0; i < EN.length; i++) { toRu.set(EN[i], RU[i]); toEn.set(RU[i], EN[i]); }

  const CYR = /[А-Яа-яЁё]/g, LAT = /[A-Za-z]/g;
  const count = (s, re) => (s.match(re) || []).length;

  // Direction from the script that dominates the text: Latin -> "ru", Cyrillic -> "en".
  function direction(text) {
    return count(text, LAT) >= count(text, CYR) ? "ru" : "en";
  }

  function convert(text, to = direction(text)) {
    const map = to === "ru" ? toRu : toEn;
    let out = "";
    for (const ch of text) out += map.has(ch) ? map.get(ch) : ch;
    return out;
  }

  // Tokens that may be words typed in the wrong layout, with offsets. Latin tokens may contain the
  // keys that produce Russian letters (`[];',.` and their shifted forms), e.g. "nfr;t" -> "также".
  const TOKEN = /[A-Za-z`~[\]{};:'",.<>]+|[А-Яа-яЁё]+/g;
  function tokens(text) {
    const out = [];
    for (const m of text.matchAll(TOKEN)) out.push({ offset: m.index, text: m[0] });
    return out;
  }

  class Detector {
    constructor(data) {
      this.lang = {};
      for (const k of ["ru", "en"]) {
        const d = data[k];
        this.lang[k] = { words: new Set(d.words.split("\n")), bigrams: d.bigrams, floor: d.floor };
      }
    }

    // Average log-probability per letter transition; higher means more word-like.
    score(word, lang) {
      const L = this.lang[lang];
      const seq = "^" + word + "$";
      let sum = 0;
      for (let i = 0; i < seq.length - 1; i++) {
        const v = L.bigrams[seq[i] + seq[i + 1]];
        sum += v === undefined ? L.floor : v;
      }
      return sum / (seq.length - 1);
    }

    known(word, lang) {
      return this.lang[lang].words.has(word);
    }

    // Decide whether a token was typed in the wrong layout.
    // opts.ignore: Set of lower-case words to leave alone (the user's dictionary).
    // opts.context: dominant script of the surrounding text, "ru" | "en" | null.
    // Returns null, or { replacement, confidence: "word" | "letters" }.
    check(token, opts = {}) {
      const ignore = opts.ignore || new Set(), context = opts.context || null;
      if (/\d/.test(token)) return null;
      const latin = count(token, LAT) > 0;
      if (latin && count(token, CYR)) return null;              // mixed scripts: leave alone
      const from = latin ? "en" : "ru", to = latin ? "ru" : "en";
      if (this.known(token.toLowerCase(), from) || ignore.has(token.toLowerCase())) return null; // a real word as typed

      // Variants: the whole token, and the token without punctuation at its edges.
      const variants = [{ lead: "", core: token, trail: "" }];
      const m = token.match(/^([.,"']*)(.*?)([.,!?:"']*)$/);
      if (m && (m[1] || m[3]) && m[2]) variants.push({ lead: m[1], core: m[2], trail: m[3] });

      let best = null;
      for (const v of variants) {
        const typed = v.core.toLowerCase();
        const letters = count(v.core, latin ? LAT : CYR);
        if (letters < 2) continue;
        if (this.known(typed, from) || ignore.has(typed)) continue;
        if (latin && /^[A-Z]{2,5}$/.test(v.core)) continue;     // acronyms: SQL, HTML, API
        const conv = convert(v.core, to);
        const lower = conv.toLowerCase();
        const alphabetOk = to === "ru" ? /^[а-яё]+$/.test(lower) : /^[a-z]+(?:'[a-z]+)?$/.test(lower);
        if (!alphabetOk) continue;
        const gain = this.score(lower, to) - this.score(typed, from);
        const strong = gain > 2.0 && this.score(lower, to) > -3.2;
        let confidence = null;
        if (this.known(lower, to)) confidence = "word";
        else if (lower.length >= 5 && strong && context !== from) confidence = "letters";
        if (!confidence) continue;
        if (lower.length <= 2 && context !== to) continue;     // "yt" -> "не" only inside Russian text
        if (context === from && !strong) continue;            // inside English text an English-looking word stays
        const cand = { replacement: v.lead + conv + v.trail, confidence, core: v.core.length };
        if (!best || (confidence === "word" && best.confidence !== "word") || (confidence === best.confidence && cand.core > best.core)) best = cand;
      }
      return best ? { replacement: best.replacement, confidence: best.confidence } : null;
    }

    // Language a token is evidence for: as typed, or after conversion.
    evidence(token) {
      const lower = token.toLowerCase().replace(/^[.,"']+|[.,!?:"']+$/g, "");
      if (count(lower, CYR) >= 2) {
        if (this.known(lower, "ru")) return "ru";
        if (this.known(convert(lower, "en").toLowerCase(), "en")) return "en";
      } else if (count(lower, LAT) >= 2) {
        if (this.known(lower, "en")) return "en";
        if (this.known(convert(lower, "ru"), "ru")) return "ru";
      }
      return null;
    }

    // Convert a whole text (a selection or the last word) to the other layout. Marks at the edges of a
    // word stay punctuation unless they make a real word: "Ghbdtn, vbh!" -> "Привет, мир!", "pyf." -> "знаю".
    convertText(text, to = direction(text)) {
      const fromLatin = to === "ru";
      return text.replace(TOKEN, (tok) => {
        const latin = !/[А-Яа-яЁё]/.test(tok);
        if (latin !== fromLatin) return tok;                 // already in the target script
        if (!(latin ? /[A-Za-z]/ : /[А-Яа-яЁё]/).test(tok)) return tok; // bare punctuation
        const full = convert(tok, to);
        const m = tok.match(/^([.,"']*)(.*?)([.,!?:"']*)$/);
        if (!m || !(m[1] || m[3]) || !m[2]) return full;
        if (this.known(full.toLowerCase(), to)) return full;
        return m[1] + convert(m[2], to) + m[3];
      });
    }

    // All wrong-layout tokens in a text. The context for each token is the language most of the
    // other words point to (as typed or after conversion).
    analyze(text, opts = {}) {
      const toks = tokens(text);
      const ev = toks.map((t) => this.evidence(t.text));
      const total = { ru: 0, en: 0 };
      for (const e of ev) if (e) total[e]++;
      const out = [];
      toks.forEach((t, i) => {
        const ru = total.ru - (ev[i] === "ru" ? 1 : 0), en = total.en - (ev[i] === "en" ? 1 : 0);
        const context = ru > en ? "ru" : en > ru ? "en" : null;
        const res = this.check(t.text, { ignore: opts.ignore, context });
        if (res) out.push({ offset: t.offset, length: t.text.length, original: t.text, replacement: res.replacement, confidence: res.confidence });
      });
      return out;
    }
  }

  const api = { convert, direction, tokens, Detector };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GladkoLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
