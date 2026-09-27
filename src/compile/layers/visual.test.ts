import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../shared/exec.ts";
import { TimelineSchema } from "../../timeline/schema.ts";
import { resolveTimeline } from "../../timeline/resolve.ts";
import { GraphBuilder } from "../graph.ts";
import type { BuildContext, InputRegistry, InputSpec, LayerOutput } from "../ir.ts";
import { solidRect } from "../png.ts";
import { buildMediaLayer } from "./media.ts";
import { buildShapeLayer } from "./shape.ts";
import { buildOverlayLayer } from "./overlay.ts";
import { requireFfmpeg, tempDir } from "../../../tests/helpers.ts";

function context(rate: number, pngDir: string, sources: BuildContext["sources"] = {}) {
  const specs: InputSpec[] = [];
  const inputs: InputRegistry = {
    add(spec) { const index = specs.length; specs.push({ ...spec, id: `i${index}` }); return `${index}:v`; },
    list() { return specs; },
  };
  const graph = new GraphBuilder();
  const ctx: BuildContext = { graph, inputs, width: 64, height: 36, scale: 1, fps: { num: 10, den: 1 }, rate,
    frames: 40, renderFrames: 40, background: "#000000", oversample: 1, profile: "proxy", sceneId: "s",
    sources, fonts: {}, workDir: pngDir, pngDir, textBackend: "ass" as const };
  inputs.add({ kind: "lavfi", lavfi: `color=c=black:s=64x36:r=${10 * rate}:d=4`,
    args: ["-f", "lavfi", "-i", `color=c=black:s=64x36:r=${10 * rate}:d=4`] });
  const canvas = graph.add(["0:v"], ["format=rgba"]);
  return { ctx, canvas, specs };
}

function composite(ctx: BuildContext, canvas: string, layer: LayerOutput): string {
  assert.equal(layer.mode, "overlay");
  return ctx.graph.add([canvas, layer.label], [`overlay=x=${layer.x}:y=${layer.y}:eof_action=pass:format=auto`, "format=rgb24"]);
}

async function frames(ctx: BuildContext, specs: InputSpec[], output: string): Promise<Buffer> {
  const args = ["-hide_banner", "-v", "error", ...specs.flatMap((spec) => spec.args), "-filter_complex", ctx.graph.toString(),
    "-map", `[${output}]`, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"];
  const result = await run(process.env["VID2_FFMPEG"] ?? "ffmpeg", args);
  assert.equal(result.code, 0, result.stderr);
  return result.stdout;
}

function pixel(data: Buffer, frame: number, x: number, y: number): [number, number, number] {
  const i = ((frame * 64 * 36) + y * 64 + x) * 3;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
}

function redPixels(data: Buffer, frame: number): number {
  let count = 0;
  for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) if (pixel(data, frame, x, y)[0] > 180) count++;
  return count;
}

void test("shape builder visibly composites onto a color canvas", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ctx, canvas, specs } = context(1, tempDir());
  const timeline = TimelineSchema.parse({ version: 1, output: { width: 64, height: 36, fps: 10 },
    scenes: [{ id: "s", duration: "4s", layers: [{ type: "shape", shape: "rect", x: 4, y: 4, width: 16, height: 10, color: "#ff0000" }] }] });
  const layer = resolveTimeline(timeline, { baseDir: ctx.workDir }).scenes[0]!.layers[0]!;
  assert.equal(layer.type, "shape");
  const output = composite(ctx, canvas, buildShapeLayer(layer, ctx));
  const data = await frames(ctx, specs, output);
  assert.ok(pixel(data, 0, 8, 8)[0] > 200);
  assert.ok(pixel(data, 0, 30, 20).every((value) => value < 30));
});

void test("delayed still is absent before its span and visible after, including internal rate 3", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir();
  const path = join(dir, "red.png");
  writeFileSync(path, solidRect(64, 36, 0, [255, 0, 0, 255]));
  for (const rate of [1, 3]) {
    const timeline = TimelineSchema.parse({ version: 1, output: { width: 64, height: 36, fps: 10 },
      sources: { still: { type: "image", path } },
      scenes: [{ id: "s", duration: "4s", layers: [{ type: "media", source: "still", start: "2s", end: "3s" }] }] });
    const resolved = resolveTimeline(timeline, { baseDir: dir });
    const { ctx, canvas, specs } = context(rate, dir, resolved.sources);
    const layer = resolved.scenes[0]!.layers[0]!;
    assert.equal(layer.type, "media");
    const output = composite(ctx, canvas, buildMediaLayer(layer, ctx));
    const data = await frames(ctx, specs, output);
    assert.ok(pixel(data, 19 * rate, 32, 18).every((value) => value < 30), `rate ${rate}: early frame`);
    assert.ok(pixel(data, 21 * rate, 32, 18)[0] > 200, `rate ${rate}: visible frame`);
  }
});

void test("perspective camera visibly expands a half-size still", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir();
  const path = join(dir, "red.png");
  writeFileSync(path, solidRect(64, 36, 0, [255, 0, 0, 255]));
  const timeline = TimelineSchema.parse({ version: 1, output: { width: 64, height: 36, fps: 10 },
    sources: { still: { type: "image", path } }, scenes: [{ id: "s", duration: "4s", layers: [{ type: "media", source: "still",
      camera: [{ at: "0s", zoom: 0.5 }, { at: "2s", zoom: 1 }] }] }] });
  const resolved = resolveTimeline(timeline, { baseDir: dir });
  const { ctx, canvas, specs } = context(1, dir, resolved.sources);
  const layer = resolved.scenes[0]!.layers[0]!;
  assert.equal(layer.type, "media");
  const output = composite(ctx, canvas, buildMediaLayer(layer, ctx));
  const data = await frames(ctx, specs, output);
  assert.ok(redPixels(data, 0) > 300 && redPixels(data, 0) < 1400);
  assert.ok(redPixels(data, 25) > redPixels(data, 0) * 2);
});

void test("rounded window shows media inside and canvas outside", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir();
  const path = join(dir, "red.png");
  writeFileSync(path, solidRect(64, 36, 0, [255, 0, 0, 255]));
  const timeline = TimelineSchema.parse({ version: 1, output: { width: 64, height: 36, fps: 10 },
    sources: { still: { type: "image", path } }, scenes: [{ id: "s", duration: "4s", layers: [{ type: "media", source: "still",
      window: { x: 16, y: 9, width: 32, height: 18, radius: 6, shadow: true, border: true,
        perspective: { rx: 0, ry: 10 } } }] }] });
  const resolved = resolveTimeline(timeline, { baseDir: dir });
  const { ctx, canvas, specs } = context(1, dir, resolved.sources);
  const layer = resolved.scenes[0]!.layers[0]!;
  assert.equal(layer.type, "media");
  const output = composite(ctx, canvas, buildMediaLayer(layer, ctx));
  const data = await frames(ctx, specs, output);
  assert.ok(pixel(data, 0, 32, 18)[0] > 180);
  assert.ok(pixel(data, 0, 0, 0)[0] < 30);
});

void test("screen overlay brightens only its declared span", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir();
  const path = join(dir, "red.png");
  writeFileSync(path, solidRect(64, 36, 0, [255, 0, 0, 255]));
  const timeline = TimelineSchema.parse({ version: 1, output: { width: 64, height: 36, fps: 10 },
    sources: { glow: { type: "image", path } }, scenes: [{ id: "s", duration: "4s", layers: [{ type: "overlay", source: "glow",
      blend: "screen", start: "1s", end: "3s" }] }] });
  const resolved = resolveTimeline(timeline, { baseDir: dir });
  const { ctx, canvas, specs } = context(1, dir, resolved.sources);
  const layer = resolved.scenes[0]!.layers[0]!;
  assert.equal(layer.type, "overlay");
  const built = buildOverlayLayer(layer, ctx);
  assert.equal(built.mode, "blend");
  const base = ctx.graph.add([canvas], ["format=gbrp"]);
  const output = ctx.graph.add([base, built.label], [`blend=all_mode=screen:all_opacity=${built.opacity}`, "format=rgb24"]);
  const data = await frames(ctx, specs, output);
  assert.ok(pixel(data, 5, 32, 18)[0] < 30);
  assert.ok(pixel(data, 15, 32, 18)[0] > 180);
  assert.ok(pixel(data, 35, 32, 18)[0] < 30);
});

void test("blurfill keeps a visible background behind a narrow subject", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir();
  const path = join(dir, "narrow.png");
  writeFileSync(path, solidRect(16, 36, 0, [255, 0, 0, 255]));
  const timeline = TimelineSchema.parse({ version: 1, output: { width: 64, height: 36, fps: 10 },
    sources: { still: { type: "image", path } }, scenes: [{ id: "s", duration: "4s", layers: [{ type: "media", source: "still", fit: "blurfill" }] }] });
  const resolved = resolveTimeline(timeline, { baseDir: dir });
  const { ctx, canvas, specs } = context(1, dir, resolved.sources);
  const layer = resolved.scenes[0]!.layers[0]!;
  assert.equal(layer.type, "media");
  const output = composite(ctx, canvas, buildMediaLayer(layer, ctx));
  const data = await frames(ctx, specs, output);
  assert.ok(pixel(data, 0, 2, 18)[0] > 40);
  assert.ok(pixel(data, 0, 32, 18)[0] > 180);
});

void test("faster video still fills its declared output span", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir();
  const path = join(dir, "red.mkv");
  const source = await run(process.env["VID2_FFMPEG"] ?? "ffmpeg", ["-hide_banner", "-v", "error", "-f", "lavfi", "-i",
    "color=c=red:s=64x36:r=10:d=3", "-c:v", "ffv1", path]);
  assert.equal(source.code, 0, source.stderr);
  const timeline = TimelineSchema.parse({ version: 1, output: { width: 64, height: 36, fps: 10 },
    sources: { clip: { type: "video", path } }, scenes: [{ id: "s", duration: "4s", layers: [{ type: "media", source: "clip", speed: 2, end: "1s" }] }] });
  const resolved = resolveTimeline(timeline, { baseDir: dir });
  const { ctx, canvas, specs } = context(1, dir, resolved.sources);
  const layer = resolved.scenes[0]!.layers[0]!;
  assert.equal(layer.type, "media");
  const output = composite(ctx, canvas, buildMediaLayer(layer, ctx));
  const data = await frames(ctx, specs, output);
  assert.ok(pixel(data, 9, 32, 18)[0] > 180);
  assert.ok(pixel(data, 11, 32, 18)[0] < 30);
});
