import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { runChecked } from "../shared/exec.ts";
import { tempDir, requireFfmpeg } from "../../tests/helpers.ts";
import type { RenderPlan } from "../compile/ir.ts";
import { materializePretrim } from "./pretrim.ts";

const ffmpeg = process.env["VID2_FFMPEG"] ?? "ffmpeg";
const ffprobe = process.env["VID2_FFPROBE"] ?? "ffprobe";

function toolPlan(): RenderPlan {
  return { tool: { ffmpeg, ffprobe, version: "test", major: 9, minor: 0 } } as RenderPlan;
}

async function fixture(path: string, color: string): Promise<void> {
  await runChecked(ffmpeg, ["-hide_banner", "-v", "error", "-y", "-f", "lavfi",
    "-i", `color=c=${color}:s=32x32:r=10:d=2`, "-c:v", "ffv1", "-pix_fmt", "yuv420p",
    "-color_range", "pc", path]);
}

async function facts(path: string): Promise<{ pix_fmt: string; color_range: string; frames: string }> {
  const result = await runChecked(ffprobe, ["-v", "error", "-select_streams", "v:0", "-count_frames",
    "-show_entries", "stream=pix_fmt,color_range,nb_read_frames", "-of", "json", path]);
  const stream = (JSON.parse(result.stdout.toString()) as { streams: { pix_fmt: string; color_range: string; nb_read_frames: string }[] }).streams[0]!;
  return { pix_fmt: stream.pix_fmt, color_range: stream.color_range, frames: stream.nb_read_frames };
}

async function firstPixel(path: string): Promise<Buffer> {
  const result = await runChecked(ffmpeg, ["-hide_banner", "-v", "error", "-i", path,
    "-frames:v", "1", "-vf", "format=rgb24", "-f", "rawvideo", "-"]);
  return result.stdout.subarray(0, 3);
}

test("pretrim reuses cuts, preserves video properties, and hashes full source bytes", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-pretrim-");
  process.env["VID2_HOME"] = join(dir, "home");
  mkdirSync(join(dir, "home"), { recursive: true });
  const path = join(dir, "source.mkv");
  await fixture(path, "red");
  const original = await facts(path);
  assert.equal(original.color_range, "pc");
  const input = { sourcePath: path, inSeconds: 0.2, durationSeconds: 0.8 };
  const plan = toolPlan();
  const first = await materializePretrim(input, plan, "seg-one", { hashes: new Map() });
  assert.equal(first.cached, false);
  assert.deepEqual(await facts(first.path), { ...original, frames: "8" });
  const again = await materializePretrim(input, plan, "seg-one", { hashes: new Map() });
  assert.equal(again.cached, true);
  assert.equal(again.path, first.path);
  const concurrent = await Promise.all([0, 1, 2].map(() => materializePretrim(
    { ...input, inSeconds: 0.3 }, plan, "seg-one", { hashes: new Map() })));
  assert.equal(new Set(concurrent.map((item) => item.path)).size, 1);
  const before = statSync(path);
  await fixture(path, "blue");
  const missing = before.size - statSync(path).size;
  assert.ok(missing >= 0);
  appendFileSync(path, Buffer.alloc(missing));
  utimesSync(path, before.atime, before.mtime);
  assert.equal(statSync(path).size, before.size);
  const replaced = await materializePretrim(input, plan, "seg-one", { hashes: new Map() });
  assert.equal(replaced.cached, false);
  assert.notEqual(replaced.path, first.path);
  const red = await firstPixel(first.path);
  const blue = await firstPixel(replaced.path);
  assert.ok(red[0]! > red[2]! * 2);
  assert.ok(blue[2]! > blue[0]! * 2);
  const forced = await materializePretrim(input, plan, "seg-one", { hashes: new Map(), noCache: true });
  assert.equal(forced.cached, false);
  assert.equal(forced.path, replaced.path);
});

test("pretrim failure names source and segment", async () => {
  const sourcePath = join(tempDir("vid2-pretrim-missing-"), "missing.mp4");
  await assert.rejects(materializePretrim({ sourcePath, inSeconds: 0, durationSeconds: 1 }, toolPlan(), "seg-fail",
    { hashes: new Map() }), (error: unknown) => {
    assert.equal((error as { code?: string }).code, "E_RENDER");
    assert.deepEqual((error as { details?: unknown }).details, { source: sourcePath, segment: "seg-fail" });
    return true;
  });
});
