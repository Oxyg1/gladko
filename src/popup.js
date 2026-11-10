const { t, $, $$, get, set } = Gl;
GlIcons.render();
Gl.applyI18n();
Gl.fillLanguages($("#language"), true);
$("#version").textContent = "v" + browser.runtime.getManifest().version;

let host = null; // hostname of the active tab, if the content script answers there
let localUp = null;

async function detectHost() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const r = await browser.tabs.sendMessage(tab.id, { type: "hostname" }, { frameId: 0 });
    host = r && r.host ? r.host : null;
  } catch (e) {
    host = null; // browser pages, the web store, or a tab opened before the extension was installed
  }
}

function serverInfo(s) {
  if (s.server === "local") return { name: t("srvLocal"), state: localUp ? t("stateOnline") : t("stateOffline"), cls: localUp ? "ok" : "bad" };
  if (s.server === "public") return { name: t("srvPublic"), state: t("stateCloud"), cls: "brand" };
  if (s.server === "premium") return { name: t("srvPremium"), state: s.apiKey ? t("stateCloud") : t("stateNoKey"), cls: s.apiKey ? "brand" : "warn" };
  if (s.server === "custom") {
    let h = s.endpoint;
    try { h = new URL(s.endpoint).host; } catch (e) { /* keep raw */ }
    return { name: h || t("srvCustom"), state: t("srvCustom"), cls: "brand" };
  }
  return localUp
    ? { name: t("srvAutoLocal"), state: t("statePrivate"), cls: "ok" }
    : { name: t("srvAutoPublic"), state: t("stateCloud"), cls: "brand" };
}

async function render() {
  const s = await get();
  const paused = s.pausedUntil > Date.now();
  const muted = host && s.mutedSites.includes(host);

  const hero = $("#hero");
  hero.classList.toggle("off", !s.enabled);
  hero.classList.toggle("paused", s.enabled && paused);
  $("#enabled").checked = s.enabled;
  $("#hero-title").textContent = !s.enabled ? t("popOff") : paused ? t("popPausedTitle") : muted ? t("popOnElsewhere") : t("popOn");
  $("#hero-sub").textContent = !s.enabled ? t("popOffSub") : paused ? t("popPausedSub", Gl.fmtTime(s.pausedUntil)) : muted ? t("popMutedSub") : t("popOnSub");
  const icon = $(".hero-icon");
  icon.replaceChildren(GlIcons.make(!s.enabled ? "power" : paused ? "pause" : "check"));

  // site
  const siteRow = $("#site-row");
  if (host) {
    $("#site-name").textContent = host;
    $("#site-sub").textContent = muted ? t("popSiteOff") : t("popSiteOn");
    $("#site").checked = !muted;
    $("#site").disabled = false;
    siteRow.classList.remove("disabled");
  } else {
    $("#site-name").textContent = t("popSiteNA");
    $("#site-sub").textContent = t("popSiteNASub");
    $("#site").checked = false;
    $("#site").disabled = true;
    siteRow.classList.add("disabled");
  }

  // pause
  $("#pause-seg").hidden = paused;
  $("#resume").hidden = !paused;
  $("#pause-sub").textContent = paused ? t("pausedShort", Gl.fmtTime(s.pausedUntil)) : t("popPauseSub");

  // server
  const info = serverInfo(s);
  $("#server-name").textContent = info.name;
  $("#server-state").textContent = info.state;
  $("#server-pill").className = "pill " + info.cls;

  $("#language").value = s.language;

  const st = Gl.todayStats(s);
  $("#st-fixes").textContent = Gl.num(st.fixes);
  $("#st-checks").textContent = Gl.num(st.checks);
  $("#st-total").textContent = Gl.num(st.totalFixes);
}

$("#enabled").addEventListener("change", (e) => set({ enabled: e.target.checked }));
$("#site").addEventListener("change", async (e) => {
  if (!host) return;
  const s = await get();
  const list = new Set(s.mutedSites);
  if (e.target.checked) list.delete(host); else list.add(host);
  set({ mutedSites: [...list] });
});
for (const b of $$("[data-pause]")) b.addEventListener("click", () => set({ pausedUntil: Gl.pauseUntil(b.dataset.pause) }));
$("#resume").addEventListener("click", () => set({ pausedUntil: 0 }));
$("#language").addEventListener("change", (e) => set({ language: e.target.value }));

function openOptions(hash) {
  if (hash) browser.tabs.create({ url: browser.runtime.getURL("options.html#" + hash) });
  else browser.runtime.openOptionsPage();
  window.close();
}
$("#open-settings").addEventListener("click", () => openOptions());
$("#all-settings").addEventListener("click", (e) => { e.preventDefault(); openOptions(); });
$("#server-row").addEventListener("click", () => openOptions("server"));

browser.storage.onChanged.addListener(render);
(async () => {
  await detectHost();
  await render();
  localUp = await browser.runtime.sendMessage({ type: "probeLocal" }).catch(() => false);
  render();
})();
