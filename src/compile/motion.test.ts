import test from "node:test";
import assert from "node:assert/strict";
import type { BuildContext, LayerOf } from "./ir.ts";
import { GraphBuilder } from "./graph.ts";
import { motionCanvas, perspectiveFilters, projectWindowCorners } from "./motion.ts";

const ctx = { graph: new GraphBuilder(), width: 1920, height: 1080, scale: 1, fps: { num: 30, den: 1 },
  rate: 1, frames: 90, renderFrames: 90, background: "#000000", oversample: 2, profile: "final", sceneId: "s",
  sources: {}, fonts: {}, workDir: ".", pngDir: "." } as BuildContext;

function media(zoom: number): LayerOf<"media"> {
  return { type: "media", source: "a", fit: "cover", speed: 1, motion: "none", opacity: 1, volume: 0,
    camera: [{ at: 0, zoom, x: 0.5, y: 0.5, ease: "linear" }], start: 0,
    startFrame: 0, endFrame: 90, startSeconds: 0, endSeconds: 3,
    absoluteStartFrame: 0, absoluteEndFrame: 90, absoluteStartSeconds: 0, absoluteEndSeconds: 3 };
}

void test("expanded zoom canvas respects the 8192 pixel guard", () => {
  const canvas = motionCanvas(media(0.2), ctx, 1920, 1080);
  assert.ok(canvas.width <= 8192 && canvas.height <= 8192);
  assert.equal(canvas.oversample, 1);
  assert.equal(canvas.minZoom, 0.2);
});

void test("camera graph uses perspective input-frame expressions", () => {
  const filters = perspectiveFilters(media(0.5), { ...ctx, width: 320, height: 180 }, 320, 180);
  assert.match(filters.perspective, /perspective=.*eval=frame/);
  assert.match(filters.perspective, /clip\(/);
  assert.equal(filters.canvas.width, 1280);
  assert.ok(filters.before.some((filter) => filter.startsWith("pad=")));
});

void test("pinhole window projection leaves zero rotation unchanged and skews ry", () => {
  const flat = projectWindowCorners(320, 180, 160, 90, 0, 0);
  assert.deepEqual(flat, [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 0, y: 180 }, { x: 320, y: 180 }]);
  const tilted = projectWindowCorners(320, 180, 160, 90, 0, 10);
  assert.notEqual(tilted[0].x, 0);
  assert.notEqual(tilted[1].x, 320);
  assert.ok(Math.abs(tilted[0].x - tilted[2].x) < 1e-6);
});
