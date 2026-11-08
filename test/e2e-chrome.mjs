// End-to-end check of the Chrome MV3 build: loads dist/chrome in real Chromium, talks to a fake
// LanguageTool server on localhost:8081 and verifies underlines, the fix-all hotkey path and caching.
import { createRequire } from "node:module";
import http from "node:http";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ext = join(root, "dist", "chrome");

const requests = [];
const TYPOS = { Превет: "Привет", исправленя: "исправления" };
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url.startsWith("/v2/languages")) { res.end("[]"); return; }
  if (req.url === "/page.html") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(page); return; }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const text = new URLSearchParams(body).get("text") || "";
    requests.push(text);
    const matches = [];
    for (const [bad, good] of Object.entries(TYPOS)) {
      let i = -1;
      while ((i = text.indexOf(bad, i + 1)) >= 0)
        matches.push({ offset: i, length: bad.length, message: "typo", shortMessage: "", replacements: [{ value: good }], rule: { id: "T_" + bad, issueType: "misspelling", category: { name: "Typos" } } });
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ matches }));
  });
});
await new Promise((r) => server.listen(8081, "127.0.0.1", r));

var page = `<!doctype html><meta charset=utf-8><body style="padding:40px"><textarea id=t style="width:600px;height:200px;font:20px sans-serif"></textarea>`;
const dir = mkdtempSync(join(tmpdir(), "gl-e2e-"));
const ctx = await chromium.launchPersistentContext(dir, {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let failed = false;
try {
  let sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker", { timeout: 15000 }));
  sw.on("console", (m) => console.log("SW:", m.text()));
  const name = await sw.evaluate(() => chrome.i18n.getMessage("extName"));
  assert.ok(name.includes("Гладко") || name.includes("Gladko"), "i18n works in the service worker: " + name);

  const p = await ctx.newPage();
  p.on("console", (m) => console.log("PAGE:", m.text()));
  p.on("pageerror", (e) => console.log("PAGEERR:", e.message));
  await p.goto("http://127.0.0.1:8081/page.html");
  await p.click("#t");
  await p.keyboard.type("Привет! Превет всем.\nВторой абзац без ошибок.\nНужны исправленя тут.", { delay: 5 });
  await p.waitForFunction(() => document.querySelectorAll(".gl-mark").length >= 2, null, { timeout: 15000 }).catch(async (e) => {
    console.error("debug: requests", JSON.stringify(requests), "badge", await p.evaluate(() => document.querySelector(".gl-badge")?.className + "|" + document.querySelector(".gl-badge")?.title));
    throw e;
  });
  const marks = await p.evaluate(() => document.querySelectorAll(".gl-mark").length);
  assert.equal(marks, 2, "two underlines drawn");
  console.log("ok: underlines drawn through the MV3 service worker, requests:", requests.length);

  // paragraph cache: edit only the last paragraph, the first two must not be re-sent
  requests.length = 0;
  await p.keyboard.type(" Ещё.", { delay: 5 });
  await p.waitForTimeout(2500);
  assert.ok(requests.length >= 1 && requests.every((t) => !t.includes("Второй абзац")), "unchanged paragraphs are served from cache: " + JSON.stringify(requests));
  console.log("ok: paragraph cache — re-sent only", JSON.stringify(requests));

  // fix all through the panel
  await p.click(".gl-badge");
  await p.click("text=/Исправить всё|Fix all/");
  const fixed = await p.inputValue("#t");
  assert.ok(fixed.includes("Привет всем") && !fixed.includes("Превет"), "typos fixed: " + fixed);
  assert.ok(fixed.includes("исправления") && !fixed.includes("исправленя"), "fixed text: " + fixed);
  console.log("ok: fix all →", JSON.stringify(fixed));

  // next-issue hotkey path + context-menu report path (messages the background sends to the tab)
  await p.fill("#t", "Ещё Превет и исправленя.");
  await p.waitForFunction(() => document.querySelectorAll(".gl-mark").length >= 2, null, { timeout: 15000 });
  await p.evaluate(() => document.getElementById("t").setSelectionRange(0, 0));
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1:8081/*" });
    await chrome.tabs.sendMessage(tab.id, { type: "command", name: "next-issue" });
  });
  await p.waitForSelector(".gl-card", { timeout: 5000 });
  console.log("ok: next-issue opens the card");
  await p.keyboard.press("Escape");
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1:8081/*" });
    await chrome.tabs.sendMessage(tab.id, { type: "report", text: "x", res: { matches: [{ offset: 0, length: 1, message: "typo", replacements: ["y"], issueType: "misspelling" }] } });
  });
  await p.waitForSelector(".gl-panel .gl-item", { timeout: 5000 });
  console.log("ok: selection report is shown");

  // options page loads with localized strings
  const o = await ctx.newPage();
  await o.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
  const title = await o.textContent("h2");
  assert.ok(/Гладко|Gladko/.test(title), "options title: " + title);
  console.log("ok: options page renders:", title.trim());
} catch (e) {
  failed = true;
  console.error("FAILED:", e.message);
} finally {
  await ctx.close();
  server.close();
}
process.exit(failed ? 1 : 0);
