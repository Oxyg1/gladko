// Store screenshots (1280x800) for AMO and Chrome Web Store.
// 1) loads the real Chrome build in Chromium with a fake LanguageTool on :8081 and captures UI pieces,
// 2) lays them out on branded slides.  Usage: node scripts/store-shots.mjs [ru|en]
import { createRequire } from "node:module";
import http from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ext = join(root, "dist", "chrome");
const lang = process.argv[2] === "en" ? "en" : "ru";
const outDir = join(root, "store", "screenshots");
mkdirSync(outDir, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "gl-store-"));

const L = {
  ru: {
    to: "Кому", toVal: "команда@пример.рф", subj: "Тема", subjVal: "Отчёт за неделю", send: "Отправить",
    text: "Привет, команда! Отправляю превет и отчёт за неделю. Ихний менеджер просил исправленя до пятницы, поэтому посмотрите весьма очень внимательно.",
    typos: {
      превет: [["привет", "превед", "пред"], "misspelling", "Возможна орфографическая ошибка"],
      Ихний: [["Их"], "grammar", "Разговорная форма: правильно «их»"],
      исправленя: [["исправления"], "misspelling", "Возможна орфографическая ошибка"],
      "весьма очень": [["очень"], "style", "Избыточное сочетание слов"],
    },
    slides: [
      ["Проверка текста", "Ошибки видны сразу — в любом поле ввода", "Почта, мессенджеры, формы, редакторы. Гладко подчёркивает орфографию, грамматику и стиль, пока вы пишете."],
      ["Один клик", "Исправление — одним нажатием", "Ошибка зачёркнута, правильный вариант — крупной кнопкой. Остальные варианты, «Пропустить» и личный словарь — рядом."],
      ["Все замечания", "Весь список — в одном окне", "Значок в углу поля показывает, сколько замечаний. «Исправить всё» правит текст целиком."],
      ["Меню на панели", "Всё под рукой — по клику на значок", "Включить или выключить, отключить на сайте, пауза, сервер, язык и статистика за день."],
      ["Приватность", "Ваш текст — под вашим контролем", "Облако LanguageTool или свой сервер на компьютере: тогда текст вообще никуда не уходит. Без аналитики и рекламы."],
    ],
  },
  en: {
    to: "To", toVal: "team@example.com", subj: "Subject", subjVal: "Weekly report", send: "Send",
    text: "Hi team! I am sending the reprot for this week. Their manager asked for chnages before Friday, so please check it very very carefully.",
    typos: {
      reprot: [["report", "re-port", "rapport"], "misspelling", "Possible spelling mistake"],
      Their: [["The"], "grammar", "Did you mean “The”?"],
      chnages: [["changes"], "misspelling", "Possible spelling mistake"],
      "very very": [["very"], "style", "Possible typo: you repeated a word"],
    },
    slides: [
      ["Writing check", "See mistakes instantly — in any text field", "Email, chats, forms and editors. Gladko underlines spelling, grammar and style as you type."],
      ["One click", "Fix it with a single click", "The mistake is struck through and the right word is one big button. Alternatives, Ignore and your dictionary are right there."],
      ["All issues", "Every issue in one list", "The badge in the field shows the count. “Fix all” corrects the whole text at once."],
      ["Toolbar menu", "Everything one click away", "Turn checking on or off, disable a site, pause, pick a server and language, see today's stats."],
      ["Privacy", "Your text stays under your control", "Use the LanguageTool cloud or a server on your own computer, so text goes nowhere. No analytics, no ads."],
    ],
  },
}[lang];

const composer = `<!doctype html><meta charset=utf-8><title>Mail</title><style>
body{margin:0;background:#eef2f3;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1c2a2d}
.win{width:860px;margin:30px;background:#fff;border-radius:14px;box-shadow:0 2px 10px #0001;overflow:hidden}
.row{display:flex;gap:14px;padding:12px 22px;border-bottom:1px solid #e6ebec;font-size:15px}.row b{width:60px;color:#7a888b;font-weight:500}
textarea{display:block;width:100%;box-sizing:border-box;height:260px;border:0;padding:18px 22px;font:19px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1c2a2d;resize:none;outline:none}
.bar{display:flex;padding:14px 22px;border-top:1px solid #e6ebec}.bar span{background:#126067;color:#fff;border-radius:9px;padding:9px 22px;font-weight:600}
</style><div class=win id=win><div class=row><b>${L.to}</b>${L.toVal}</div><div class=row><b>${L.subj}</b>${L.subjVal}</div>
<textarea id=t spellcheck=false></textarea><div class=bar><span>${L.send}</span></div></div>`;

const server = http.createServer((req, res) => {
  if (req.url === "/compose") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(composer); return; }
  if (req.url.startsWith("/v2/languages")) { res.end("[]"); return; }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const text = new URLSearchParams(body).get("text") || "";
    const matches = [];
    for (const [w, [reps, type, msg]] of Object.entries(L.typos)) {
      const i = text.indexOf(w);
      if (i >= 0) matches.push({ offset: i, length: w.length, message: msg, replacements: reps.map((value) => ({ value })), rule: { id: "R" + i, issueType: type } });
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ matches }));
  });
});
await new Promise((r) => server.listen(8081, "127.0.0.1", r));

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "gl-prof-")), {
  channel: "chromium", headless: true, deviceScaleFactor: 2, viewport: { width: 1000, height: 900 },
  env: { ...process.env, LANGUAGE: lang === "ru" ? "ru" : "en-US" },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
const id = new URL(sw.url()).host;
await new Promise((r) => setTimeout(r, 1200));
await sw.evaluate(() => chrome.storage.local.set({ stats: { day: new Date().toLocaleDateString("sv"), checks: 128, fixes: 37, totalFixes: 412 } }));

// ---- captures ----
const shot = {};
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:8081/compose");
await p.click("#t");
await p.keyboard.type(L.text, { delay: 1 });
await p.waitForFunction(() => document.querySelectorAll(".gl-mark").length >= 4, null, { timeout: 20000 });
await p.waitForTimeout(400);
const win = await p.$("#win");
const box = await win.boundingBox();
shot.compose = join(work, "compose.png");
await p.screenshot({ path: shot.compose, clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 } });

const first = await p.$eval(".gl-mark", (e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await p.mouse.click(first[0], first[1]);
await p.waitForSelector(".gl-card");
await p.waitForTimeout(400);
shot.composeCard = join(work, "compose-card.png");
const cb0 = await (await p.$(".gl-card")).boundingBox();
await p.screenshot({ path: shot.composeCard, clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: Math.max(box.height, cb0.y + cb0.height - box.y) + 40 } });
const cardBox = await (await p.$(".gl-card")).boundingBox();
shot.card = join(work, "card.png");
await p.evaluate(() => { document.getElementById("win").style.opacity = "0"; document.body.style.background = "transparent"; const st = document.createElement("style"); st.id = "iso"; st.textContent = ".gl-host .gl-mark,.gl-host .gl-badge{opacity:0!important}"; document.head.append(st); });
await p.screenshot({ path: shot.card, clip: { x: cardBox.x - 24, y: cardBox.y - 24, width: cardBox.width + 48, height: cardBox.height + 48 }, omitBackground: true });
await p.evaluate(() => { document.getElementById("win").style.opacity = ""; document.body.style.background = ""; document.getElementById("iso")?.remove(); });
await p.keyboard.press("Escape");
await p.click(".gl-badge");
await p.waitForSelector(".gl-panel .gl-item");
await p.waitForTimeout(400);
const pb = await (await p.$(".gl-panel")).boundingBox();
shot.panel = join(work, "panel.png");
await p.evaluate(() => { document.getElementById("win").style.opacity = "0"; document.body.style.background = "transparent"; const st = document.createElement("style"); st.id = "iso"; st.textContent = ".gl-host .gl-mark,.gl-host .gl-badge{opacity:0!important}"; document.head.append(st); });
await p.screenshot({ path: shot.panel, clip: { x: pb.x - 24, y: pb.y - 24, width: pb.width + 48, height: pb.height + 48 }, omitBackground: true });

const web = p;
const pop = await ctx.newPage();
await pop.setViewportSize({ width: 360, height: 700 });
await web.bringToFront();
await pop.goto(`chrome-extension://${id}/popup.html`);
await pop.waitForTimeout(1200);
await pop.setViewportSize({ width: 360, height: await pop.evaluate(() => document.body.scrollHeight) });
shot.popup = join(work, "popup.png");
await pop.screenshot({ path: shot.popup });

const opt = await ctx.newPage();
await opt.setViewportSize({ width: 880, height: 1000 });
await opt.goto(`chrome-extension://${id}/options.html#server`);
await opt.waitForTimeout(900);
await opt.evaluate(() => document.querySelector("#server").scrollIntoView());
await opt.waitForTimeout(300);
const sb = await (await opt.$("#server .choices")).boundingBox();
shot.servers = join(work, "servers.png");
await opt.screenshot({ path: shot.servers, clip: { x: sb.x - 10, y: sb.y - 8, width: sb.width + 20, height: sb.height + 18 } });
await ctx.close();
server.close();

// ---- slides ----
const logo = readFileSync(join(root, "src", "icons", "logo.svg"), "utf8");
const url = (f) => pathToFileURL(f).href;
const css = `*{box-sizing:border-box}html,body{margin:0}
body{width:1280px;height:800px;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1c2a2d;
background:radial-gradient(900px 600px at 100% 0%,#d7ebe9 0,transparent 60%),radial-gradient(700px 500px at 0% 100%,#f6e6d3 0,transparent 60%),#f7f5f0}
.brand{position:absolute;left:64px;top:52px;display:flex;align-items:center;gap:12px;font-weight:700;font-size:22px}.brand svg{width:40px;height:40px}
.kicker{display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:999px;background:#126067;color:#fff;font-weight:700;font-size:15px;letter-spacing:.02em}
h1{margin:18px 0 0;font-size:46px;line-height:1.1;letter-spacing:-.02em;font-weight:800}
p{margin:18px 0 0;font-size:20px;line-height:1.5;color:#526265}
.left{position:absolute;left:64px;top:150px;width:470px}
.right{position:absolute;right:56px;top:0;bottom:0;display:flex;align-items:center;justify-content:center;width:640px}
.frame{border-radius:18px;box-shadow:0 30px 70px rgba(18,96,103,.22),0 6px 18px rgba(28,42,45,.12);background:#fff;overflow:hidden}
.frame img{display:block}
.top{position:absolute;left:64px;right:64px;top:118px;text-align:center}.top h1{font-size:44px}.top p{margin-top:12px}
.under{position:absolute;left:0;right:0;bottom:-30px;display:flex;justify-content:center}`;
const slide = (i, body) => `<!doctype html><meta charset=utf-8><style>${css}</style><body><div class=brand>${logo}<span>${lang === "ru" ? "Гладко" : "Gladko"}</span></div>${body}</body>`;
const text = (i) => `<span class=kicker>${L.slides[i][0]}</span><h1>${L.slides[i][1]}</h1><p>${L.slides[i][2]}</p>`;
const pages = [
  slide(0, `<div class=top>${text(0)}</div><div class=under><div class=frame style="width:930px"><img src="${url(shot.composeCard)}" style="width:930px"></div></div>`),
  slide(1, `<div class=left>${text(1)}</div><div class=right><img src="${url(shot.card)}" style="width:560px;filter:drop-shadow(0 30px 50px rgba(18,96,103,.25))"></div>`),
  slide(2, `<div class=left>${text(2)}</div><div class=right><img src="${url(shot.panel)}" style="width:600px;filter:drop-shadow(0 30px 50px rgba(18,96,103,.22))"></div>`),
  slide(3, `<div class=left>${text(3)}</div><div class=right><div class=frame style="width:400px"><img src="${url(shot.popup)}" style="width:400px"></div></div>`),
  slide(4, `<div class=left>${text(4)}</div><div class=right><div class=frame style="width:600px;padding:8px;background:#f7f5f0"><img src="${url(shot.servers)}" style="width:584px"></div></div>`),
];
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
for (let i = 0; i < pages.length; i++) {
  const f = join(work, `slide-${i}.html`);
  writeFileSync(f, pages[i]);
  await page.goto(url(f));
  await page.waitForTimeout(200);
  const out = join(outDir, `${lang}-${i + 1}.png`);
  await page.screenshot({ path: out });
  console.log("saved", out);
}
await b.close();
