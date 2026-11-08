// Pure helpers shared by the background script and the tests (no browser APIs here).
(function (root) {
  // Split text into units (lines/paragraphs). A unit longer than maxUnit is split at sentence/space.
  function splitUnits(text, maxUnit = 15000) {
    const units = [];
    let pos = 0;
    for (const line of text.split("\n")) {
      let start = 0;
      while (line.length - start > maxUnit) {
        const slice = line.slice(start, start + maxUnit);
        let cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
        if (cut < maxUnit / 2) cut = slice.lastIndexOf(" ");
        cut = cut < maxUnit / 2 ? maxUnit : cut + 1;
        units.push({ start: pos + start, text: line.slice(start, start + cut) });
        start += cut;
      }
      units.push({ start: pos + start, text: line.slice(start) });
      pos += line.length + 1;
    }
    return units;
  }

  // Group units into requests of at most maxChars; every unit remembers its offset in the request text.
  function pack(units, maxChars = 15000) {
    const groups = [];
    let cur = null;
    for (const u of units) {
      if (!cur || cur.text.length + 1 + u.text.length > maxChars) {
        cur = { text: "", units: [] };
        groups.push(cur);
      }
      if (cur.units.length) cur.text += "\n";
      cur.units.push({ unit: u, reqOffset: cur.text.length });
      cur.text += u.text;
    }
    return groups;
  }

  // Map a server response for a packed request back onto its units (offsets relative to each unit).
  function distribute(group, matches) {
    const out = group.units.map(() => []);
    for (const m of matches) {
      for (let i = 0; i < group.units.length; i++) {
        const { unit, reqOffset } = group.units[i];
        if (m.offset >= reqOffset && m.offset + m.length <= reqOffset + unit.text.length) {
          out[i].push(Object.assign({}, m, { offset: m.offset - reqOffset }));
          break;
        }
      }
    }
    return out;
  }

  // Sliding-window limiter for the public LanguageTool API (requests and characters per window).
  class RateLimiter {
    constructor(maxReq = 18, maxChars = 70000, windowMs = 60000) {
      Object.assign(this, { maxReq, maxChars, windowMs });
      this.log = [];
    }
    // Returns 0 and records the request if it may go now, otherwise ms to wait.
    take(chars, now = Date.now()) {
      this.log = this.log.filter((e) => now - e.t < this.windowMs);
      chars = Math.min(chars, this.maxChars);
      let r = this.log.length, u = this.log.reduce((a, e) => a + e.c, 0);
      if (r < this.maxReq && u + chars <= this.maxChars) {
        this.log.push({ t: now, c: chars });
        return 0;
      }
      for (const e of this.log) {
        r--; u -= e.c;
        if (r < this.maxReq && u + chars <= this.maxChars) return Math.max(1, e.t + this.windowMs - now);
      }
      return this.windowMs;
    }
  }

  // Small LRU map.
  class LRU {
    constructor(max) { this.max = max; this.m = new Map(); }
    get(k) {
      if (!this.m.has(k)) return undefined;
      const v = this.m.get(k);
      this.m.delete(k); this.m.set(k, v);
      return v;
    }
    set(k, v) {
      this.m.delete(k); this.m.set(k, v);
      if (this.m.size > this.max) this.m.delete(this.m.keys().next().value);
    }
  }

  const api = { splitUnits, pack, distribute, RateLimiter, LRU };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GladkoLib = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
