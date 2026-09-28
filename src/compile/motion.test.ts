import test from "node:test";
import assert from "node:assert/strict";
import type { BuildContext, LayerOf } from "./ir.ts";
import { GraphBuilder } from "./graph.ts";
import { motionCanvas, perspectiveFilters, projectWindowCorners } from "./motion.ts";
import { Vid2Error } from "../shared/errors.ts";

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

void test("camera key beat and bar positions use the build context beat grid", () => {
  const layer = media(1);
  for (const [at, frame] of [["2b", 30], ["1bar", 60]] as const) {
    layer.camera = [{ at: "0s", zoom: 1, x: 0.5, y: 0.5, ease: "linear" },
      { at, zoom: 1.2, x: 0.6, y: 0.5, ease: "linear" }];
    const filters = perspectiveFilters(layer, { ...ctx, beat: { bpm: 120, meter: 4, offsetFrames: 0 } }, 1920, 1080);
    assert.ok(filters.perspective.includes(`gte(in,${frame})`));
  }
});

void test("96 manual camera keys reject an oversized assembled expression", () => {
  const layer = media(1);
  layer.camera = Array.from({ length: 96 }, (_, i) => ({ at: i / 30, zoom: i % 2 ? 1.6 : 1,
    x: i % 2 ? 0.75 : 0.25, y: i % 2 ? 0.7 : 0.3, ease: "linear" as const }));
  assert.throws(() => perspectiveFilters(layer, { ...ctx, layerPath: "scenes.0.layers.0" }, 1920, 1080), (error: unknown) => {
    assert.ok(error instanceof Vid2Error);
    assert.equal(error.code, "E_INPUT");
    assert.equal(error.details?.path, "scenes.0.layers.0.camera");
    assert.match(error.fix ?? "", /fewer camera keys or split the layer/);
    return true;
  });
});
