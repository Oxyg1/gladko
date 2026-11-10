// Shared helpers for the popup, options and welcome pages.
const Gl = (() => {
  const DEFAULTS = {
    server: "auto", endpoint: "", language: "auto", enabled: true, picky: false,
    username: "", apiKey: "", pausedUntil: 0, mutedSites: [], dictionary: [],
    stats: { day: "", checks: 0, fixes: 0, totalFixes: 0 },
  };
  const LANGUAGES = [
    ["auto", null], ["ru-RU", "Русский"], ["en-US", "English (US)"], ["en-GB", "English (UK)"],
    ["uk-UA", "Українська"], ["de-DE", "Deutsch"], ["fr", "Français"], ["es", "Español"],
    ["pt-PT", "Português"], ["it", "Italiano"], ["pl-PL", "Polski"],
  ];
  const t = (k, ...a) => browser.i18n.getMessage(k, a.map(String)) || k;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function applyI18n(root = document) {
    for (const el of $$("[data-i18n]", root)) el.textContent = t(el.dataset.i18n);
    for (const el of $$("[data-i18n-title]", root)) { el.title = t(el.dataset.i18nTitle); el.setAttribute("aria-label", el.title); }
    for (const el of $$("[data-i18n-placeholder]", root)) el.placeholder = t(el.dataset.i18nPlaceholder);
    const lang = browser.i18n.getUILanguage ? browser.i18n.getUILanguage() : "ru";
    document.documentElement.lang = lang.slice(0, 2);
  }

  function fillLanguages(select, short = false) {
    const auto = short ? t("langAutoShort") : t("optLangAuto");
    select.replaceChildren(...LANGUAGES.map(([v, name]) => new Option(name || auto, v)));
  }

  const get = () => browser.storage.local.get(DEFAULTS);
  const set = (obj) => browser.storage.local.set(obj);

  const today = () => new Date().toLocaleDateString("sv"); // YYYY-MM-DD in local time
  function todayStats(s) {
    const st = s.stats || DEFAULTS.stats;
    return st.day === today() ? st : { day: today(), checks: 0, fixes: 0, totalFixes: st.totalFixes || 0 };
  }

  const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  function pauseUntil(kind) {
    if (kind === "15m") return Date.now() + 15 * 60e3;
    if (kind === "1h") return Date.now() + 60 * 60e3;
    const d = new Date(); // tomorrow morning
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d.getTime();
  }

  let toastTimer = 0;
  function toast(msg) {
    let el = $(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.append(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  const num = (n) => new Intl.NumberFormat().format(n || 0);

  return { DEFAULTS, LANGUAGES, t, $, $$, applyI18n, fillLanguages, get, set, todayStats, fmtTime, pauseUntil, toast, num };
})();
