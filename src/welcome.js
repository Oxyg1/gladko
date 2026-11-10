const { t, $, $$, get, set } = Gl;
GlIcons.render();
Gl.applyI18n();
document.title = t("welTitle");

const demo = $("#demo");
demo.value = t("welDemoText");

async function renderPick() {
  const s = await get();
  const current = s.server === "local" ? "local" : s.server === "auto" ? "auto" : null;
  for (const b of $$(".pick-card")) b.classList.toggle("selected", b.dataset.server === current);
}
for (const b of $$(".pick-card")) {
  b.addEventListener("click", async () => {
    await set({ server: b.dataset.server });
    Gl.toast(t("optSaved"));
    renderPick();
  });
}
renderPick();

$("#settings").addEventListener("click", () => browser.runtime.openOptionsPage());
$("#done").addEventListener("click", async () => {
  const tab = await browser.tabs.getCurrent();
  if (tab) browser.tabs.remove(tab.id);
  else window.close();
});

// content.js is loaded after this script; focusing the demo makes it check the sample text right away.
addEventListener("load", () => {
  demo.focus();
  demo.setSelectionRange(demo.value.length, demo.value.length);
});
