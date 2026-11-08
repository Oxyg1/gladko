if (typeof importScripts === "function") importScripts("polyfill.js", "lib.js"); // Chrome MV3 service worker

const { splitUnits, pack, distribute, RateLimiter, LRU } = GladkoLib;

const PUBLIC = "https://api.languagetool.org/v2/check";
const PREMIUM = "https://api.languagetoolplus.com/v2/check";
const LOCAL = "http://localhost:8081/v2/check";
const DEFAULTS = {
  server: "auto", endpoint: "", language: "auto", enabled: true,
  picky: false, username: "", apiKey: "", pausedUntil: 0, mutedSites: [],
};
const LOCAL_RETRY_MS = 30000;
const MAX_REQUEST_CHARS = 15000; // public API accepts 20000 per request
const MAX_WAIT_MS = 25000;       // longest we are willing to queue behind the rate limit

const t = (k, ...a) => browser.i18n.getMessage(k, a.map(String)) || k;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const limiter = new RateLimiter(18, 70000, 60000); // stay under 20 req/min and 75k chars/min
const cache = new LRU(600); // per paragraph: config + text -> matches relative to the paragraph
let localDownUntil = 0;     // in auto mode, skip the local server for a while after it fails
let publicBlockedUntil = 0; // after HTTP 429 from the public server

async function getSettings() {
  return Object.assign({}, DEFAULTS, await browser.storage.local.get(DEFAULTS));
}

function endpoints(s) {
  if (s.server === "local") return [LOCAL];
  if (s.server === "public") return [PUBLIC];
  if (s.server === "premium") return [PREMIUM];
  if (s.server === "custom") return [s.endpoint || LOCAL];
  return Date.now() < localDownUntil ? [PUBLIC] : [LOCAL, PUBLIC];
}

async function probeLocal() {
  try {
    const r = await fetch(LOCAL.replace("/check", "/languages"), { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch (e) {
    return false;
  }
}

async function waitSlot(chars) {
  const deadline = Date.now() + MAX_WAIT_MS;
  for (;;) {
    const w = limiter.take(chars);
    if (w === 0) return 0;
    if (Date.now() + w > deadline) return w;
    await sleep(w);
  }
}

// One request to the first reachable server. Returns {server, matches} or {error}.
async function request(s, text) {
  const body = new URLSearchParams({ text, language: s.language });
  if (s.language === "auto") body.set("preferredVariants", "ru-RU,en-US,de-DE,pt-PT");
  if (s.picky) body.set("level", "picky");
  if (s.server === "premium" && s.username && s.apiKey) {
    body.set("username", s.username);
    body.set("apiKey", s.apiKey);
  }
  const list = endpoints(s);
  let error = "";
  for (const url of list) {
    const isPublic = url === PUBLIC;
    if (isPublic) {
      if (Date.now() < publicBlockedUntil) {
        error = t("errRate", Math.ceil((publicBlockedUntil - Date.now()) / 1000));
        continue;
      }
      const wait = await waitSlot(text.length);
      if (wait) { error = t("errRate", Math.ceil(wait / 1000)); continue; }
    }
    try {
      const r = await fetch(url, { method: "POST", body, signal: AbortSignal.timeout(url === LOCAL && list.length > 1 ? 8000 : 20000) });
      if (r.status === 429) {
        if (isPublic) publicBlockedUntil = Date.now() + 60000;
        error = t("errRate", 60);
        continue;
      }
      if (r.status === 413) return { error: t("errTooLong") };
      if (!r.ok) return { error: t("errHttp", r.status) };
      const j = await r.json();
      return {
        server: isPublic ? "public" : url === LOCAL ? "local" : "custom",
        matches: j.matches.map((m) => ({
          offset: m.offset,
          length: m.length,
          message: m.message,
          shortMessage: m.shortMessage || "",
          replacements: m.replacements.slice(0, 5).map((x) => x.value),
          issueType: m.rule.issueType,
          category: m.rule.category ? m.rule.category.name : "",
          ruleId: m.rule.id,
        })),
      };
    } catch (e) {
      if (url === LOCAL && s.server === "auto") localDownUntil = Date.now() + LOCAL_RETRY_MS;
      error = t("errOffline", url);
      if (s.server === "custom") {
        try {
          const origin = new URL(url).origin + "/*";
          if (!(await browser.permissions.contains({ origins: [origin] }))) error = t("errNoPerm", origin);
        } catch (_) { /* ignore */ }
      }
    }
  }
  return { error };
}

async function check(text) {
  const s = await getSettings();
  if (!s.enabled) return { matches: [] };
  const cfg = [s.server, s.endpoint, s.language, s.picky ? "p" : "n"].join("|");
  const units = splitUnits(text, MAX_REQUEST_CHARS);
  const rel = new Map(); // unit -> matches relative to the unit
  const pending = [];
  for (const u of units) {
    if (u.text.trim().length < 3) { rel.set(u, []); continue; }
    const hit = cache.get(cfg + "\u0000" + u.text);
    if (hit) rel.set(u, hit); else pending.push(u);
  }
  let server = "cache";
  for (const group of pack(pending, MAX_REQUEST_CHARS)) {
    const res = await request(s, group.text);
    if (res.error) return { error: res.error };
    server = res.server;
    const parts = distribute(group, res.matches);
    group.units.forEach(({ unit }, i) => {
      rel.set(unit, parts[i]);
      cache.set(cfg + "\u0000" + unit.text, parts[i]);
    });
  }
  const matches = [];
  for (const u of units) for (const m of rel.get(u)) matches.push(Object.assign({}, m, { offset: m.offset + u.start }));
  return { server, matches };
}

async function handle(msg) {
  if (msg.type === "settings") return getSettings();
  if (msg.type === "probeLocal") return probeLocal();
  if (msg.type === "check") return check(msg.text);
}

// sendResponse + `return true` works in Chrome (promise-returning listeners do not) and in Firefox.
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg).then(sendResponse, (e) => sendResponse({ error: String(e && e.message || e) }));
  return true;
});

// ---------- toolbar button, hotkeys, context menu ----------
const action = browser.action || browser.browserAction;
if (action && action.onClicked) action.onClicked.addListener(() => browser.runtime.openOptionsPage());

browser.commands.onCommand.addListener(async (name) => {
  if (name === "toggle-pause") {
    const s = await getSettings();
    await browser.storage.local.set({ pausedUntil: s.pausedUntil > Date.now() ? 0 : Date.now() + 3600 * 1000 });
    return;
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) browser.tabs.sendMessage(tab.id, { type: "command", name }).catch(() => {});
});

const menus = browser.contextMenus || browser.menus;
if (menus) {
  Promise.resolve(menus.removeAll()).then(() => {
    menus.create({ id: "check-selection", title: t("menuCheckSelection"), contexts: ["selection"] });
  });
  menus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "check-selection" || !tab || !info.selectionText) return;
    const res = await check(info.selectionText.slice(0, 20000));
    browser.tabs.sendMessage(tab.id, { type: "report", text: info.selectionText.slice(0, 20000), res }, { frameId: info.frameId || 0 }).catch(() => {});
  });
}
