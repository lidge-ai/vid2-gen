import { test } from "node:test";
import assert from "node:assert/strict";
import { escapePath, escapeValue, num, quoteExpr } from "./escape.ts";
import { GraphBuilder } from "./graph.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../shared/index.ts";
import { probeFfmpeg } from "../probe/index.ts";
import { requireFfmpeg, tempDir } from "../../tests/helpers.ts";

test("escapeValue applies option and graph escaping", () => {
  assert.equal(escapeValue("a:b"), "a\\\\:b");
  assert.equal(escapeValue("it's"), "it\\\\\\'s");
  assert.equal(escapeValue("x,y;z[1]"), "x\\,y\\;z\\[1\\]");
  assert.equal(escapeValue("back\\slash"), "back\\\\\\\\slash");
  assert.equal(escapeValue("plain text 12"), "plain text 12");
});

test("escapePath normalizes Windows paths and escapes the drive colon", () => {
  assert.equal(escapePath("C:\\Users\\a b\\x.ass"), "C\\\\:/Users/a b/x.ass");
  assert.equal(escapePath("/tmp/it's,[x].ass"), "/tmp/it\\\\\\'s\\,\\[x\\].ass");
});

test("quoteExpr wraps expressions and handles quotes", () => {
  assert.equal(quoteExpr("between(n,1,5)"), "'between(n,1,5)'");
  assert.equal(quoteExpr("a'b"), "'a'\\''b'");
});

test("num formats finite numbers without exponents", () => {
  assert.equal(num(1e-9), "0");
  assert.equal(num(-0), "0");
  assert.equal(num(1.5), "1.5");
  assert.equal(num(2 / 3), "0.666667");
  assert.equal(num(1234567), "1234567");
  assert.throws(() => num(Number.NaN));
});

test("GraphBuilder chains, splits and tracks labels", () => {
  const g = new GraphBuilder();
  const a = g.add(["0:v"], ["scale=10:10", "format=rgba"], "a");
  const [b, c] = g.split(a, 2);
  const o = g.add([b!, c!], ["overlay=0:0"], "out");
  assert.equal(o, "out");
  assert.deepEqual(g.dangling(), ["out"]);
  assert.equal(g.toString(), "[0:v]scale=10:10,format=rgba[a];\n[a]split=2[sp1][sp2];\n[sp1][sp2]overlay=0:0[out]");
  assert.throws(() => g.add(["a"], ["null"]), /consumed twice/);
  assert.throws(() => g.add(["nope"], ["null"]), /before it is produced/);
  assert.throws(() => g.add(["0:v"], ["null"], "out"), /produced twice/);
  assert.throws(() => g.add(["0:v"], []), /at least one filter/);
});


test("escaped paths survive a real ffmpeg graph file", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = join(tempDir(), "it's, [odd] dir");
  mkdirSync(dir, { recursive: true });
  // movie (file path) and metadata (free text) exist in every ffmpeg build, unlike ass/drawtext.
  const png = join(dir, "it's [1], x.png");
  const made = await run("ffmpeg", ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=8x8", "-frames:v", "1", "-y", png]);
  assert.equal(made.code, 0, made.stderr);
  const graphFile = join(dir, "g.txt");
  writeFileSync(graphFile, `movie=filename=${escapePath(png)}[m];[0:v][m]overlay=0:0,metadata=mode=add:key=vid2:value=${escapeValue("a: 'b', c")}[out]`);
  const info = await probeFfmpeg();
  const flag = info.major > 7 || (info.major === 7 && info.minor >= 1) ? "-/filter_complex" : "-filter_complex_script";
  const res = await run("ffmpeg", ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x36:d=0.2", flag, graphFile,
    "-map", "[out]", "-f", "null", "-"]);
  assert.equal(res.code, 0, res.stderr);
});

