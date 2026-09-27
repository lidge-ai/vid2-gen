import { test } from "node:test";
import assert from "node:assert/strict";
import { TimelineSchema } from "./schema.ts";
import { validateTimeline } from "./validate.ts";

function codes(input: unknown): string[] { return validateTimeline(TimelineSchema.parse(input), { baseDir: process.cwd() }).map(issue => issue.code); }

test("missing media source and wrong overlay kind are reported", () => {
  assert.ok(codes({ version: 1, scenes: [{ id: "one", duration: "1s", layers: [{ type: "media", source: "missing" }] }] }).includes("missing_source"));
  assert.ok(codes({ version: 1, sources: { song: { type: "audio", path: "song.wav" } },
    scenes: [{ id: "one", duration: "1s" }], overlays: [{ type: "overlay", source: "song" }] }).includes("source_kind"));
});

test("transition must be shorter than both adjacent scenes", () => {
  assert.ok(codes({ version: 1, scenes: [
    { id: "one", duration: "1s", transition: { type: "fade", duration: "1s" } }, { id: "two", duration: "2s" },
  ] }).includes("transition_length"));
});

test("beat references require a grid", () => {
  assert.ok(codes({ version: 1, scenes: [{ id: "one", duration: "2b" }] }).includes("E_SCHEMA"));
});

test("duplicate ids, missing fonts, and empty text spans are reported", () => {
  const result = codes({ version: 1, scenes: [
    { id: "one", duration: "1s", layers: [{ type: "text", text: "Hi", font: "missing", start: "1s" }] },
    { id: "one", duration: "1s" },
  ] });
  assert.ok(result.includes("duplicate_scene"));
  assert.ok(result.includes("missing_font"));
  assert.ok(result.includes("text_span"));
});

test("audio generate sources are rejected whether or not a layer uses them", () => {
  const gen = { type: "generate", provider: "ima2", kind: "audio", prompt: "music" };
  const unreferenced = TimelineSchema.parse({ version: 1, sources: { bed: gen }, scenes: [{ id: "one", duration: 1 }] });
  const referenced = TimelineSchema.parse({ version: 1, sources: { bed: gen }, scenes: [{ id: "one", duration: 1, layers: [{ type: "media", source: "bed" }] }] });
  for (const t of [unreferenced, referenced]) {
    assert.ok(validateTimeline(t, { baseDir: "/" }).some((i) => i.path === "sources.bed.kind" && /timeline\.audio/.test(i.message)));
  }
});

