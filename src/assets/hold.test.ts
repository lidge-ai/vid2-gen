import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTimeline, TimelineSchema } from "../timeline/index.ts";
import { holdWarnings } from "./hold.ts";

function timeline(duration: string, layer: Record<string, unknown> = { type: "media", source: "clip" },
  extra: Record<string, unknown> = {}) {
  const authored = TimelineSchema.parse({ version: 1, output: { width: 160, height: 90, fps: 30 },
    sources: { clip: { type: "video", path: "clip.mp4" } },
    scenes: [{ id: "scene", duration, layers: [layer], ...extra }] });
  return resolveTimeline(authored, { baseDir: "/tmp" });
}

const generated = { clip: { durationS: 5 } };

void test("generated clip holds for two seconds on a seven-second media layer", () => {
  assert.deepEqual(holdWarnings(timeline("7s"), generated), [
    "W_GENERATED_CLIP_HOLD clip scene held 2.00s (60 frames): clip 5.00s, read 7.00s from 0.00s",
  ]);
});

void test("short media layer has no hold warning", () => {
  assert.deepEqual(holdWarnings(timeline("4s"), generated), []);
});

void test("in point leaves one second available during a two-second read", () => {
  assert.deepEqual(holdWarnings(timeline("2s", { type: "media", source: "clip", in: "4s" }), generated), [
    "W_GENERATED_CLIP_HOLD clip scene held 1.00s (30 frames): clip 5.00s, read 2.00s from 4.00s",
  ]);
});

void test("speed converts the missing footage to output seconds", () => {
  assert.deepEqual(holdWarnings(timeline("4s", { type: "media", source: "clip", speed: 2 }), generated), [
    "W_GENERATED_CLIP_HOLD clip scene held 1.50s (45 frames): clip 5.00s, read 8.00s from 0.00s",
  ]);
});

void test("an intentional out trim shorter than available footage does not warn", () => {
  assert.deepEqual(holdWarnings(timeline("7s", { type: "media", source: "clip", out: "4s" }), generated), []);
});

void test("probe rounding shorter than one output frame does not warn", () => {
  assert.deepEqual(holdWarnings(timeline("5s"), { clip: { durationS: 5.005 } }), []);
});

void test("generated scene background reads the whole scene and duplicate warnings collapse", () => {
  const t = timeline("7s", { type: "media", source: "clip" }, { background: "clip" });
  assert.deepEqual(holdWarnings(t, generated), [
    "W_GENERATED_CLIP_HOLD clip scene held 2.00s (60 frames): clip 5.00s, read 7.00s from 0.00s",
  ]);
});

void test("root overlays identify their scene as overlays", () => {
  const authored = TimelineSchema.parse({ version: 1, output: { width: 160, height: 90, fps: 30 },
    sources: { clip: { type: "video", path: "clip.mp4" } },
    scenes: [{ id: "scene", duration: "7s" }], overlays: [{ type: "overlay", source: "clip" }] });
  const t = resolveTimeline(authored, { baseDir: "/tmp" });
  assert.deepEqual(holdWarnings(t, generated), [
    "W_GENERATED_CLIP_HOLD clip overlays held 2.00s (60 frames): clip 5.00s, read 7.00s from 0.00s",
  ]);
});
