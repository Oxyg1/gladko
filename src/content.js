(() => {
  const DEBOUNCE_MS = 1300;
  const MAX_CHARS = 100000;
  const BLOCK = new Set(["P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "TR", "TABLE", "SECTION", "ARTICLE", "HEADER", "FOOTER"]);
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
  const MIRROR_PROPS = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch", "fontKerning", "fontFeatureSettings", "letterSpacing", "wordSpacing", "textTransform", "textIndent", "textAlign", "direction", "tabSize", "lineHeight", "whiteSpace", "overflowWrap", "wordBreak", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom"];

  const tr = (k, ...a) => browser.i18n.getMessage(k, a.map(String)) || k;
  let enabled = true, pausedUntil = 0, mutedSites = [], layoutMode = "off";
  const active = () => enabled && Date.now() >= pausedUntil && !mutedSites.includes(location.hostname);
  let target = null;      // focused field or contenteditable root
  let text = "";          // text of target as last seen
  let model = null;       // contenteditable text-node map
  let matches = [];
  let seq = 0, timer = null, rafId = 0, lastError = "", busy = false;
  let card = null, cardMatch = null, panel = null;
  let dictionary = new Set();
  const ignored = new Set();
  const cache = new Map();

  browser.storage.local.get({ enabled: true, dictionary: [], pausedUntil: 0, mutedSites: [], layoutMode: "off" }).then((s) => {
    enabled = s.enabled;
    layoutMode = s.layoutMode;
    pausedUntil = s.pausedUntil;
    mutedSites = s.mutedSites;
    dictionary = new Set(s.dictionary);
  });
  browser.storage.onChanged.addListener((ch) => {
    if (ch.enabled) enabled = ch.enabled.newValue;
    if (ch.pausedUntil) pausedUntil = ch.pausedUntil.newValue || 0;
    if (ch.mutedSites) mutedSites = ch.mutedSites.newValue || [];
    if (ch.layoutMode) { layoutMode = ch.layoutMode.newValue || "off"; if (target) schedule(0); }
    if (!active()) detach();
    if (ch.dictionary) { dictionary = new Set(ch.dictionary.newValue || []); refilter(); }
  });

  // ---------- helpers ----------
  const mk = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };
  const isField = (el) => el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
  const isEditable = (el) =>
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && ["text", "search", ""].includes(el.type)) ||
    (el instanceof HTMLElement && el.isContentEditable);
  function editRoot(el) {
    while (el.parentElement && el.parentElement.isContentEditable) el = el.parentElement;
    return el;
  }
  function kind(m) {
    const t = m.issueType;
    if (t === "layout") return { cls: "gl-layout", label: tr("kindLayout") };
    if (t === "misspelling") return { cls: "gl-spell", label: tr("kindSpell") };
    if (t === "style" || t === "register" || t === "locale-violation") return { cls: "gl-style", label: tr("kindStyle") };
    if (t === "typographical" || t === "whitespace") return { cls: "gl-grammar", label: tr("kindPunct") };
    return { cls: "gl-grammar", label: tr("kindGrammar") };
  }
  const word = (m) => text.substr(m.offset, m.length);
  const ignoreKey = (m) => m.ruleId + "|" + word(m);
  const visible = (m) =>
    !ignored.has(ignoreKey(m)) && !(m.issueType === "misspelling" && dictionary.has(word(m).toLowerCase()));

  // ---------- overlay host ----------
  const host = mk("div", "gl-host");
  const layer = mk("div");
  const mirror = mk("div", "gl-mirror");
  const mirrorText = document.createTextNode("");
  mirror.append(mirrorText);
  const badge = mk("div", "gl-badge");
  host.append(mirror, layer);
  badge.addEventListener("mousedown", (e) => e.preventDefault());
  badge.addEventListener("click", togglePanel);

  function ensureHost() {
    if (!host.isConnected) document.documentElement.appendChild(host);
  }

  // ---------- text model ----------
  function ceModel(root) {
    const segs = [];
    let s = "";
    const walk = (node) => {
      for (let n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === Node.TEXT_NODE) {
          segs.push({ node: n, start: s.length });
          s += n.data;
        } else if (n.nodeType === Node.ELEMENT_NODE && n !== host && !SKIP.has(n.tagName)) {
          if (n.tagName === "BR") { s += "\n"; continue; }
          const block = BLOCK.has(n.tagName);
          if (block && s && !s.endsWith("\n")) s += "\n";
          walk(n);
          if (block && s && !s.endsWith("\n")) s += "\n";
        }
      }
    };
    walk(root);
    return { text: s, segs };
  }
  // flat offset -> DOM position; virtual newlines resolve to the neighbouring text node
  function cePos(off, forward) {
    for (const sg of model.segs) {
      const end = sg.start + sg.node.data.length;
      if (off < sg.start) return [sg.node, 0];
      if (off < end || (off === end && !forward)) return [sg.node, off - sg.start];
    }
    const last = model.segs[model.segs.length - 1];
    return last ? [last.node, last.node.data.length] : null;
  }
  function readText() {
    if (isField(target)) return target.value;
    model = ceModel(target);
    return model.text;
  }

  // ---------- geometry ----------
  function syncMirror() {
    const el = target, cs = getComputedStyle(el), r = el.getBoundingClientRect(), st = mirror.style;
    for (const p of MIRROR_PROPS) st[p] = cs[p];
    const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight);
    const pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
    st.boxSizing = "content-box";
    st.left = r.left + el.clientLeft + "px";
    st.top = r.top + el.clientTop + "px";
    st.width = Math.max(0, el.clientWidth - pl - pr) + "px";
    st.height = Math.max(0, el.clientHeight - pt - pb) + "px";
    if (el instanceof HTMLInputElement) {
      st.whiteSpace = "pre";
      st.lineHeight = st.height; // inputs centre their single line vertically
    }
    mirrorText.data = el.value + "​";
    mirror.scrollTop = el.scrollTop;
    mirror.scrollLeft = el.scrollLeft;
  }
  function clipRect() {
    const r = target.getBoundingClientRect();
    if (!isField(target)) return r;
    const left = r.left + target.clientLeft, top = r.top + target.clientTop;
    return { left, top, right: left + target.clientWidth, bottom: top + target.clientHeight };
  }
  function rangeFor(m) {
    const range = document.createRange();
    if (isField(target)) {
      range.setStart(mirrorText, m.offset);
      range.setEnd(mirrorText, m.offset + m.length);
      return range;
    }
    const a = cePos(m.offset, true), b = cePos(m.offset + m.length, false);
    if (!a || !b) return null;
    range.setStart(a[0], a[1]);
    range.setEnd(b[0], b[1]);
    return range;
  }

  // ---------- drawing ----------
  function redraw() {
    if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; draw(); });
  }
  function draw() {
    layer.replaceChildren();
    if (!target) return;
    if (!target.isConnected) { detach(); return; }
    ensureHost();
    if (isField(target)) syncMirror();
    else if (!model || readText() !== text) return; // DOM changed under us; the input/mutation path will refresh
    const clip = clipRect();
    const off = clip.bottom < 0 || clip.top > innerHeight || clip.right < 0 || clip.left > innerWidth;
    for (const m of matches) {
      m.rects = [];
      if (off) continue;
      let range;
      try { range = rangeFor(m); } catch (e) { continue; }
      if (!range) continue;
      for (const rc of range.getClientRects()) {
        const l = Math.max(rc.left, clip.left), r = Math.min(rc.right, clip.right);
        const t = Math.max(rc.top, clip.top), b = Math.min(rc.bottom, clip.bottom);
        if (r - l < 1 || b - t < 4) continue;
        const d = mk("div", "gl-mark " + kind(m).cls + (m === cardMatch ? " gl-active" : ""));
        Object.assign(d.style, { left: l + "px", top: t + "px", width: r - l + "px", height: b - t + "px" });
        layer.append(d);
        m.rects.push({ left: l, top: t, right: r, bottom: b });
      }
    }
    drawBadge(clip, off);
    if (card) placeCard();
    if (panel) placePanel();
  }
  function drawBadge(clip, off) {
    if (off || (!busy && !matches.length && !lastError && text.trim().length < 3)) { badge.remove(); return; }
    if (!badge.isConnected) host.append(badge);
    const spell = matches.filter((m) => m.issueType === "misspelling").length;
    badge.className = "gl-badge " + (busy ? "gl-busy" : lastError ? "gl-err" : spell ? "gl-bad" : matches.length ? "gl-warn" : "");
    badge.textContent = busy ? "" : lastError ? "!" : matches.length ? String(matches.length) : "✓";
    badge.title = lastError || (matches.length ? tr("badgeFound", matches.length) : tr("badgeNone"));
    const h = clip.bottom - clip.top;
    const top = h < 44 ? clip.top + (h - 22) / 2 : clip.bottom - 28;
    badge.style.left = Math.max(0, clip.right - 30) + "px";
    badge.style.top = Math.max(0, top) + "px";
  }

  // ---------- checking ----------
  function schedule(delay = DEBOUNCE_MS) {
    clearTimeout(timer);
    timer = setTimeout(check, delay);
  }
  async function check() {
    const el = target;
    if (!el) return;
    const t = readText();
    text = t;
    if (t.trim().length < 3) { matches = []; lastError = ""; closeCard(); redraw(); return; }
    const my = ++seq;
    const layoutP = layoutMode === "suggest"
      ? browser.runtime.sendMessage({ type: "layoutAnalyze", text: t.slice(0, MAX_CHARS) }).catch(() => [])
      : Promise.resolve([]);
    let res = cache.get(t);
    if (!res) {
      busy = true;
      redraw();
      res = await browser.runtime.sendMessage({ type: "check", text: t.slice(0, MAX_CHARS) }).catch(() => null);
      if (res && !res.error) {
        cache.set(t, res);
        if (cache.size > 40) cache.delete(cache.keys().next().value);
      }
    }
    const layoutFound = (await layoutP) || [];
    if (my !== seq || el !== target) return;
    busy = false;
    if (text !== t) { redraw(); return; } // typed while waiting; a newer check is already scheduled
    if (!res || res.error) {
      lastError = res ? res.error : tr("errNoResponse");
      redraw();
      return;
    }
    lastError = "";
    matches = mergeLayout(res.matches, layoutFound).filter(visible);
    closeCard();
    if (panel) renderPanel();
    redraw();
  }
  // Wrong-layout findings become ordinary matches; server matches on the same words are dropped.
  function mergeLayout(server, found) {
    const lay = found.map((f) => ({
      offset: f.offset, length: f.length, message: tr("layoutMsg"), shortMessage: "",
      replacements: [f.replacement], issueType: "layout", category: "", ruleId: "GLADKO_LAYOUT",
    }));
    const overlaps = (m) => lay.some((l) => m.offset < l.offset + l.length && l.offset < m.offset + m.length);
    return [...server.filter((m) => !overlaps(m)).map((m) => Object.assign({}, m)), ...lay].sort((a, b) => a.offset - b.offset);
  }
  function refilter() {
    matches = matches.filter(visible);
    if (cardMatch && !matches.includes(cardMatch)) closeCard();
    if (panel) renderPanel();
    redraw();
  }

  // keep existing underlines in place while the user types, until the next check result
  function onEdit() {
    if (!target) return;
    const old = text;
    const now = readText();
    if (now === old) { redraw(); return; }
    text = now;
    let p = 0;
    const min = Math.min(old.length, now.length);
    while (p < min && old[p] === now[p]) p++;
    let s = 0;
    while (s < min - p && old[old.length - 1 - s] === now[now.length - 1 - s]) s++;
    const oldEnd = old.length - s, delta = now.length - old.length;
    matches = matches.filter((m) => m.offset + m.length < p || m.offset > oldEnd);
    for (const m of matches) if (m.offset > oldEnd) m.offset += delta;
    if (cardMatch && !matches.includes(cardMatch)) closeCard();
    if (panel) renderPanel();
    redraw();
    schedule();
  }

  // ---------- correction ----------
  function apply(m, rep) {
    const el = target;
    if (!el) return;
    el.focus();
    if (isField(el)) {
      el.setSelectionRange(m.offset, m.offset + m.length);
      if (!document.execCommand("insertText", false, rep)) {
        el.setRangeText(rep, m.offset, m.offset + m.length, "end");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } else {
      readText();
      const range = rangeFor(m);
      if (!range) return;
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      if (rep) document.execCommand("insertText", false, rep);
      else document.execCommand("delete");
    }
    closeCard();
    onEdit();
    schedule(300);
    browser.runtime.sendMessage({ type: "fixed" }).catch(() => {});
  }

  // ---------- card ----------
  const ic = (name) => GlIcons.make(name, "gl-i");
  function link(icon, label, onClick, cls = "gl-link") {
    const el = mk("span", cls);
    el.append(ic(icon), mk("span", null, label));
    el.addEventListener("click", onClick);
    return el;
  }

  function openCard(m) {
    hideChip();
    closeCard();
    closePanel();
    cardMatch = m;
    const k = kind(m);
    card = mk("div", "gl-card " + k.cls);
    card.setAttribute("role", "dialog");
    card.addEventListener("mousedown", (e) => e.preventDefault());

    const head = mk("div", "gl-head");
    const tag = mk("span", "gl-tag " + k.cls);
    tag.append(mk("span", "gl-dot " + k.cls), mk("span", null, k.label));
    const close = mk("span", "gl-icon-btn");
    close.title = tr("close");
    close.append(ic("x"));
    close.addEventListener("click", closeCard);
    head.append(tag, mk("span", "gl-spacer"), close);

    const fix = mk("div", "gl-fixline");
    const w = word(m).trim();
    if (w) fix.append(mk("span", "gl-wrong " + k.cls, w));
    if (w && m.replacements.length) fix.append(mk("span", "gl-to", "→"));
    const sugs = mk("div", "gl-sugs");
    m.replacements.forEach((rep, i) => {
      const b = mk("span", "gl-sug" + (i === 0 ? " gl-main" : ""), rep === "" ? tr("remove") : rep);
      b.title = tr("applyFix");
      b.addEventListener("click", () => apply(m, rep));
      (i === 0 ? fix : sugs).append(b);
    });

    const body = mk("div", "gl-body");
    body.append(fix, mk("div", "gl-msg", m.message));
    if (m.replacements.length > 1) {
      body.append(mk("div", "gl-alt", tr("otherOptions")), sugs);
    } else if (!m.replacements.length) {
      body.append(mk("div", "gl-none", tr("noSuggestions")));
    }

    const foot = mk("div", "gl-foot");
    foot.append(link("ban", tr("skip"), () => { ignored.add(ignoreKey(m)); refilter(); }));
    if (m.issueType === "misspelling") {
      foot.append(link("bookplus", tr("addToDictionary"), () => {
        dictionary.add(word(m).toLowerCase());
        browser.storage.local.set({ dictionary: [...dictionary] });
        refilter();
      }));
    }
    card.append(head, body, foot);
    host.append(card);
    draw();
  }
  function placeCard() {
    const rs = cardMatch && cardMatch.rects;
    if (!rs || !rs.length) { closeCard(); return; }
    const w = card.offsetWidth, h = card.offsetHeight, r = rs[rs.length - 1];
    let top = r.bottom + 6;
    if (top + h > innerHeight - 8) top = Math.max(8, rs[0].top - h - 6);
    card.style.left = Math.max(8, Math.min(r.left - 12, innerWidth - w - 8)) + "px";
    card.style.top = top + "px";
  }
  function closeCard() {
    if (!card) return;
    card.remove();
    card = cardMatch = null;
    redraw();
  }

  // ---------- panel (badge click) ----------
  function togglePanel() {
    if (panel) { closePanel(); return; }
    if (lastError) { schedule(0); return; }
    closeCard();
    panel = mk("div", "gl-panel");
    panel.addEventListener("mousedown", (e) => e.preventDefault());
    host.append(panel);
    renderPanel();
    placePanel();
  }
  function renderPanel() {
    panel.replaceChildren();
    const title = mk("div", "gl-ptitle", tr("extShortName"));
    const right = mk("span", "gl-pright", matches.length ? tr("panelCount", matches.length) : "");
    const gear = mk("span", "gl-icon-btn");
    gear.append(ic("settings"));
    gear.title = tr("popSettings");
    gear.addEventListener("click", () => browser.runtime.sendMessage({ type: "openOptions" }).catch(() => {}));
    right.append(gear);
    title.append(right);
    panel.append(title);
    if (!matches.length) { panel.append(mk("div", "gl-empty", tr("panelEmpty"))); }
    for (const m of matches) {
      const k = kind(m), item = mk("div", "gl-item"), head = mk("div", "gl-head");
      head.append(mk("span", "gl-dot " + k.cls), mk("span", "gl-word " + k.cls, word(m) || "·"));
      if (m.replacements.length) head.append(mk("span", "gl-arrow", "→"), mk("span", "gl-fix", m.replacements[0] || tr("removeLower")));
      item.append(head, mk("div", "gl-msg", m.message));
      item.addEventListener("click", () => {
        closePanel();
        if (isField(target)) { target.focus(); target.setSelectionRange(m.offset, m.offset); }
        requestAnimationFrame(() => { draw(); if (matches.includes(m)) openCard(m); });
      });
      panel.append(item);
    }
    const foot = mk("div", "gl-foot");
    if (matches.some((m) => m.replacements.length)) {
      foot.append(link("wand", tr("fixAll"), fixAll, "gl-link gl-strong"));
    }
    const iconBtn = (icon, title, onClick) => {
      const el = mk("span", "gl-icon-btn");
      el.title = title;
      el.append(ic(icon));
      el.addEventListener("click", onClick);
      return el;
    };
    foot.append(
      mk("span", "gl-spacer"),
      iconBtn("pause", tr("pauseHour"), () => browser.storage.local.set({ pausedUntil: Date.now() + 3600 * 1000 })),
      iconBtn("eyeoff", tr("muteSite") + " (" + location.hostname + ")", () => browser.storage.local.set({ mutedSites: [...new Set([...mutedSites, location.hostname])] })),
    );
    panel.append(foot);
  }
  function placePanel() {
    const b = badge.getBoundingClientRect(), w = panel.offsetWidth, h = panel.offsetHeight;
    panel.style.left = Math.max(8, Math.min(b.right - w, innerWidth - w - 8)) + "px";
    panel.style.top = (b.top - h - 8 > 8 ? b.top - h - 8 : Math.min(b.bottom + 8, innerHeight - h - 8)) + "px";
  }
  function closePanel() {
    if (!panel) return;
    panel.remove();
    panel = null;
  }

  // ---------- fix all / next issue (hotkeys) ----------
  function fixAll() {
    if (!target) return;
    readText();
    // from the end of the text to the start, so earlier offsets stay valid
    const list = matches.filter((m) => m.replacements.length).sort((a, b) => b.offset - a.offset);
    for (const m of list) apply(m, m.replacements[0]);
    closePanel();
  }
  function nextIssue() {
    if (!target || !matches.length) return;
    let caret = 0;
    if (isField(target)) caret = target.selectionEnd || 0;
    const sorted = [...matches].sort((a, b) => a.offset - b.offset);
    const next = sorted.find((m) => m.offset >= caret && m !== cardMatch) || sorted[0];
    if (isField(target)) { target.focus(); target.setSelectionRange(next.offset, next.offset); }
    draw();
    openCard(next);
  }

  // ---------- "check selection" report (context menu) ----------
  let report = null;
  function closeReport() {
    if (report) { report.remove(); report = null; }
  }
  function showReport(res) {
    closeReport();
    closeCard();
    closePanel();
    ensureHost();
    const box = mk("div", "gl-panel");
    box.addEventListener("mousedown", (e) => e.preventDefault());
    const title = mk("div", "gl-ptitle", tr("extShortName"));
    const items = res && !res.error ? res.matches : [];
    title.append(mk("span", null, res && res.error ? "" : items.length ? tr("panelCount", items.length) : ""));
    box.append(title);
    if (!res || res.error) box.append(mk("div", "gl-empty", res ? res.error : tr("errNoResponse")));
    else if (!items.length) box.append(mk("div", "gl-empty", tr("panelEmpty")));
    for (const m of items) {
      const k = kind(m), item = mk("div", "gl-item"), head = mk("div", "gl-head");
      head.append(mk("span", "gl-dot " + k.cls));
      if (m.replacements.length) head.append(mk("span", "gl-fix", m.replacements.join(" · ")));
      item.append(head, mk("div", "gl-msg", m.message));
      box.append(item);
    }
    const sel = getSelection();
    let r = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
    if (!r || (!r.width && !r.height)) r = { left: 20, bottom: 20 };
    host.append(box);
    report = box;
    const w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
    box.style.top = Math.max(8, Math.min(r.bottom + 8, innerHeight - h - 8)) + "px";
  }
  document.addEventListener("mousedown", (e) => { if (report && !report.contains(e.target) && !host.contains(e.target)) closeReport(); }, true);

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "hostname") {
      sendResponse({ host: location.protocol.startsWith("http") ? location.hostname : null });
      return;
    }
    if (msg.type === "command") {
      if (msg.name === "fix-all") fixAll();
      else if (msg.name === "fix-layout") fixLayout();
      else if (msg.name === "next-issue") nextIssue();
    } else if (msg.type === "report") {
      showReport(msg.res);
    }
  });

  // ---------- keyboard layout fix (ghbdtn -> привет) ----------
  // Works on the focused field even when spell checking is off; conversion is local, detection is
  // done by the background script with a bundled word list. Nothing leaves the browser.
  const LAYOUT_CHUNK = /^(?:[A-Za-z`~[\]{};:'",.<>!?]+|[А-Яа-яЁё]+[.,!?:;]*)$/;
  const CODE_EDITOR = ".cm-editor, .CodeMirror, .monaco-editor, .ace_editor";
  let lastLayout = null; // { el, node, start, original, replacement, auto }
  let layoutChip = null, chipTimer = 0;

  function editableAt(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el) return null;
    if (isField(el)) return isEditable(el) ? el : null;
    return el.isContentEditable ? editRoot(el) : null;
  }
  // Caret context: for fields offsets are positions in el.value; for contenteditable they are
  // positions inside the text node that holds the caret.
  function caretContext() {
    const a = document.activeElement;
    if (a && isField(a)) {
      if (!isEditable(a) || a.selectionStart == null) return null;
      const s = a.selectionStart, e = a.selectionEnd;
      return { el: a, field: true, before: a.value.slice(0, s), caret: s, selStart: s, selected: a.value.slice(s, e) };
    }
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return null;
    const root = editableAt(sel.focusNode);
    if (!root) return null;
    if (!sel.isCollapsed) return { el: root, field: false, selected: sel.toString() };
    const node = sel.focusNode;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    return { el: root, field: false, node, before: node.data.slice(0, sel.focusOffset), caret: sel.focusOffset, selected: "" };
  }
  // Replace [start, end) before the caret, keeping the caret where it was relative to the text after.
  function replaceAt(c, start, end, rep) {
    if (c.field) {
      const el = c.el, caret = el.selectionStart;
      el.setSelectionRange(start, end);
      if (!document.execCommand("insertText", false, rep)) {
        el.setRangeText(rep, start, end, "end");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const pos = caret + rep.length - (end - start);
      el.setSelectionRange(pos, pos);
    } else {
      const sel = getSelection(), r = document.createRange(), after = c.caret - end;
      r.setStart(c.node, start);
      r.setEnd(c.node, end);
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand("insertText", false, rep);
      for (let i = 0; i < after; i++) sel.modify("move", "forward", "character");
    }
  }
  const textAt = (c, start, len) => (c.field ? c.el.value : c.node.data).substr(start, len);

  function revertLast(c, learn) {
    const L = lastLayout;
    if (!L || L.el !== c.el || (!c.field && L.node !== c.node)) return false;
    if (textAt(c, L.start, L.replacement.length) !== L.replacement) return false;
    replaceAt(c, L.start, L.start + L.replacement.length, L.original);
    if (learn && L.auto) {
      // the user wanted this word as typed: never change it again
      dictionary.add(L.original.toLowerCase());
      browser.storage.local.set({ dictionary: [...dictionary] });
    }
    lastLayout = null;
    hideChip();
    return true;
  }

  // Hotkey: undo the last change if the caret is right after it; else convert the selection or the
  // last word before the caret.
  const convertSmart = (s) =>
    browser.runtime.sendMessage({ type: "layoutConvert", text: s }).then((r) => (typeof r === "string" ? r : GladkoLayout.convert(s)), () => GladkoLayout.convert(s));

  async function fixLayout() {
    if (layoutMode === "off" || !document.hasFocus()) return;
    let c = caretContext();
    if (!c) return;
    if (!c.selected && revertLast(c, true)) return;
    if (c.selected) {
      const rep = await convertSmart(c.selected);
      const now = caretContext();
      if (!now || now.el !== c.el || now.selected !== c.selected) return; // selection changed meanwhile
      if (c.field) {
        const s = c.selStart;
        c.el.setSelectionRange(s, s + c.selected.length);
        if (!document.execCommand("insertText", false, rep)) c.el.setRangeText(rep, s, s + c.selected.length, "end");
        c.el.setSelectionRange(s, s + rep.length);
      } else {
        document.execCommand("insertText", false, rep);
      }
      lastLayout = null;
      return;
    }
    const m = c.before.match(/(\S+)(\s*)$/);
    if (!m) return;
    const start = c.before.length - m[0].length, rep = await convertSmart(m[1]);
    if (rep === m[1]) return;
    c = caretContext();
    if (!c || c.selected || textAt(c, start, m[1].length) !== m[1]) return;
    replaceAt(c, start, start + m[1].length, rep);
    lastLayout = { el: c.el, node: c.node, start, original: m[1], replacement: rep, auto: false };
  }

  // Automatic mode: when a word is finished with a space (or Enter in a textarea), check it.
  document.addEventListener("input", (e) => {
    if (layoutMode !== "auto" || !active()) return;
    const space = e.inputType === "insertText" && /^\s$/.test(e.data || "");
    if (!space && e.inputType !== "insertLineBreak") return;
    const c = caretContext();
    if (!c || c.selected || (!c.field && !space) || c.el.closest(CODE_EDITOR)) return;
    const m = c.before.match(/(\S+)(\s+)$/);
    if (!m || !LAYOUT_CHUNK.test(m[1])) return;
    const chunkStart = c.before.length - m[0].length;
    const slice = c.before.slice(Math.max(0, chunkStart - 400), chunkStart + m[1].length);
    const sliceChunk = slice.length - m[1].length;
    browser.runtime.sendMessage({ type: "layoutAnalyze", text: slice }).then((found) => {
      const hit = (found || []).filter((f) => f.offset >= sliceChunk).pop();
      if (!hit) return;
      const now = caretContext();
      const start = chunkStart + (hit.offset - sliceChunk);
      if (!now || now.el !== c.el || (!c.field && now.node !== c.node) || now.selected) return;
      if (textAt(now, start, hit.length) !== hit.original) return; // text changed meanwhile
      replaceAt(now, start, start + hit.length, hit.replacement);
      lastLayout = { el: now.el, node: now.node, start, original: hit.original, replacement: hit.replacement, auto: true };
      showChip(now.el, hit.original, hit.replacement);
    }).catch(() => {});
  }, true);

  function hideChip() {
    clearTimeout(chipTimer);
    if (layoutChip) { layoutChip.remove(); layoutChip = null; }
  }
  function showChip(el, from, to) {
    hideChip();
    ensureHost();
    const chip = mk("div", "gl-chip");
    chip.addEventListener("mousedown", (e) => e.preventDefault());
    chip.append(ic("swap"), mk("span", "gl-chip-from", from), mk("span", "gl-to", "→"), mk("span", "gl-chip-to", to));
    const undo = mk("span", "gl-chip-undo", tr("layoutUndo"));
    undo.addEventListener("click", () => {
      const c = caretContext();
      if (c) revertLast(c, true);
      hideChip();
    });
    chip.append(undo);
    host.append(chip);
    const r = el.getBoundingClientRect();
    const w = chip.offsetWidth, h = chip.offsetHeight;
    chip.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
    chip.style.top = (r.bottom + 6 + h < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + "px";
    layoutChip = chip;
    chipTimer = setTimeout(hideChip, 5000);
  }

  // ---------- lifecycle ----------
  const resizeObs = new ResizeObserver(redraw);
  const mutationObs = new MutationObserver((list) => {
    if (list.some((r) => !host.contains(r.target))) onEdit();
  });

  function attach(el) {
    detach();
    target = el;
    if (el.getAttribute("spellcheck") !== "false") el.setAttribute("spellcheck", "false"); // avoid double squiggles
    text = readText();
    resizeObs.observe(el);
    if (!isField(el)) mutationObs.observe(el, { childList: true, characterData: true, subtree: true });
    ensureHost();
    schedule(cache.has(text) ? 0 : 400);
  }
  function detach() {
    hideChip();
    clearTimeout(timer);
    seq++;
    resizeObs.disconnect();
    mutationObs.disconnect();
    closeCard();
    closePanel();
    layer.replaceChildren();
    badge.remove();
    target = model = null;
    matches = [];
    text = lastError = "";
    busy = false;
  }

  document.addEventListener("focusin", (e) => {
    if (!active() || !isEditable(e.target)) return;
    const el = isField(e.target) ? e.target : editRoot(e.target);
    if (el !== target) attach(el);
  });
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      if (!target) return;
      const a = document.activeElement;
      if (a !== target && !(a && target.contains(a))) detach();
    }, 150);
  });
  document.addEventListener("input", (e) => {
    if (target && (e.target === target || target.contains(e.target)) && isField(target)) onEdit();
  }, true);
  document.addEventListener("click", (e) => {
    if (!target || !(e.target === target || target.contains(e.target))) return;
    const x = e.clientX, y = e.clientY;
    const hit = matches.find((m) => (m.rects || []).some((r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 2 && y <= r.bottom + 3));
    if (hit && hit !== cardMatch) openCard(hit);
    else if (!hit) { closeCard(); closePanel(); }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (card || panel || report)) { closeCard(); closePanel(); closeReport(); }
  }, true);
  document.addEventListener("scroll", redraw, true);
  addEventListener("resize", redraw);
})();
