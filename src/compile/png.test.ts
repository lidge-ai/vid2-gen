import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../shared/exec.ts";
import { requireFfmpeg, tempDir } from "../../tests/helpers.ts";
import { cachedPng, encodePng, roundedRectBorder, roundedRectMask, softShadow, solidRect } from "./png.ts";

void test("PNG encoder checks dimensions and shape generators produce PNG bytes", () => {
  assert.throws(() => encodePng(2, 2, 4, new Uint8Array(3)), RangeError);
  for (const png of [roundedRectMask(16, 12, 4), roundedRectBorder(16, 12, 4), softShadow(16, 12, 4),
    solidRect(16, 12, 4, [255, 0, 0, 255])]) {
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  }
});

void test("generated mask PNG decodes at its intended size", async (t) => {
  if (!requireFfmpeg(t)) return;
  const path = join(tempDir(), "mask.png");
  writeFileSync(path, roundedRectMask(16, 12, 4));
  const probe = await run(process.env["VID2_FFPROBE"] ?? "ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "json", path]);
  assert.equal(probe.code, 0, probe.stderr);
  const stream = (JSON.parse(probe.stdout.toString()) as { streams: { width: number; height: number }[] }).streams[0];
  assert.deepEqual(stream, { width: 16, height: 12 });
});

void test("cached PNG names are stable for the same parameters", () => {
  const dir = tempDir();
  let calls = 0;
  const make = () => { calls++; return roundedRectMask(8, 8, 2); };
  assert.equal(cachedPng(dir, { w: 8 }, make), cachedPng(dir, { w: 8 }, make));
  assert.equal(calls, 1);
});
