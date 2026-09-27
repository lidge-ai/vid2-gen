import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { packageRoot } from "../shared/index.ts";
import { StageRenderer, renderStageFrame } from "./render.ts";
import { settleTime, springValue } from "./springs.ts";
import { indexTracks, interpolate, nodeAt } from "./tracks.ts";
import type { StageNode, StageSpec } from "./types.ts";

const fps = { num: 30, den: 1 };
const base = { anchorX: 0.5, anchorY: 0.5, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0, z: 0 };
const font = join(packageRoot(), "assets/fonts/Geist-SemiBold.ttf");

void test("spring closed form: starts at 0, overshoots for damping ratio 0.6, settles to 1", () => {
  const p = { stiffness: 100, damping: 12, mass: 1 };
  assert.equal(springValue(0, p), 0);
  const zeta = 0.6;
  const w0 = 10;
  const peakT = Math.PI / (w0 * Math.sqrt(1 - zeta * zeta));
  const expectedOvershoot = Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta));
  assert.ok(Math.abs(springValue(peakT, p) - 1 - expectedOvershoot) < 0.01 * expectedOvershoot + 1e-9);
  assert.ok(Math.abs(springValue(settleTime(p) + 0.05, p) - 1) < 0.003);
});

void test("first spring key holds the base value until release, then moves continuously", () => {
  const keys = [{ frame: 10, value: 500, ease: "spring" as const }];
  assert.equal(interpolate(keys, 0, fps, 100), 100);
  assert.equal(interpolate(keys, 10, fps, 100), 100);
  let prev = 100;
  for (let f = 11; f < 60; f++) {
    const x = interpolate(keys, f, fps, 100) as number;
    assert.ok(Math.abs(x - prev) < 80, `jump at frame ${f}: ${prev} -> ${x}`);
    prev = x;
  }
  assert.ok(Math.abs(prev - 500) < 5);
});

void test("ordinary keys ease between values; colours interpolate", () => {
  const node: StageNode = { key: "r", kind: "rect", x: 0, y: 0, width: 10, height: 10, radius: 0, fill: "#000000", strokeWidth: 0, ...base };
  const index = indexTracks([{ node: "r", prop: "x", keys: [{ frame: 0, value: 0 }, { frame: 10, value: 100, ease: "linear" }] },
    { node: "r", prop: "fill", keys: [{ frame: 0, value: "#000000" }, { frame: 10, value: "#ffffff", ease: "linear" }] }]);
  const mid = nodeAt(node, index, 5, fps);
  assert.equal(mid.x, 50);
  assert.equal(nodeAt(node, index, 10, fps).fill.slice(0, 7), "#ffffff");
});

function crossingSpec(): StageSpec {
  const nodes: StageNode[] = [
    { key: "pill", kind: "rect", x: 80, y: 45, width: 90, height: 30, radius: 15, fill: "#1c1c1e", stroke: "#ffffff33", strokeWidth: 1,
      glow: { color: "#5ac8fa66", blur: 4 }, ...base },
    { key: "dot", kind: "rect", x: 40, y: 20, width: 12, height: 12, radius: 6, fill: "#ff3b30", ...base, strokeWidth: 0 },
    { key: "word", kind: "text", x: 10, y: 45, text: "Stage", font, size: 22, color: "#f5f5f2", letterSpacing: 0, ...base, anchorX: 0 },
  ];
  return { version: 1, width: 160, height: 90, fps, frames: 45, nodes, events: [], tracks: [
    { node: "word", prop: "x", keys: [{ frame: 0, value: 10 }, { frame: 30, value: 110, ease: "inout" }] },
    { node: "dot", prop: "y", keys: [{ frame: 0, value: 20 }, { frame: 20, value: 60, ease: "out" }] },
    { node: "word", prop: "blur", keys: [{ frame: 0, value: 6 }, { frame: 12, value: 0, ease: "out" }] },
    { node: "word", prop: "color", keys: [{ frame: 0, value: "#5ac8fa" }, { frame: 9, value: "#f5f5f2", ease: "linear" }] },
  ] };
}

void test("dirty-rect frames equal full recomposites; a cold seek equals the sequential frame", () => {
  const spec = crossingSpec();
  const fast = new StageRenderer(spec);
  const full = new StageRenderer(spec);
  full.forceFull = true;
  for (let n = 0; n < spec.frames; n++) {
    const a = fast.frame(n);
    const b = full.frame(n);
    assert.ok(Buffer.from(a).equals(Buffer.from(b)), `frame ${n} differs`);
    if (n === 37) assert.ok(Buffer.from(renderStageFrame(spec, 37)).equals(Buffer.from(a)), "cold frame 37 differs");
  }
});

void test("pill, glow and text produce visible coverage at expected places", () => {
  const spec = crossingSpec();
  const f = renderStageFrame(spec, 40);
  const alphaAt = (x: number, y: number) => f[(y * 160 + x) * 4 + 3]!;
  assert.ok(alphaAt(80, 45) > 240, "pill centre opaque");
  assert.equal(alphaAt(2, 2), 0, "corner transparent");
  assert.ok(alphaAt(40, 60) > 200, "dot moved to y=60");
});

function rectSpec(tracks: StageSpec["tracks"], blur = 0): StageSpec {
  return { version: 1, width: 80, height: 60, fps, frames: 6, events: [], tracks, nodes: [
    { key: "r", kind: "rect", x: 40, y: 30, width: 40, height: 30, radius: 6, fill: "#ffffff", stroke: "#ff0000", strokeWidth: 1, ...base, blur }] };
}

void test("animated stroke width redraws: sequential frames equal cold frames", () => {
  const spec = rectSpec([{ node: "r", prop: "strokeWidth", keys: [{ frame: 0, value: 1 }, { frame: 1, value: 6, ease: "linear" }] }]);
  const seq = new StageRenderer(spec);
  for (let n = 0; n < 3; n++) assert.ok(Buffer.from(seq.frame(n)).equals(Buffer.from(renderStageFrame(spec, n))), `frame ${n}`);
});

void test("an image with animated width stays visible and fits each frame's size", () => {
  const data = new Uint8Array(8 * 8 * 4);
  for (let i = 0; i < 64; i++) data.set((i % 8) < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
  const images = new Map([["/img.png", { width: 8, height: 8, data }]]);
  const spec: StageSpec = { version: 1, width: 80, height: 40, fps, frames: 4, events: [], nodes: [
    { key: "i", kind: "image", image: "/img.png", width: 10, height: 20, radius: 0, fit: "contain", x: 40, y: 20, ...base }],
    tracks: [{ node: "i", prop: "width", keys: [{ frame: 0, value: 10 }, { frame: 1, value: 20, ease: "linear" }] }] };
  const seq = new StageRenderer(spec, images);
  for (let n = 0; n < 3; n++) {
    const f = seq.frame(n);
    assert.equal(f[(20 * 80 + 40) * 4 + 3], 255, `centre visible at frame ${n}`);
    assert.ok(Buffer.from(f).equals(Buffer.from(renderStageFrame(spec, n, images))), `frame ${n} sequential = cold`);
  }
  const last = seq.frame(3);
  assert.ok(last[(20 * 80 + 33) * 4]! > 200 && last[(20 * 80 + 47) * 4 + 2]! > 200, "contain keeps the left red and right blue halves");
});

void test("intermediate blur keeps an opaque centre opaque", () => {
  // Big enough that a true Gaussian of these radii leaves the centre fully covered; mixing levels must not lose alpha.
  for (const blur of [2, 3, 5, 6]) {
    const spec: StageSpec = { version: 1, width: 240, height: 200, fps, frames: 1, events: [], tracks: [], nodes: [
      { key: "r", kind: "rect", x: 120, y: 100, width: 180, height: 150, radius: 6, fill: "#ffffff", strokeWidth: 0, ...base, blur }] };
    const f = renderStageFrame(spec, 0);
    assert.equal(f[(100 * 240 + 120) * 4 + 3], 255, `blur ${blur}`);
  }
});

void test("a font replaced at the same path with the same mtime renders the new glyphs", async () => {
  const { copyFileSync, mkdtempSync, statSync, utimesSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = join(mkdtempSync(join(tmpdir(), "vid2-font-")), "f.ttf");
  copyFileSync(join(packageRoot(), "assets/fonts/Geist-Regular.ttf"), path);
  const spec: StageSpec = { version: 1, width: 120, height: 40, fps, frames: 1, events: [], tracks: [], nodes: [
    { key: "t", kind: "text", text: "Wide", font: path, size: 30, color: "#ffffff", letterSpacing: 0, x: 60, y: 20, ...base }] };
  const before = Buffer.from(renderStageFrame(spec, 0));
  const mtime = statSync(path).mtime;
  copyFileSync(join(packageRoot(), "assets/fonts/InstrumentSerif-Regular.ttf"), path);
  utimesSync(path, mtime, mtime);
  assert.ok(!before.equals(Buffer.from(renderStageFrame(spec, 0))));
});
