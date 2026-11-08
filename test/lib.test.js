const test = require("node:test");
const assert = require("node:assert/strict");
const { splitUnits, pack, distribute, RateLimiter, LRU } = require("../src/lib.js");

test("splitUnits keeps absolute offsets of every line", () => {
  const text = "Первый абзац\n\nВторой абзац";
  const units = splitUnits(text);
  assert.deepEqual(units.map((u) => u.text), ["Первый абзац", "", "Второй абзац"]);
  for (const u of units) assert.equal(text.substr(u.start, u.text.length), u.text);
});

test("splitUnits cuts long lines at sentence boundaries without losing text", () => {
  const sentence = "Это предложение. ";
  const line = sentence.repeat(50).trim();
  const units = splitUnits(line, 100);
  assert.ok(units.length > 1);
  assert.ok(units.every((u) => u.text.length <= 100));
  assert.equal(units.map((u) => u.text).join(""), line);
  for (const u of units) assert.equal(line.substr(u.start, u.text.length), u.text);
});

test("splitUnits handles a long line without spaces", () => {
  const units = splitUnits("a".repeat(250), 100);
  assert.deepEqual(units.map((u) => u.text.length), [100, 100, 50]);
});

test("pack groups units up to the limit and tracks request offsets", () => {
  const units = [{ start: 0, text: "aaaa" }, { start: 5, text: "bbbb" }, { start: 10, text: "cccc" }];
  const groups = pack(units, 9);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].text, "aaaa\nbbbb");
  assert.deepEqual(groups[0].units.map((u) => u.reqOffset), [0, 5]);
  assert.equal(groups[1].text, "cccc");
});

test("distribute maps matches back to their unit and drops cross-unit ones", () => {
  const units = [{ start: 100, text: "aaaa" }, { start: 200, text: "bbbb" }];
  const [g] = pack(units, 100);
  const out = distribute(g, [
    { offset: 1, length: 2 },  // inside unit 0
    { offset: 5, length: 3 },  // inside unit 1 (reqOffset 5)
    { offset: 3, length: 4 },  // spans the newline -> dropped
  ]);
  assert.deepEqual(out[0].map((m) => [m.offset, m.length]), [[1, 2]]);
  assert.deepEqual(out[1].map((m) => [m.offset, m.length]), [[0, 3]]);
});

test("RateLimiter allows maxReq requests per window then asks to wait", () => {
  const rl = new RateLimiter(3, 1000, 60000);
  assert.equal(rl.take(10, 0), 0);
  assert.equal(rl.take(10, 1000), 0);
  assert.equal(rl.take(10, 2000), 0);
  assert.equal(rl.take(10, 3000), 57000); // until the first one leaves the window
  assert.equal(rl.take(10, 60000), 0);
});

test("RateLimiter also limits characters per window", () => {
  const rl = new RateLimiter(100, 100, 60000);
  assert.equal(rl.take(80, 0), 0);
  assert.equal(rl.take(30, 10), 59990);
  assert.equal(rl.take(30, 60001), 0);
});

test("RateLimiter caps an oversized request at the window budget", () => {
  const rl = new RateLimiter(5, 100, 60000);
  assert.equal(rl.take(5000, 0), 0);
});

test("LRU evicts the least recently used entry", () => {
  const c = new LRU(2);
  c.set("a", 1); c.set("b", 2);
  c.get("a");
  c.set("c", 3);
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("c"), 3);
});
