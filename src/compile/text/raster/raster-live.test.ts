import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { runChecked } from "../../../shared/index.ts";
import { TimelineSchema, resolveTimeline } from "../../../timeline/index.ts";
import { compileSegment } from "../../segment.ts";
import type { SegmentBase } from "../../segment.ts";
import { requireFfmpeg, tempDir } from "../../../../tests/helpers.ts";

function scene(animation: string) {
  const t = TimelineSchema.parse({ version: 1, output: { width: 320, height: 180, fps: 15 }, scenes: [{ id: "one", duration: "2s",
    layers: [{ type: "text", text: "VID2", size: 52, color: "#FFFFFF", animation, animationDuration: "0.4s",
      start: "0.5s", end: "1.8s" }] }] });
  return resolveTimeline(t, { baseDir: process.cwd() }).scenes[0]!;
}

async function render(animation: string, backend: "raster" | "ass"): Promise<string> {
  const workDir = tempDir(`vid2-${backend}-live-`);
  const base: SegmentBase = { width: 320, height: 180, scale: 1, oversample: 1, profile: "final", fps: { num: 15, den: 1 },
    background: "#000000", sources: {}, fonts: {}, workDir, pngDir: join(workDir, "png"), textBackend: backend };
  const plan = compileSegment(scene(animation), base, true);
  for (const ass of plan.assFiles) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(ass.path, ass.content);
  }
  const output = join(workDir, `${animation}.mp4`);
  await runChecked("ffmpeg", ["-hide_banner", "-loglevel", "error", ...plan.inputs.flatMap(input => input.args),
    "-filter_complex", plan.graph, "-map", `[${plan.outLabel}]`, "-frames:v", String(plan.renderFrames),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", output]);
  return output;
}

async function grayFrame(file: string, at: number): Promise<Buffer> {
  const result = await runChecked("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(at), "-i", file,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  assert.equal(result.stdout.length, 320 * 180);
  return result.stdout;
}

function bbox(gray: Buffer): { x: number; y: number; width: number; height: number; pixels: number } {
  let minX = 320, minY = 180, maxX = -1, maxY = -1, pixels = 0;
  for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
    if (gray[y * 320 + x]! < 80) continue;
    minX = Math.min(x, minX); minY = Math.min(y, minY); maxX = Math.max(x, maxX); maxY = Math.max(y, maxY); pixels++;
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, pixels };
}

test("raster rise is absent before entrance and visibly present after", async t => {
  if (!requireFfmpeg(t)) return;
  const file = await render("rise", "raster");
  const before = bbox(await grayFrame(file, 0.2));
  const after = bbox(await grayFrame(file, 1.0));
  assert.equal(before.pixels, 0);
  assert.ok(after.pixels > 150, `visible text pixels: ${after.pixels}`);
  const probe = await runChecked("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
    "stream=nb_read_frames", "-of", "default=noprint_wrappers=1:nokey=1", file]);
  assert.equal(Number(probe.stdout.toString().trim()), 30);
});

test("every raster animation renders visible text", async t => {
  if (!requireFfmpeg(t)) return;
  for (const animation of ["none", "fade", "rise", "slam", "pop", "type", "wipe", "blur"]) {
    const file = await render(animation, "raster");
    const middle = bbox(await grayFrame(file, 1.0));
    assert.ok(middle.pixels > 100, `${animation}: ${middle.pixels} visible pixels`);
  }
});

test("type and wipe reveal progressively", async t => {
  if (!requireFfmpeg(t)) return;
  for (const animation of ["type", "wipe"]) {
    const file = await render(animation, "raster");
    const early = bbox(await grayFrame(file, 0.6));
    const complete = bbox(await grayFrame(file, 1.0));
    assert.ok(early.pixels > 0 && early.pixels < complete.pixels, `${animation}: ${early.pixels} -> ${complete.pixels}`);
  }
});

test("raster and ASS text bounds agree within a few pixels", async t => {
  if (!requireFfmpeg(t)) return;
  const filters = await runChecked("ffmpeg", ["-hide_banner", "-filters"]);
  if (!/^\s*[TSC.]{2,3}\s+ass\s/m.test(filters.stdout.toString())) { t.skip("ffmpeg has no libass"); return; }
  const raster = bbox(await grayFrame(await render("none", "raster"), 1.0));
  const ass = bbox(await grayFrame(await render("none", "ass"), 1.0));
  assert.ok(Math.abs(raster.x - ass.x) <= 6, `x: ${raster.x} vs ${ass.x}`);
  assert.ok(Math.abs(raster.y - ass.y) <= 6, `y: ${raster.y} vs ${ass.y}`);
  assert.ok(Math.abs(raster.width - ass.width) <= 8, `width: ${raster.width} vs ${ass.width}`);
  assert.ok(Math.abs(raster.height - ass.height) <= 8, `height: ${raster.height} vs ${ass.height}`);
});
