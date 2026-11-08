const D = {
  server: "auto", endpoint: "", language: "auto", enabled: true, picky: false,
  username: "", apiKey: "", pausedUntil: 0, mutedSites: [], dictionary: [],
};
const $ = (id) => document.getElementById(id);
const t = (k, ...a) => browser.i18n.getMessage(k, a.map(String)) || k;
const say = (msg) => { $("st").textContent = msg; };

for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
document.title = t("optTitle");

function showRows() {
  $("custom-row").hidden = $("server").value !== "custom";
  $("premium-row").hidden = $("server").value !== "premium";
}

async function probe() {
  const ok = await browser.runtime.sendMessage({ type: "probeLocal" }).catch(() => false);
  $("probe").className = ok ? "on" : "off";
  $("probe").textContent = t(ok ? "optLocalOn" : "optLocalOff");
}

function renderList(ul, items, emptyKey, onRemove) {
  ul.replaceChildren();
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = t(emptyKey);
    ul.append(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = item;
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "✕";
    b.addEventListener("click", () => onRemove(item));
    li.append(name, b);
    ul.append(li);
  }
}

async function render() {
  const s = await browser.storage.local.get(D);
  $("enabled").checked = s.enabled;
  $("server").value = s.server;
  $("endpoint").value = s.endpoint;
  $("language").value = s.language;
  $("picky").checked = s.picky;
  $("username").value = s.username;
  $("apiKey").value = s.apiKey;
  showRows();
  const paused = s.pausedUntil > Date.now();
  $("pause-state").textContent = paused ? t("optPausedUntil", new Date(s.pausedUntil).toLocaleTimeString()) : "";
  $("pause").textContent = t(paused ? "optResume" : "optPauseHour");
  renderList($("muted"), s.mutedSites, "optMutedNone", async (h) => {
    await browser.storage.local.set({ mutedSites: s.mutedSites.filter((x) => x !== h) });
    render();
  });
  renderList($("dict"), [...s.dictionary].sort(), "optDictNone", async (w) => {
    await browser.storage.local.set({ dictionary: s.dictionary.filter((x) => x !== w) });
    render();
  });
}

async function save() {
  showRows();
  await browser.storage.local.set({
    enabled: $("enabled").checked,
    server: $("server").value,
    endpoint: $("endpoint").value.trim(),
    language: $("language").value,
    picky: $("picky").checked,
    username: $("username").value.trim(),
    apiKey: $("apiKey").value.trim(),
  });
  say(t("optSaved"));
}
for (const id of ["enabled", "server", "endpoint", "language", "picky", "username", "apiKey"]) $(id).addEventListener("change", save);

// Access to a user-chosen server needs an explicit permission, requested from a click.
$("allow").addEventListener("click", async () => {
  let origin;
  try { origin = new URL($("endpoint").value.trim()).origin + "/*"; } catch (e) { say(t("optBadUrl")); return; }
  await save();
  const ok = await browser.permissions.request({ origins: [origin] });
  say(t(ok ? "optAllowed" : "optDenied"));
});

$("pause").addEventListener("click", async () => {
  const s = await browser.storage.local.get({ pausedUntil: 0 });
  await browser.storage.local.set({ pausedUntil: s.pausedUntil > Date.now() ? 0 : Date.now() + 3600 * 1000 });
  render();
});

$("export").addEventListener("click", async () => {
  const s = await browser.storage.local.get({ dictionary: [] });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([[...s.dictionary].sort().join("\n") + "\n"], { type: "text/plain" }));
  a.download = "gladko-dictionary.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("import").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async () => {
  const f = $("file").files[0];
  if (!f) return;
  const raw = await f.text();
  let words;
  try { const j = JSON.parse(raw); words = Array.isArray(j) ? j : []; } catch (e) { words = raw.split(/\r?\n/); }
  words = words.map((w) => String(w).trim().toLowerCase()).filter(Boolean);
  const s = await browser.storage.local.get({ dictionary: [] });
  const set = new Set(s.dictionary);
  const before = set.size;
  for (const w of words) set.add(w);
  await browser.storage.local.set({ dictionary: [...set] });
  say(t("optImported", set.size - before));
  $("file").value = "";
  render();
});

browser.storage.onChanged.addListener(render);
render();
probe();
