import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { TimelineSchema, resolveTimeline } from "../../timeline/index.ts";
import type { StageProp, StageSpec } from "../../stage/types.ts";
import { GraphBuilder } from "../graph.ts";
import type { BuildContext } from "../ir.ts";
import { buildComponentLayer } from "./components.ts";
import { buildKineticLayer } from "./kinetic.ts";

const workDir = mkdtempSync(join(tmpdir(), "vid2-component-timing-"));
const words = ["one", "two", "three", "four"];
type Clock = { fps: number | string; rate: number };

function compile(layer: Record<string, unknown>, clock: Clock): StageSpec {
  const timeline = TimelineSchema.parse({ version: 1, output: { fps: clock.fps },
    beat: { bpm: 120, meter: 3, offset: "1s" },
    scenes: [{ id: "timing", duration: "4s", layers: [layer] }] });
  const resolved = resolveTimeline(timeline, { baseDir: process.cwd() });
  const scene = resolved.scenes[0]!;
  const ctx: BuildContext = { graph: new GraphBuilder(), inputs: { add: () => "0:v", list: () => [] },
    width: 1920, height: 1080, scale: 1, fps: resolved.fps, rate: clock.rate,
    frames: scene.frames, renderFrames: scene.frames, background: "#000000", oversample: 1,
    profile: "final", sceneId: scene.id, sources: resolved.sources, fonts: resolved.fonts,
    workDir, pngDir: join(workDir, "png"), textBackend: "ass", beat: resolved.beat!, stages: new Map() };
  const item = scene.layers[0]!;
  if (item.type === "kinetic") buildKineticLayer(item, ctx);
  else if (item.type === "field" || item.type === "bars" || item.type === "ticker" || item.type === "chips") buildComponentLayer(item, ctx);
  else assert.fail("fixture must be a component or kinetic layer");
  assert.equal(ctx.stages!.size, 1);
  return [...ctx.stages!.values()][0]!.spec;
}

function frames(spec: StageSpec, node: string, prop: StageProp): number[] {
  const track = spec.tracks.find((t) => t.node === node && t.prop === prop);
  assert.ok(track, `${node}.${prop} exists`);
  return track.keys.map((key) => key.frame);
}

// Hand-derived clocks: round((quantized anchor + i * period) * stage fps).
// 45ms × 9 = 405ms; 110ms × [0,1,2,3] = [0,110,220,330]ms.
const clocks = [
  { fps: 30, rate: 1, glyph: 12, anchor: 1, stagger: [1, 4, 8, 11], highlight: [3, 6, 10, 13] },
  { fps: 60, rate: 1, glyph: 24, anchor: 3, stagger: [3, 10, 16, 23], highlight: [9, 16, 22, 29] },
  { fps: "30000/1001", rate: 1, glyph: 12, anchor: 1, stagger: [1, 4, 8, 11], highlight: [3, 6, 10, 13] },
  { fps: 30, rate: 4, glyph: 49, anchor: 4, stagger: [4, 17, 30, 44], highlight: [12, 25, 38, 52] },
];

for (const clock of clocks) {
  const name = `${clock.fps}fps × ${clock.rate}`;
  void test(`field keeps 45ms periods until the final ${name} clock`, () => {
    const spec = compile({ type: "field", typing: [{ at: 0, text: "0123456789", glyph: "45ms" }] }, clock);
    assert.deepEqual(frames(spec, "fld:g9", "opacity"), [clock.glyph, clock.glyph]);
    assert.equal(spec.events.filter((e) => e.kind === "glyph").at(-1)!.frame, clock.glyph);
  });

  void test(`bars preserve 110ms stagger and quantized delay/grow at ${name}`, () => {
    const spec = compile({ type: "bars", delay: "45ms", grow: "45ms", stagger: "110ms",
      items: words.map((label, i) => ({ label, value: 10, highlight: i === 3 })) }, clock);
    assert.deepEqual(words.map((_, i) => frames(spec, `bar:${i}`, "width")[0]), clock.stagger);
    for (const [i, start] of clock.stagger.entries()) {
      assert.equal(frames(spec, `bar:${i}`, "width")[1], start + clock.anchor);
      const value = spec.nodes.find((node) => node.key === `bar:${i}:value`);
      assert.ok(value?.kind === "text" && value.counter);
      assert.equal(value.counter.start, start);
    }
    assert.equal(spec.events.find((e) => e.kind === "grow")!.frame, clock.stagger[3]! + clock.anchor);
  });

  void test(`ticker preserves 110ms intervals and quantized delay at ${name}`, () => {
    const spec = compile({ type: "ticker", delay: "45ms", interval: "110ms", items: words.map((text) => ({ text })) }, clock);
    assert.deepEqual(spec.events.map((e) => e.frame), clock.stagger.slice(1));
    assert.deepEqual(frames(spec, "tick:0", "y"), [0, ...clock.stagger.slice(1)]);
    assert.equal(frames(spec, "tick:0", "opacity")[0], clock.anchor);
  });

  void test(`kinetic preserves 110ms word stagger and state anchor at ${name}`, () => {
    const spec = compile({ type: "kinetic", enter: { style: "fade", stagger: "110ms", duration: "45ms" },
      states: [{ at: "45ms", text: words.join(" ") }] }, clock);
    assert.deepEqual(spec.events.filter((e) => e.kind === "token").map((e) => e.frame), clock.stagger);
    for (const [i, word] of words.entries()) {
      assert.deepEqual(frames(spec, `kin:${word}#0:t`, "opacity"), [clock.stagger[i], clock.stagger[i]! + clock.anchor]);
    }
  });

  void test(`kinetic preserves 110ms highlight sweep and quantized durations at ${name}`, () => {
    const spec = compile({ type: "kinetic", enter: { stagger: 0, duration: "45ms" },
      highlight: { delay: "45ms", sweep: "110ms" }, states: [{ at: "45ms", text: words.join(" ") }] }, clock);
    assert.deepEqual(words.map((word) => frames(spec, `kin:${word}#0:t`, "color")[1]), clock.highlight);
  });
}

for (const [glyph, expected] of [
  [0, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
  ["5ms", [1, 1, 1, 1, 2, 2, 2, 2, 2, 2]],
] as const) {
  void test(`field ${glyph} glyph period is honored without a default fallback`, () => {
    const spec = compile({ type: "field", typing: [{ at: "45ms", text: "0123456789", glyph }] }, { fps: 30, rate: 1 });
    assert.deepEqual([...Array(10).keys()].map((i) => frames(spec, `fld:g${i}`, "opacity")[0]), expected);
    assert.deepEqual(spec.events.map((e) => e.frame), [expected[0], expected[3], expected[6], expected[9]]);
  });
}

void test("omitted field glyph period retains the authored schema default of 45ms", () => {
  const spec = compile({ type: "field", typing: [{ at: 0, text: "0123456789" }] }, { fps: 30, rate: 1 });
  assert.deepEqual(frames(spec, "fld:g9", "opacity"), [12, 12]);
});

void test("beat and bar periods ignore beat offset and accumulate on a rational stage clock", () => {
  const clock = { fps: "30000/1001", rate: 4 };
  // 120 BPM: .09b = 45ms; .22b = 110ms; .03bar at meter 3 = 45ms.
  const field = compile({ type: "field", typing: [{ at: 0, text: "0123456789", glyph: "0.09b" }] }, clock);
  assert.deepEqual(frames(field, "fld:g9", "opacity"), [49, 49]);
  const bars = compile({ type: "bars", stagger: "0.22b", items: words.map((label) => ({ label, value: 1 })) }, clock);
  assert.deepEqual(words.map((_, i) => frames(bars, `bar:${i}`, "width")[0]), [0, 13, 26, 40]);
  const ticker = compile({ type: "ticker", interval: "0.22b", items: words.map((text) => ({ text })) }, clock);
  assert.deepEqual(ticker.events.map((e) => e.frame), [13, 26, 40]);
  const kinetic = compile({ type: "kinetic", enter: { style: "type", stagger: "0.22b", glyphStagger: "0.03bar", duration: 0 },
    states: [{ at: 0, text: "ABCDEFGHIJ next" }] }, clock);
  assert.deepEqual(frames(kinetic, "kin:abcdefghij#0:g9", "opacity"), [49, 49]);
  assert.deepEqual(frames(kinetic, "kin:next#0:g0", "opacity"), [13, 13]);
  const highlight = compile({ type: "kinetic", enter: { stagger: 0, duration: 0 }, highlight: { sweep: "0.22b", delay: 0 },
    states: [{ at: 0, text: words.join(" ") }] }, clock);
  assert.deepEqual(words.map((word) => frames(highlight, `kin:${word}#0:t`, "color")[1]), [0, 13, 26, 40]);
});
