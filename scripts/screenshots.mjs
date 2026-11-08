// Takes 1280x800 store screenshots from the real Chrome build, using a fake LanguageTool on :8081.
import { createRequire } from "node:module";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ext = join(root, "dist", "chrome");
const lang = process.argv[2] || "ru";

const TEXTS = {
  ru: { text: "Привет, команда! Я отправил превет всем, но ихний менеджер просил исправленя в отчёте.", title: "Новое сообщение", send: "Отправить",
    typos: { превет: ["привет", "misspelling", "Возможна орфографическая ошибка"], ихний: ["их", "grammar", "Разговорная форма: правильно «их»"], исправленя: ["исправления", "misspelling", "Возможна орфографическая ошибка"] } },
  en: { text: "Hi team! I sent the reprot to everyone, but there manager asked for chnages in the summary.", title: "New message", send: "Send",
    typos: { reprot: ["report", "misspelling", "Possible spelling mistake"], there: ["their", "grammar", "Did you mean “their”?"], chnages: ["changes", "misspelling", "Possible spelling mistake"] } },
}[lang];

const page = `<!doctype html><meta charset=utf-8><title>Mail</title><style>
body{margin:0;background:linear-gradient(135deg,#e8f1f2,#f7f4ee);font-family:system-ui,sans-serif}
.card{width:760px;margin:90px auto 0;background:#fff;border-radius:16px;padding:32px;box-shadow:0 10px 40px #0002}
h2{margin:0 0 18px;font-weight:600;color:#1c2a2d}
textarea{width:100%;box-sizing:border-box;height:230px;font:22px/1.5 system-ui;padding:16px;border:1px solid #c9dcdd;border-radius:10px;color:#1c2a2d}
button{margin-top:16px;padding:12px 26px;border:0;border-radius:10px;background:#126067;color:#fff;font-size:17px}</style>
<div class=card><h2>${TEXTS.title}</h2><textarea id=t></textarea><br><button>${TEXTS.send}</button></div>`;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/page.html") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(page); return; }
  if (req.url.startsWith("/v2/languages")) { res.end("[]"); return; }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const text = new URLSearchParams(body).get("text") || "";
    const matches = [];
    for (const [bad, [good, type, msg]] of Object.entries(TEXTS.typos)) {
      const i = text.indexOf(bad);
      if (i >= 0) matches.push({ offset: i, length: bad.length, message: msg, shortMessage: "", replacements: [{ value: good }], rule: { id: "T_" + bad, issueType: type, category: { name: "" } } });
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ matches }));
  });
});
await new Promise((r) => server.listen(8081, "127.0.0.1", r));
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "gl-shot-")), {
  channel: "chromium", headless: true, locale: lang === "ru" ? "ru-RU" : "en-US",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--lang=${lang === "ru" ? "ru" : "en-US"}`],
  viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
  env: { ...process.env, LANGUAGE: lang === "ru" ? "ru" : "en-US", LC_ALL: lang === "ru" ? "ru_RU.UTF-8" : "en_US.UTF-8" },
});
const out = join(root, "store", "screenshots");
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:8081/page.html");
await p.click("#t");
await p.keyboard.type(TEXTS.text, { delay: 3 });
await p.waitForFunction(() => document.querySelectorAll(".gl-mark").length >= 3, null, { timeout: 15000 });
await p.waitForTimeout(300);
await p.screenshot({ path: join(out, `${lang}-1-underlines.png`) });
const first = await p.evaluate(() => { const r = document.querySelector(".gl-mark").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await p.mouse.click(first[0], first[1]);
await p.waitForSelector(".gl-card");
await p.waitForTimeout(300);
await p.screenshot({ path: join(out, `${lang}-2-suggestion.png`) });
await p.keyboard.press("Escape");
await p.click(".gl-badge");
await p.waitForSelector(".gl-panel .gl-item");
await p.waitForTimeout(300);
await p.screenshot({ path: join(out, `${lang}-3-panel.png`) });
await ctx.close();
server.close();
console.log("done", lang);
