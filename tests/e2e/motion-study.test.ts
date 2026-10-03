import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { compileSegment } from "../../src/compile/index.ts";
import type { StageRender } from "../../src/compile/index.ts";
import type { StageProp, StageSpec } from "../../src/stage/types.ts";
import { TimelineSchema, resolveTimeline, validateTimeline } from "../../src/timeline/index.ts";
import { tempDir } from "../helpers.ts";

const source = resolve(import.meta.dirname, "../../examples/motion-study");

function study() {
  const timeline = TimelineSchema.parse(JSON.parse(readFileSync(join(source, "timeline.json"), "utf8")));
  assert.deepEqual(validateTimeline(timeline, { baseDir: source }), []);
  return resolveTimeline(timeline, { baseDir: source });
}

function compileScene(index: number): StageSpec {
  const timeline = study();
  const scene = timeline.scenes[index]!;
  const workDir = tempDir("vid2-motion-study-");
  const stages = new Map<string, StageRender>();
  compileSegment(scene, { width: timeline.width, height: timeline.height, scale: 1,
    oversample: 1, profile: "final", fps: timeline.fps, background: timeline.output.background,
    sources: timeline.sources, fonts: timeline.fonts, workDir, pngDir: join(workDir, "png"),
    textBackend: "raster", stages }, index === timeline.scenes.length - 1);
  assert.equal(stages.size, 1);
  return [...stages.values()][0]!.spec;
}

function keys(spec: StageSpec, node: string, prop: StageProp) {
  const track = spec.tracks.find((item) => item.node === node && item.prop === prop);
  assert.ok(track, `${node}.${prop} exists`);
  return track.keys;
}

void test("motion-study validates as an offline silent 330-frame film with three scenes", () => {
  const timeline = study();
  assert.deepEqual([timeline.width, timeline.height, timeline.fps.num, timeline.fps.den], [960, 540, 30, 1]);
  assert.equal(timeline.totalFrames, 330);
  assert.deepEqual(timeline.scenes.map((scene) => [scene.startFrame, scene.frames]), [[0, 90], [90, 90], [180, 150]]);
  assert.deepEqual(timeline.scenes.flatMap((scene) => scene.layers.map((layer) => layer.type)), ["field", "bars", "kinetic"]);
  assert.ok(timeline.scenes.every((scene) => !scene.transitionOut || scene.transitionOut.frames === 0));
  assert.deepEqual(timeline.sources, {});
  assert.equal(timeline.audio, undefined);
  assert.equal(timeline.output.background, "#14242E");
});

void test("motion-study types at cumulative 45ms intervals and reserves its reading hold", () => {
  const spec = compileScene(0);
  // Hand-calculated round((0.5 + i * 0.045) * 30), including the space.
  const expected = [15, 16, 18, 19, 20, 22, 23, 24, 26];
  assert.deepEqual(expected.map((_, i) => keys(spec, `fld:g${i}`, "opacity")[0]!.frame), expected);
  assert.equal(spec.nodes.filter((node) => node.kind === "text").map((node) => node.text).join(""), "make room");
  assert.equal(keys(spec, "fld:g8", "color").at(-1)!.frame, 35);
  assert.equal(spec.nodes.some((node) => node.key === "fld:caret"), false);
});

void test("motion-study staggers rows without accumulating rounded-period drift", () => {
  const spec = compileScene(1);
  const tracks = [0, 1, 2].map((i) => keys(spec, `bar:${i}`, "width"));
  assert.deepEqual(tracks.map((track) => track.map((key) => key.frame + 90)), [[99, 114], [103, 118], [108, 123]]);
  assert.deepEqual(tracks.map((track) => track.at(-1)!.value), [207, 299, 391]);
  assert.deepEqual([0, 1, 2].map((i) => spec.nodes.find((node) => node.key === `bar:${i}`)!.y), [202, 270, 338]);
});

void test("motion-study retains Room through reflow while the other words leave", () => {
  const spec = compileScene(2);
  assert.equal(spec.nodes.filter((node) => node.kind === "text" && node.text === "Room").length, 1);
  const movement = keys(spec, "kin:room", "y");
  assert.deepEqual(movement.map((key) => [key.frame + 180, key.value]), [[180, 216], [258, 270]]);
  assert.equal(movement[1]!.ease, "spring");
  assert.deepEqual(spec.events.filter((event) => event.kind === "token").map((event) => event.frame + 180), [189, 193, 197]);
  assert.equal(keys(spec, "kin:think:t", "opacity").at(-1)!.frame + 180, 208);
  for (const word of ["to", "think"]) {
    assert.deepEqual(keys(spec, `kin:${word}`, "opacity").map((key) => [key.frame + 180, key.value]), [[258, 1], [264, 0]]);
  }
  assert.equal(spec.tracks.some((track) => track.node === "kin:room" && track.prop === "opacity"), false);
});
