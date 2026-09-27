import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTimeline, TimelineSchema } from "../timeline/index.ts";
import { decorateCaptureLayers } from "./decorate.ts";
import { createCaptureResolver } from "./resolver.ts";
import type { LoadedSession } from "./session.ts";

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
