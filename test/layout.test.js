const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../src/layout.js");
require("../src/layout-data.js");

const d = new L.Detector(globalThis.GladkoLayoutData);
const fix = (t, context = null) => { const r = d.check(t, { context }); return r && r.replacement; };

test("convert maps both directions and keeps case, punctuation and digits", () => {
  assert.equal(L.convert("ghbdtn"), "привет");
  assert.equal(L.convert("ghbdtn, vbh"), "приветб мир"); // plain mapping converts every key
  assert.equal(L.convert("руддщ"), "hello");
  assert.equal(L.convert("GHBDTN 123"), "ПРИВЕТ 123");
  assert.equal(L.convert(L.convert("nfr;t [jhjij")), "nfr;t [jhjij");
});

test("convertText keeps punctuation at word edges unless it makes a real word", () => {
  assert.equal(d.convertText("Ghbdtn, vbh!"), "Привет, мир!");
  assert.equal(d.convertText("Ye yt pyf."), "Ну не знаю");
  assert.equal(d.convertText("nfr;t [jhjij"), "также хорошо");
  assert.equal(d.convertText("руддщ, цщкдв"), "hello, world");
  assert.equal(d.convertText("ghbdtn ок"), "привет ок");   // words already in Russian stay
});

test("direction follows the dominant script", () => {
  assert.equal(L.direction("ghbdtn"), "ru");
  assert.equal(L.direction("руддщ"), "en");
});

test("wrong-layout words are detected, including keys that are Russian letters", () => {
  assert.equal(fix("ghbdtn"), "привет");
  assert.equal(fix("rjvgm.nth"), "компьютер"); // . -> ю
  assert.equal(fix("nfr;t"), "также");      // ; -> ж
  assert.equal(fix("[jhjij"), "хорошо");    // [ -> х
  assert.equal(fix(",tp", "ru"), "без");    // , -> б
  assert.equal(fix("руддщ"), "hello");
  assert.equal(fix("вщтэе"), "don't");      // э -> '
  assert.equal(fix("GHBDTN"), "ПРИВЕТ");
});

test("edge punctuation stays punctuation", () => {
  assert.equal(fix("Ghbdtn,"), "Привет,");
  assert.equal(fix("'nj", "ru"), "это");     // here the apostrophe is the letter э
});

test("real words, acronyms, code and links are left alone", () => {
  for (const w of ["привет", "hello", "kubernetes", "nginx", "github", "docker", "SQL", "HTML", "x2", "user@mail.ru"]) {
    assert.equal(fix(w), null, w);
  }
});

test("short words need a matching context", () => {
  assert.equal(fix("yt"), null);
  assert.equal(fix("yt", "ru"), "не");
  assert.equal(fix("ds", "en"), null);
});

test("inside English text an English-looking word is not converted", () => {
  assert.equal(fix("verb", "en"), null);
});

test("analyze finds every wrong-layout word and uses the other words as context", () => {
  const res = d.analyze("Ну yt pyf. xnj ltkfnm, ghbdtn");
  assert.deepEqual(res.map((m) => m.replacement), ["не", "знаю", "что", "делать,", "привет"]);
  for (const m of res) assert.equal("Ну yt pyf. xnj ltkfnm, ghbdtn".substr(m.offset, m.length), m.original);
  assert.deepEqual(d.analyze("Привет! Вот ссылка на github и docker"), []);
  assert.deepEqual(d.analyze("I love my verb tense"), []);
});

test("the user's dictionary wins", () => {
  assert.equal(d.check("ghbdtn", { ignore: new Set(["ghbdtn"]) }), null);
});
