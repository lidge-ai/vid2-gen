import { test } from "node:test";
import assert from "node:assert/strict";
import { Vid2Error } from "../shared/index.ts";
import { resolveTimeline, TimelineSchema } from "../timeline/index.ts";
import { createCaptureResolver } from "./resolver.ts";
import type { CaptureAction, LoadedSession } from "./session.ts";

function session(fps: string, actions: Partial<CaptureAction>[]): LoadedSession {
  const [num, den] = fps.split("/").map(Number);
  return { dir: "/cap", footagePath: "/cap/footage.mp4", fps: { num: num!, den: den ?? 1 },
    meta: { version: 1, surface: "web", fps, width: 100, height: 100, scale: 1, t0: { epochMs: 0, monoNs: "0" }, footage: "footage.mp4",
      frames: null, actions: "actions.jsonl", cursorHidden: true, recordedText: false, tool: { vid2: "0", ffmpeg: "8" }, platform: "test",
      createdAt: "now", warnings: [] },
    actions: actions.map((a, i) => ({ id: `a${i}`, seq: i, kind: "click", tMs: 0, frame: 0, source: "agent", ...a })) };
}

function timeline(extra: Record<string, unknown>) {
  return TimelineSchema.parse({ version: 1, output: { fps: 30 }, sources: { a: { type: "capture", session: "a.vid2cap" },
    b: { type: "capture", session: "b.vid2cap" } }, ...extra });
}

const isInput = (e: unknown) => e instanceof Vid2Error && e.code === "E_INPUT";

test("footage events at 60 fps map through placement, in-point and speed onto a 30 fps timeline", () => {
  const events = createCaptureResolver({ a: session("60", [{ label: "open", frame: 120 }, { label: "save", frame: 360 }]) });
  const t = TimelineSchema.parse({ version: 1, output: { fps: 30 }, sources: { a: { type: "capture", session: "a.vid2cap" } },
    scenes: [{ id: "intro", duration: "1s" },
      { id: "demo", duration: "10s", layers: [{ type: "media", source: "a", start: "0.5s", in: { event: "open" }, speed: 2 }] }],
    audio: { cues: [{ at: { event: "save" }, sfx: "click" }] } });
  const r = resolveTimeline(t, { baseDir: "/", events });
  const layer = r.scenes[1]!.layers[0]!;
  assert.equal(layer.type === "media" ? layer.inSeconds : -1, 2);
  // demo starts at 30, layer at 45; save is footage 6 s → (6 - 2) / 2 = 2 s after the layer start → 45 + 60.
  assert.equal(r.audio!.cues[0]!.frame, 105);
});

test("two sources need explicit refs; a reused source keeps its first placement", () => {
  const events = createCaptureResolver({ a: session("30", [{ label: "go", frame: 30 }]), b: session("30", [{ label: "go", frame: 60 }]) });
  const scenes = [{ id: "one", duration: "5s", layers: [{ type: "media", source: "a" }, { type: "media", source: "b", start: "1s" }] },
    { id: "two", duration: "5s", layers: [{ type: "media", source: "a", start: "2s" }] }];
  const r = resolveTimeline(timeline({ scenes, audio: { cues: [{ at: { event: "go", source: "a" }, sfx: "x" }, { at: { event: "go", source: "b" }, sfx: "y" }] } }),
    { baseDir: "/", events });
  assert.deepEqual(r.audio!.cues.map((c) => c.frame), [30, 90]);
  assert.throws(() => resolveTimeline(timeline({ scenes, audio: { cues: [{ at: { event: "go" }, sfx: "x" }] } }), { baseDir: "/", events }), isInput);
});

test("a capture layer cannot seek with another source's event", () => {
  const events = createCaptureResolver({ a: session("30", [{ label: "go", frame: 30 }]), b: session("30", [{ label: "go", frame: 60 }]) });
  const scenes = [{ id: "one", duration: "5s", layers: [{ type: "media", source: "a", in: { event: "go", source: "b" } }] }];
  assert.throws(() => resolveTimeline(timeline({ scenes }), { baseDir: "/", events }), isInput);
});

test("unknown events, kind#k lookup and unplaced sources", () => {
  const s = session("30", [{ kind: "goto", frame: 3 }, { kind: "click", frame: 9, label: "buy" }, { kind: "click", frame: 15 }]);
  const events = createCaptureResolver({ a: s });
  assert.equal(events.footageSeconds({ event: "click#2" }).seconds, 0.5);
  assert.equal(events.footageSeconds({ event: "buy" }).seconds, 0.3);
  assert.throws(() => events.footageSeconds({ event: "nope" }), isInput);
  assert.throws(() => events.resolve({ event: "buy" }), isInput);
  events.place("a", { startFrame: 10, inSeconds: 0, speed: 1, fps: { num: 30, den: 1 } });
  events.place("a", { startFrame: 99, inSeconds: 0, speed: 1, fps: { num: 30, den: 1 } });
  assert.equal(events.resolve({ event: "buy" }).frame, 19);
});
