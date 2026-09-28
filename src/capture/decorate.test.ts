import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTimeline, TimelineSchema } from "../timeline/index.ts";
import { decorateCaptureLayers } from "./decorate.ts";
import { createCaptureResolver } from "./resolver.ts";
import type { LoadedSession } from "./session.ts";
import { planCamera } from "./camera.ts";
import { perspectiveFilters } from "../compile/motion.ts";
import { GraphBuilder } from "../compile/graph.ts";
import type { BuildContext, LayerOf } from "../compile/ir.ts";
import { Vid2Error } from "../shared/errors.ts";

const session: LoadedSession = { dir: "/cap", footagePath: "/cap/footage.mp4", fps: { num: 30, den: 1 },
  meta: { version: 1, surface: "web", fps: "30", width: 1280, height: 720, scale: 1, t0: { epochMs: 0, monoNs: "0" }, footage: "footage.mp4",
    frames: null, actions: "actions.jsonl", cursorHidden: true, recordedText: false, tool: { vid2: "0", ffmpeg: "8" }, platform: "test",
    createdAt: "now", warnings: [] },
  actions: [
    { id: "a", seq: 0, kind: "click", tMs: 1000, frame: 30, source: "agent", label: "inside", point: { x: 100, y: 100 } },
    { id: "b", seq: 1, kind: "type", tMs: 1500, endMs: 2000, frame: 45, source: "agent", chars: 5 },
    { id: "c", seq: 2, kind: "click", tMs: 9000, frame: 270, source: "agent", label: "after-layer-end", point: { x: 5, y: 5 } },
  ] };

test("capture events inside the visible span reach the timeline clock; later ones are dropped", () => {
  const t = TimelineSchema.parse({ version: 1, output: { width: 1280, height: 720, fps: 30 },
    sources: { app: { type: "capture", session: "x.vid2cap" } },
    scenes: [{ id: "intro", duration: "1s" }, { id: "demo", duration: "3s", layers: [{ type: "media", source: "app", start: "0.5s", in: "0.5s" }] }] });
  const events = createCaptureResolver({ app: session });
  const r = decorateCaptureLayers(resolveTimeline(t, { baseDir: "/", events }), { app: session });
  // demo starts at 30, layer at 45; click at footage 1.0 s with in 0.5 s → 15 frames after the layer start.
  assert.deepEqual(r.captureEvents?.map((e) => [e.label ?? e.kind, e.frame, e.endFrame ?? null]), [["inside", 60, null], ["type", 75, 90]]);
});

function autoTimeline(actions: LoadedSession["actions"], hold?: string, beat?: { bpm: number; meter: number }) {
  const capture = { ...session, actions };
  const authored = TimelineSchema.parse({ version: 1, output: { width: 1280, height: 720, fps: 30 },
    ...(beat ? { beat } : {}), sources: { app: { type: "capture", session: "x.vid2cap" } },
    scenes: [{ id: "demo", duration: "16s", layers: [{ type: "media", source: "app", camera: { auto: "events", ...(hold ? { hold } : {}) } }] }] });
  const resolved = resolveTimeline(authored, { baseDir: "/", events: createCaptureResolver({ app: capture }) });
  return decorateCaptureLayers(resolved, { app: capture });
}

test("default authored hold is 0.8 seconds for both focus and merging", () => {
  const actions: LoadedSession["actions"] = [
    { id: "a", seq: 0, kind: "click", tMs: 1000, frame: 30, source: "agent", point: { x: 100, y: 100 } },
    { id: "b", seq: 1, kind: "click", tMs: 1767, frame: 53, source: "agent", point: { x: 1100, y: 620 } },
  ];
  const keys = (autoTimeline(actions).scenes[0]!.layers[0]! as LayerOf<"media">).camera;
  const expected = planCamera(actions.map((a) => ({ frame: a.frame, point: a.point! })),
    { fps: { num: 30, den: 1 }, startFrame: 0, frames: 480, width: 1280, height: 720, zoom: 1.6, hold: 0.8, merge: 0.8 });
  assert.deepEqual(keys, expected);
  const oldTiming = planCamera(actions.map((a) => ({ frame: a.frame, point: a.point! })),
    { fps: { num: 30, den: 1 }, startFrame: 0, frames: 480, width: 1280, height: 720, zoom: 1.6, hold: 0.5, merge: 0.7 });
  assert.notDeepEqual(keys, oldTiming);
});

test("beat hold uses the resolved beat grid: 2b at 120 BPM is 1 second", () => {
  const actions: LoadedSession["actions"] = [{ id: "a", seq: 0, kind: "click", tMs: 1000, frame: 30,
    source: "agent", point: { x: 100, y: 100 } }];
  const keys = (autoTimeline(actions, "2b", { bpm: 120, meter: 4 }).scenes[0]!.layers[0]! as LayerOf<"media">).camera;
  assert.deepEqual(keys, planCamera([{ frame: 30, point: { x: 100, y: 100 } }],
    { fps: { num: 30, den: 1 }, startFrame: 0, frames: 480, width: 1280, height: 720, zoom: 1.6, hold: 1, merge: 1 }));
});

test("frame and bar holds convert to seconds before planning", () => {
  const actions: LoadedSession["actions"] = [{ id: "a", seq: 0, kind: "click", tMs: 1000, frame: 30,
    source: "agent", point: { x: 100, y: 100 } }];
  for (const [hold, seconds] of [["24f", 0.8], ["1bar", 2]] as const) {
    const keys = (autoTimeline(actions, hold, { bpm: 120, meter: 4 }).scenes[0]!.layers[0]! as LayerOf<"media">).camera;
    assert.deepEqual(keys, planCamera([{ frame: 30, point: { x: 100, y: 100 } }],
      { fps: { num: 30, den: 1 }, startFrame: 0, frames: 480, width: 1280, height: 720,
        zoom: 1.6, hold: seconds, merge: seconds }));
  }
});

test("200 type events compile to at most 24 keys and a bounded perspective expression", () => {
  const actions: LoadedSession["actions"] = Array.from({ length: 200 }, (_, i) => ({ id: `a${i}`, seq: i,
    kind: "type", tMs: 1000 + i * 50, frame: 30 + Math.round(i * 1.5), source: "agent" as const,
    bbox: { x: 500 + i % 3, y: 300, width: 220, height: 40 }, chars: 1 }));
  const timeline = autoTimeline(actions);
  const layer = timeline.scenes[0]!.layers[0]! as LayerOf<"media">;
  assert.ok(Array.isArray(layer.camera) && layer.camera.length <= 24);
  const ctx = { graph: new GraphBuilder(), fps: timeline.fps, rate: 1, oversample: 2, background: "#000000" } as BuildContext;
  assert.ok(perspectiveFilters(layer, ctx, timeline.width, timeline.height).perspective.length <= 100_000);
});

test("30 separate corner clicks report the authored camera path", () => {
  const actions: LoadedSession["actions"] = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, seq: i,
    kind: "click", tMs: 500 + i * 1000, frame: 15 + i * 30, source: "agent" as const,
    point: { x: i % 2 ? 1200 : 80, y: i % 2 ? 620 : 80 } }));
  const capture = { ...session, actions };
  const authored = TimelineSchema.parse({ version: 1, output: { width: 1280, height: 720, fps: 30 },
    sources: { app: { type: "capture", session: "x.vid2cap" } }, scenes: [
      { id: "intro", duration: "1s" }, { id: "demo", duration: "32s", layers: [
        { type: "media", source: "app" }, { type: "media", source: "app", camera: { auto: "events", hold: "0s" } }] },
    ] });
  const resolved = resolveTimeline(authored, { baseDir: "/", events: createCaptureResolver({ app: capture }) });
  assert.throws(() => decorateCaptureLayers(resolved, { app: capture }), (error: unknown) => {
    assert.ok(error instanceof Vid2Error);
    assert.equal(error.code, "E_INPUT");
    assert.equal(error.details?.path, "scenes.1.layers.1.camera");
    return true;
  });
});
