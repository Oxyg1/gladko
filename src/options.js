const { t, $, $$, get, set, toast } = Gl;
GlIcons.render();
Gl.applyI18n();
Gl.fillLanguages($("#language"));
document.title = t("optTitle");
$("#version").textContent = "v" + browser.runtime.getManifest().version;

const saved = () => toast(t("optSaved"));

function empty(icon, key) {
  const d = document.createElement("div");
  d.className = "empty";
  const s = document.createElement("span");
  s.textContent = t(key);
  d.append(GlIcons.make(icon), s);
  return d;
}

// ---------- render ----------
async function render() {
  const s = await get();
  $("#enabled").checked = s.enabled;

  const paused = s.pausedUntil > Date.now();
  $("#pause-seg").hidden = paused;
  $("#resume").hidden = !paused;
  $("#pause-sub").textContent = paused ? t("optPausedUntil", Gl.fmtTime(s.pausedUntil)) : t("popPauseSub");

  const st = Gl.todayStats(s);
  $("#st-fixes").textContent = Gl.num(st.fixes);
  $("#st-checks").textContent = Gl.num(st.checks);
  $("#st-total").textContent = Gl.num(st.totalFixes);

  for (const r of $$('input[name="server"]')) r.checked = r.value === s.server;
  $("#premium-box").hidden = s.server !== "premium";
  $("#custom-box").hidden = s.server !== "custom";
  if (document.activeElement !== $("#endpoint")) $("#endpoint").value = s.endpoint;
  if (document.activeElement !== $("#username")) $("#username").value = s.username;
  if (document.activeElement !== $("#apiKey")) $("#apiKey").value = s.apiKey;

  $("#language").value = s.language;
  $("#picky").checked = s.picky;

  renderSites(s.mutedSites);
  renderDict(s.dictionary);
}

function renderSites(sites) {
  const ul = $("#muted");
  ul.replaceChildren();
  if (!sites.length) { ul.append(empty("globe", "optMutedNone")); return; }
  for (const h of [...sites].sort()) {
    const li = document.createElement("li");
    const av = document.createElement("span");
    av.className = "avatar";
    av.textContent = h.replace(/^www\./, "")[0] || "?";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = h;
    const b = document.createElement("button");
    b.className = "btn btn-sm btn-ghost";
    b.append(GlIcons.make("x"), document.createTextNode(t("enableHere")));
    b.addEventListener("click", async () => {
      const cur = await get();
      await set({ mutedSites: cur.mutedSites.filter((x) => x !== h) });
      saved();
    });
    li.append(av, name, b);
    ul.append(li);
  }
}

function renderDict(words) {
  const box = $("#dict");
  const q = $("#dict-search").value.trim().toLowerCase();
  const list = [...words].sort((a, b) => a.localeCompare(b)).filter((w) => !q || w.includes(q));
  box.replaceChildren();
  $("#dict-count").textContent = words.length ? t("dictCount", words.length) : "";
  if (!words.length) { box.append(empty("book", "optDictNone")); return; }
  if (!list.length) { box.append(empty("search", "nothingFound")); return; }
  for (const w of list) {
    const chip = document.createElement("span");
    chip.className = "chip";
    const b = document.createElement("button");
    b.type = "button";
    b.title = t("remove");
    b.append(GlIcons.make("x"));
    b.addEventListener("click", async () => {
      const cur = await get();
      await set({ dictionary: cur.dictionary.filter((x) => x !== w) });
    });
    chip.append(document.createTextNode(w), b);
    box.append(chip);
  }
}

// ---------- general ----------
$("#enabled").addEventListener("change", async (e) => { await set({ enabled: e.target.checked }); saved(); });
for (const b of $$("[data-pause]")) b.addEventListener("click", () => set({ pausedUntil: Gl.pauseUntil(b.dataset.pause) }));
$("#resume").addEventListener("click", () => set({ pausedUntil: 0 }));

// ---------- server ----------
for (const r of $$('input[name="server"]')) {
  r.addEventListener("change", async () => {
    await set({ server: r.value });
    saved();
    probe();
  });
}
for (const id of ["username", "apiKey", "endpoint"]) {
  $("#" + id).addEventListener("change", async (e) => { await set({ [id]: e.target.value.trim() }); saved(); });
}
$("#show-key").addEventListener("click", () => {
  const k = $("#apiKey");
  k.type = k.type === "password" ? "text" : "password";
});
// Access to a user-chosen server needs an explicit permission, requested from a click.
$("#allow").addEventListener("click", async () => {
  let origin;
  try { origin = new URL($("#endpoint").value.trim()).origin + "/*"; } catch (e) { toast(t("optBadUrl")); return; }
  await set({ endpoint: $("#endpoint").value.trim() });
  const ok = await browser.permissions.request({ origins: [origin] });
  toast(t(ok ? "optAllowed" : "optDenied"));
});

async function probe() {
  const pill = $("#local-pill");
  pill.className = "pill";
  $("#local-state").textContent = t("stateChecking");
  const ok = await browser.runtime.sendMessage({ type: "probeLocal" }).catch(() => false);
  pill.className = "pill " + (ok ? "ok" : "");
  $("#local-state").textContent = t(ok ? "stateOnline" : "stateOffline");
}
$("#probe").addEventListener("click", probe);
$("#copy-docker").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#docker-cmd").textContent); toast(t("copied")); } catch (e) { /* clipboard blocked */ }
});

// ---------- checking ----------
$("#language").addEventListener("change", async (e) => { await set({ language: e.target.value }); saved(); });
$("#picky").addEventListener("change", async (e) => { await set({ picky: e.target.checked }); saved(); });

// ---------- sites ----------
$("#site-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  let v = $("#site-input").value.trim().toLowerCase();
  if (!v) return;
  try { v = new URL(v.includes("://") ? v : "https://" + v).hostname; } catch (err) { toast(t("optBadUrl")); return; }
  const s = await get();
  await set({ mutedSites: [...new Set([...s.mutedSites, v])] });
  $("#site-input").value = "";
  saved();
});

// ---------- dictionary ----------
$("#word-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const w = $("#word-input").value.trim().toLowerCase();
  if (!w) return;
  const s = await get();
  await set({ dictionary: [...new Set([...s.dictionary, w])] });
  $("#word-input").value = "";
  toast(t("wordAdded"));
});
$("#dict-search").addEventListener("input", async () => renderDict((await get()).dictionary));
$("#export").addEventListener("click", async () => {
  const s = await get();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([[...s.dictionary].sort().join("\n") + "\n"], { type: "text/plain" }));
  a.download = "gladko-dictionary.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("#import").addEventListener("click", () => $("#file").click());
$("#file").addEventListener("change", async () => {
  const f = $("#file").files[0];
  if (!f) return;
  const raw = await f.text();
  let words;
  try { const j = JSON.parse(raw); words = Array.isArray(j) ? j : []; } catch (e) { words = raw.split(/\r?\n/); }
  words = words.map((w) => String(w).trim().toLowerCase()).filter(Boolean);
  const s = await get();
  const all = new Set(s.dictionary);
  const before = all.size;
  for (const w of words) all.add(w);
  await set({ dictionary: [...all] });
  toast(t("optImported", all.size - before));
  $("#file").value = "";
});

// ---------- shortcuts ----------
async function renderCommands() {
  const ul = $("#commands");
  ul.replaceChildren();
  const cmds = browser.commands && browser.commands.getAll ? await browser.commands.getAll() : [];
  for (const c of cmds) {
    if (!c.description) continue;
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = c.description;
    const keys = document.createElement("span");
    keys.className = "keys";
    if (c.shortcut) {
      for (const k of c.shortcut.split("+")) {
        const kbd = document.createElement("kbd");
        kbd.textContent = k;
        keys.append(kbd);
      }
    } else {
      keys.className = "muted small";
      keys.textContent = t("notSet");
    }
    li.append(name, keys);
    ul.append(li);
  }
  // Chrome lets an extension open its shortcuts page; Firefox has commands.openShortcutSettings (recent versions).
  const isChrome = typeof browser.runtime.getURL === "function" && browser.runtime.getURL("").startsWith("chrome-extension:");
  const canFirefox = browser.commands && typeof browser.commands.openShortcutSettings === "function";
  if (isChrome || canFirefox) {
    $("#edit-shortcuts").hidden = false;
    $("#shortcuts-hint").textContent = t("shortcutsCanEdit");
    $("#edit-shortcuts").onclick = () => (canFirefox ? browser.commands.openShortcutSettings() : browser.tabs.create({ url: "chrome://extensions/shortcuts" }));
  }
}

// ---------- about ----------
$("#show-welcome").addEventListener("click", () => browser.tabs.create({ url: browser.runtime.getURL("welcome.html") }));

// ---------- nav highlight ----------
const links = $$(".nav a");
const sections = links.map((a) => $(a.getAttribute("href")));
function highlight() {
  let cur = sections[0];
  for (const s of sections) if (s.getBoundingClientRect().top < 140) cur = s;
  if (innerHeight + scrollY >= document.body.scrollHeight - 4) cur = sections[sections.length - 1];
  for (const a of links) a.classList.toggle("active", a.getAttribute("href") === "#" + cur.id);
}
addEventListener("scroll", highlight, { passive: true });
for (const a of links) a.addEventListener("click", (e) => {
  e.preventDefault();
  const target = $(a.getAttribute("href"));
  target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  history.replaceState(null, "", a.getAttribute("href"));
});

browser.storage.onChanged.addListener(render);
render().then(() => {
  highlight();
  if (location.hash && $(location.hash)) $(location.hash).scrollIntoView();
});
renderCommands();
probe();
