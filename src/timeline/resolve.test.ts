import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Vid2Error } from "../shared/errors.ts";
import { TimelineSchema } from "./schema.ts";
import { resolveTimeline } from "./resolve.ts";

const baseDir = fileURLToPath(new URL("../../tests/fixtures/timelines/", import.meta.url));
function fixture(name: string) {
  return TimelineSchema.parse(JSON.parse(readFileSync(fileURLToPath(new URL(`../../tests/fixtures/timelines/${name}.json`, import.meta.url)), "utf8")));
}

test("fades overlap scenes on the integer-frame clock", () => {
  const fade = { type: "fade", duration: "0.5s" };
  const t = TimelineSchema.parse({ version: 1, scenes: [
    { id: "one", duration: "2s", transition: fade }, { id: "two", duration: "2s", transition: fade }, { id: "three", duration: "2s" },
  ] });
  const r = resolveTimeline(t, { baseDir });
  assert.deepEqual(r.scenes.map(s => s.startFrame), [0, 45, 90]);
  assert.equal(r.totalFrames, 150);
  assert.equal(r.scenes[1]?.transitionIn?.frames, 15);
});

test("cuts do not overlap", () => {
  const cut = { type: "cut" };
  const t = TimelineSchema.parse({ version: 1, scenes: [
    { id: "one", duration: "2s", transition: cut }, { id: "two", duration: "2s", transition: cut }, { id: "three", duration: "2s" },
  ] });
  assert.deepEqual(resolveTimeline(t, { baseDir }).scenes.map(s => s.startFrame), [0, 60, 120]);
});

test("frame-only scenes and transitions keep their integer-frame placement", () => {
  const t = TimelineSchema.parse({ version: 1, scenes: [
    { id: "one", duration: "10f", transition: { type: "fade", duration: "2f" } },
    { id: "two", duration: "7f", transition: { type: "cut", duration: "3f" } },
    { id: "three", duration: "11f" },
  ] });
  const r = resolveTimeline(t, { baseDir });
  assert.deepEqual(r.scenes.map(s => [s.startFrame, s.frames, s.transitionOut?.frames ?? 0]), [[0, 10, 2], [8, 7, 0], [15, 11, 0]]);
  assert.equal(r.totalFrames, 26);
});

test("64 quarter-bar scenes at rational fps stay within half a frame of the exact grid", () => {
  const t = TimelineSchema.parse({ version: 1, output: { fps: "30000/1001" }, beat: { bpm: 132, meter: 4 },
    scenes: Array.from({ length: 64 }, (_, i) => ({ id: `bar-${i}`, duration: "0.25bar" })) });
  const r = resolveTimeline(t, { baseDir });
  for (const [i, scene] of r.scenes.entries()) {
    const exactFrame = i * 60 / 132 * 30000 / 1001;
    assert.ok(Math.abs(scene.startFrame - exactFrame) <= 0.5, `scene ${i}: ${scene.startFrame} vs ${exactFrame}`);
  }
});

test("beat and bar positions add the grid offset once, while durations and signed offsets do not", () => {
  const t = TimelineSchema.parse({ version: 1, beat: { bpm: 120, offset: "8f", meter: 4 },
    markers: { next: "1bar" }, scenes: [{ id: "one", duration: "1bar" }], audio: { cues: [
      { at: "2b", sfx: "preset:click" }, { at: "1bar", sfx: "preset:click" },
      { at: { marker: "next", offset: "1bar" }, sfx: "preset:click" },
      { at: { bar: 2, beat: 1 }, sfx: "preset:click" },
    ] } });
  const r = resolveTimeline(t, { baseDir });
  assert.equal(r.scenes[0]?.frames, 60);
  assert.equal(r.markers.next?.frame, 68);
  assert.deepEqual(r.audio?.cues.map(c => c.frame), [38, 68, 128, 68]);
});

test("bar and marker references include signed offsets", () => {
  const r = resolveTimeline(fixture("markers"), { baseDir });
  assert.equal(r.markers.bar3?.frame, 120);
  assert.equal(r.audio?.cues[0]?.frame, 105);
  assert.equal(r.audio?.cues[0]?.seconds, 3.5);
});

test("event references use the adapter's timeline frame and clamp negative offsets", () => {
  const t = TimelineSchema.parse({ version: 1, scenes: [{ id: "one", duration: "2s" }],
    audio: { cues: [{ at: { event: "click", offset: "-0.5s" }, sfx: "hit" },
      { at: { event: "click", offset: "-1s" }, sfx: "hit" }] } });
  const events = { resolve: (ref: { event: string; source?: string }) => ({ frame: ref.event === "click" ? 12 : 0, sourceId: "cap" }),
    footageSeconds: () => ({ seconds: 0, sourceId: "cap" }), place: () => undefined };
  assert.deepEqual(resolveTimeline(t, { baseDir, events }).audio?.cues.map(c => c.frame), [0, 0]);
  assert.throws(() => resolveTimeline(t, { baseDir }), (e: unknown) => e instanceof Vid2Error && e.code === "E_INPUT");
});

test("relative source and font paths resolve against timeline directory", () => {
  const t = TimelineSchema.parse({ version: 1, sources: { still: { type: "image", path: "media/still.png" } },
    fonts: { display: { path: "fonts/display.otf" } }, scenes: [{ id: "one", duration: "1s", layers: [{ type: "media", source: "still" }] }] });
  const r = resolveTimeline(t, { baseDir });
  assert.equal(r.sources.still && "path" in r.sources.still ? r.sources.still.path : "", join(baseDir, "media", "still.png"));
  assert.equal(r.fonts.display?.path, join(baseDir, "fonts", "display.otf"));
  assert.equal(r.scenes[0]?.layers[0]?.absoluteEndFrame, 30);
});

test("rational fps and clamped layer spans retain absolute timing", () => {
  const t = TimelineSchema.parse({ version: 1, output: { fps: "30000/1001" }, scenes: [
    { id: "one", duration: "1s", layers: [{ type: "text", text: "End", start: "0.5s", end: "2s" }] },
  ] });
  const r = resolveTimeline(t, { baseDir });
  assert.deepEqual(r.fps, { num: 30000, den: 1001 });
  assert.equal(r.totalFrames, 30);
  assert.equal(r.scenes[0]?.layers[0]?.startFrame, 15);
  assert.equal(r.scenes[0]?.layers[0]?.endFrame, 30);
  assert.equal(r.scenes[0]?.layers[0]?.absoluteStartFrame, 15);
});

test("voices resolve by kind and beats.json offset seconds convert at the timeline fps", () => {
  const dir = mkdtempSync(join(tmpdir(), "vid2-beats-"));
  writeFileSync(join(dir, "beats.json"), JSON.stringify({ version: 1, bpm: 120, offset: 0.25, meter: 4 }));
  const t = TimelineSchema.parse({ version: 1, output: { fps: 30 }, beat: { map: "beats.json" }, sources: { vo: { type: "audio", path: "vo.wav" } },
    scenes: [{ id: "one", duration: "4s" }],
    audio: { cues: [{ at: "2b", sfx: "preset:click", anchor: "start" }], voice: [{ source: "vo", at: 0 }, { tts: { text: "Hi" }, at: "1s" }] } });
  const r = resolveTimeline(t, { baseDir: dir });
  assert.equal(r.audio!.cues[0]!.frame, 38);
  assert.equal(r.audio!.cues[0]!.anchor, "start");
  assert.deepEqual(r.audio!.voice.map((v) => v.kind), ["file", "tts"]);
  assert.equal(r.audio!.voice[1]!.frame, 30);
});


test("qa.waive parses, rejects unknown keys and resolves to frames", () => {
  const t = TimelineSchema.parse({ version: 1, output: { fps: 30 }, scenes: [{ id: "one", duration: "5s" }],
    qa: { waive: [{ check: "black", from: "0s", to: "0.5s", reason: "intentional fade from black" }] } });
  const r = resolveTimeline(t, { baseDir: "/" });
  assert.deepEqual(r.qa.waivers, [{ check: "black", fromFrame: 0, toFrame: 15, fromS: 0, toS: 0.5, reason: "intentional fade from black" }]);
  assert.equal(TimelineSchema.safeParse({ version: 1, scenes: [{ id: "one", duration: 1 }], qa: { waive: [], typo: 1 } }).success, false);
  assert.equal(TimelineSchema.safeParse({ version: 1, scenes: [{ id: "one", duration: 1 }], qa: { waive: [{ check: "vibes", from: 0, to: 1, reason: "xyz" }] } }).success, false);
});

test("root HUD resolves absolute key/item frames and leaves media overlays separate", () => {
  const t = TimelineSchema.parse({ version: 1, beat: { bpm: 120, offset: "8f" },
    sources: { ink: { type: "image", path: "ink.png" } }, look: { preset: "paper", strength: 0 },
    scenes: [{ id: "one", duration: "3s" }], overlays: [
      { type: "overlay", source: "ink" },
      { type: "hud", start: "1b", end: "4b", counter: { keys: [{ at: "1b", value: 30 }, { at: "3b", value: 99.9 }] },
        ticker: { items: [{ at: "2b", text: "NEXT" }] } },
    ] });
  const r = resolveTimeline(t, { baseDir: "/" });
  assert.equal(r.look?.strength, 0);
  assert.deepEqual(r.overlays.map(o => o.type), ["overlay"]);
  assert.deepEqual([r.hud?.startFrame, r.hud?.endFrame], [23, 68]);
  assert.deepEqual(r.hud?.counterKeys, [{ frame: 23, value: 30 }, { frame: 53, value: 99.9 }]);
  assert.deepEqual(r.hud?.tickerItems, [{ frame: 38, text: "NEXT" }]);
  assert.equal(r.hud?.absoluteStartFrame, 23);
});
