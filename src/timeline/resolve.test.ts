import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  const events = { resolve: (ref: { event: string; source?: string }) => ({ frame: ref.event === "click" ? 12 : 0, sourceId: "cap" }) };
  assert.deepEqual(resolveTimeline(t, { baseDir, events }).audio?.cues.map(c => c.frame), [0, 0]);
  assert.throws(() => resolveTimeline(t, { baseDir }), (e: unknown) => e instanceof Vid2Error && e.code === "E_INPUT");
});

test("relative source and font paths resolve against timeline directory", () => {
  const t = TimelineSchema.parse({ version: 1, sources: { still: { type: "image", path: "media/still.png" } },
    fonts: { display: { path: "fonts/display.otf" } }, scenes: [{ id: "one", duration: "1s", layers: [{ type: "media", source: "still" }] }] });
  const r = resolveTimeline(t, { baseDir });
  assert.equal(r.sources.still && "path" in r.sources.still ? r.sources.still.path : "", `${baseDir}media/still.png`);
  assert.equal(r.fonts.display?.path, `${baseDir}fonts/display.otf`);
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
