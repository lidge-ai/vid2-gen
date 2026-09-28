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

test("a 0.01s non-cut fade after a 1s scene resolves to zero frames and is reported", () => {
  const t = TimelineSchema.parse({ version: 1, scenes: [
    { id: "one", duration: "1s", transition: { type: "fade", duration: "0.01s" } }, { id: "two", duration: "1s" },
  ] });
  assert.ok(validateTimeline(t, { baseDir: "/" }).some(i => i.path === "scenes.0.transition.duration" && i.code === "transition_zero_frames"));
});

test("media out validation checks source kind, ordering, and one output frame at speed", () => {
  const t = TimelineSchema.parse({ version: 1, sources: {
    still: { type: "image", path: "still.png" }, swatch: { type: "color", color: "#123456" },
    clip: { type: "video", path: "clip.mp4" }, cap: { type: "capture", session: "capture.json" },
  }, scenes: [{ id: "one", duration: "2s", layers: [
    { type: "media", source: "still", out: "1s" }, { type: "media", source: "swatch", out: "1s" },
    { type: "media", source: "clip", in: "1s", out: "1s" },
    { type: "media", source: "cap", in: "1s", out: "0.5s" },
    { type: "media", source: "clip", in: "0s", out: "0.05s", speed: 2 },
    { type: "media", source: "clip", in: "0s", out: "0.04s" },
  ] }] });
  const issues = validateTimeline(t, { baseDir: "/" });
  assert.deepEqual(issues.filter(i => i.path.endsWith(".out")).map(i => [i.path, i.code]), [
    ["scenes.0.layers.0.out", "media_out_source"], ["scenes.0.layers.1.out", "media_out_source"],
    ["scenes.0.layers.2.out", "media_out_order"], ["scenes.0.layers.3.out", "media_out_order"],
    ["scenes.0.layers.4.out", "media_read_short"],
  ]);
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

test("HUD alone needs no media source; second HUD and non-riso palette are issues", () => {
  const base = { version: 1, scenes: [{ id: "one", duration: "3s" }] };
  const first = { type: "hud", label: "REC", counter: { keys: [{ at: "0s", value: 30 }, { at: "89f", value: 99.9 }], decimals: 1 } };
  assert.deepEqual(codes({ ...base, overlays: [first] }), []);
  const issues = validateTimeline(TimelineSchema.parse({ ...base, look: { preset: "film", palette: ["#000000", "#FFFFFF"] },
    overlays: [first, { type: "hud" }] }), { baseDir: "/" });
  assert.ok(issues.some(i => i.path === "look.palette"));
  assert.ok(issues.some(i => i.path === "overlays.1" && i.code === "HUD_DUPLICATE"));
  assert.equal(codes({ ...base, look: { preset: "riso" } }).includes("look_palette"), false);
  assert.ok(codes({ ...base, overlays: [{ type: "hud", font: "missing" }] }).includes("missing_font"));
});

test("HUD keys and ticker items must be unique, ordered and in half-open span", () => {
  const base = { version: 1, scenes: [{ id: "one", duration: "3s" }] };
  const issues = validateTimeline(TimelineSchema.parse({ ...base, overlays: [{ type: "hud", start: "30f", end: "60f",
    counter: { keys: [{ at: "30f", value: 1 }, { at: "30f", value: 2 }, { at: "60f", value: 3 }] },
    ticker: { items: [{ at: "59f", text: "last" }, { at: "31f", text: "earlier" }] } }] }), { baseDir: "/" });
  assert.ok(issues.some(i => i.path === "overlays.0.counter.keys.1.at" && i.code === "HUD_TIME_ORDER"));
  assert.ok(issues.some(i => i.path === "overlays.0.counter.keys.2.at" && i.code === "HUD_TIME_RANGE"));
  assert.ok(issues.some(i => i.path === "overlays.0.ticker.items.1.at" && i.code === "HUD_TIME_ORDER"));
  assert.ok(codes({ ...base, overlays: [{ type: "hud", end: "60f", ticker: { items: [{ at: "60f", text: "too late" }] } }] })
    .includes("HUD_TIME_RANGE"));
  assert.ok(codes({ ...base, overlays: [{ type: "hud", start: "90f" }] }).includes("HUD_SPAN"));
});
