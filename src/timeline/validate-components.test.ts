import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TimelineSchema } from "./schema.ts";
import { validateTimeline } from "./validate.ts";
import type { ValidationIssue } from "./types.ts";

type Input = Record<string, unknown>;
const bars = { type: "bars", items: [{ label: "one", value: 20 }] };
const ticker = { type: "ticker", items: [{ text: "one" }, { text: "two" }] };
const chips = { type: "chips", items: [{ at: 0, text: "one" }] };
const base = "scenes.0.layers.0";

function timeline(layer: Input, root: Input = {}, duration: string = "2s") {
  return TimelineSchema.parse({ version: 1, output: { fps: 30 }, ...root,
    scenes: [{ id: "one", duration, layers: [layer] }] });
}

function issues(layer: Input, root: Input = {}, duration?: string) {
  return validateTimeline(timeline(layer, root, duration), { baseDir: process.cwd() });
}

const events: { path: string; layer: (at: string) => Input }[] = [
  { path: "typing.0.at", layer: at => ({ type: "field", typing: [{ at, text: "one" }] }) },
  { path: "clear", layer: clear => ({ type: "field", clear }) },
  { path: "mask.at", layer: at => ({ type: "field", mask: { at } }) },
  { path: "cursor.at", layer: at => ({ type: "field", cursor: { from: { x: 0, y: 0 }, at } }) },
  { path: "cursor.click", layer: click => ({ type: "field", cursor: { from: { x: 0, y: 0 }, at: 0, click } }) },
  { path: "delay", layer: delay => ({ ...bars, delay }) },
  { path: "delay", layer: delay => ({ ...ticker, delay }) },
  { path: "items.0.at", layer: at => ({ type: "chips", items: [{ at, text: "one" }] }) },
];

for (const event of events) {
  const type = String(event.layer("0s").type);
  test(`${type} ${event.path} uses rounded half-open layer-relative membership`, () => {
    // Delayed layer [30, 90) has 60 frames; the event clock still starts at zero.
    for (const at of ["2s", "1999ms", "3s"]) {
      const found = issues({ ...event.layer(at), start: "1s", end: "3s" }, {}, "4s");
      assert.deepEqual(found.map(i => [i.path, i.code]), [[`${base}.${event.path}`, "COMPONENT_TIME_RANGE"]], at);
    }
    assert.deepEqual(issues({ ...event.layer("59f"), start: "1s", end: "3s" }, {}, "4s"), []);
    assert.deepEqual(issues({ ...event.layer("0s"), start: "1s", end: "3s" }, {}, "4s"), []);
  });
}

for (const layer of [{ type: "field" }, bars, ticker, chips]) {
  test(`${layer.type} rejects empty, reversed and clamped spans`, () => {
    for (const span of [{ start: "1s", end: "1s" }, { start: "1s", end: "0s" }, { start: "2s" }]) {
      assert.deepEqual(issues({ ...layer, ...span }).map(i => [i.path, i.code]), [[base, "COMPONENT_SPAN"]]);
    }
  });
}

test("component event ranges use rational fps and beat durations without the grid offset", () => {
  const root = { output: { fps: "30000/1001" }, beat: { bpm: 120, offset: "5s", meter: 4 } };
  assert.deepEqual(issues({ ...bars, delay: "1b" }, root, "30f"), []);
  assert.deepEqual(issues({ ...bars, delay: "2b" }, root, "30f").map(i => [i.path, i.code]),
    [[`${base}.delay`, "COMPONENT_TIME_RANGE"]]);
  assert.deepEqual(issues({ ...bars, delay: "29f" }, root, "30f"), []);
});

test("component spans follow the scene's cumulative quantization", () => {
  // Scene boundaries round ties down: 50ms * 30 = 1.5 -> 1; 100ms * 30 = 3.
  // Thus the second scene has two frames, unlike independently rounding 50ms.
  const t = TimelineSchema.parse({ version: 1, output: { fps: 30 }, scenes: [
    { id: "first", duration: "50ms" },
    { id: "second", duration: "50ms", layers: [{ ...bars, delay: "1f" }, { ...bars, delay: "2f" }] },
  ] });
  assert.deepEqual(validateTimeline(t).map(i => [i.path, i.code]), [["scenes.1.layers.1.delay", "COMPONENT_TIME_RANGE"]]);
});

test("typing starts must strictly increase in authored seconds", () => {
  for (const at of ["0.5s", "1s"]) {
    const found = issues({ type: "field", typing: [{ at: "1s", text: "one" }, { at, text: "two" }] });
    assert.deepEqual(found.map(i => [i.path, i.code]), [[`${base}.typing.1.at`, "FIELD_TIME_ORDER"]]);
  }
});

test("typing order preserves distinct subframe starts and rejects subframe reversal", () => {
  const typing = [{ at: "1ms", text: "one" }, { at: "2ms", text: "two" }];
  assert.deepEqual(issues({ type: "field", typing }), []);
  assert.deepEqual(issues({ type: "field", typing: [...typing].reverse() }).map(i => [i.path, i.code]),
    [[`${base}.typing.1.at`, "FIELD_TIME_ORDER"]]);
});

test("typing order compares mixed beat and second units", () => {
  const root = { beat: { bpm: 120, offset: "5s" }, output: { fps: "30000/1001" } };
  const typing = [{ at: "1b", text: "one" }, { at: "501ms", text: "two" }];
  assert.deepEqual(issues({ type: "field", typing }, root), []);
  assert.deepEqual(issues({ type: "field", typing: [...typing].reverse() }, root).map(i => [i.path, i.code]),
    [[`${base}.typing.1.at`, "FIELD_TIME_ORDER"]]);
});

test("ticker interval rejects zero in every supported unit", () => {
  for (const interval of [0, "0s", "0ms", "0f", "0b", "0bar"]) {
    const found = issues({ ...ticker, interval }, { beat: { bpm: 120 } });
    assert.deepEqual(found.map(i => [i.path, i.code]), [[`${base}.interval`, "TICKER_INTERVAL"]]);
  }
});

test("positive subframe ticker periods remain valid before rounding", () => {
  for (const interval of [0.001, "5ms", "0.001b", "0.001bar"]) {
    assert.deepEqual(issues({ ...ticker, interval }, { beat: { bpm: 120 } }), []);
  }
});

test("simultaneous and unordered chip entrances remain valid", () => {
  assert.deepEqual(issues({ type: "chips", items: [
    { at: "1s", text: "one" }, { at: "1s", text: "two" }, { at: 0, text: "three" },
  ] }), []);
});

test("zero glyph and stagger periods remain valid", () => {
  assert.deepEqual(issues({ type: "field", typing: [{ at: 0, text: "one", glyph: 0 }] }), []);
  assert.deepEqual(issues({ ...bars, stagger: 0 }), []);
});

test("generated glyphs, rows and ticker items may finish beyond an intentional cut", () => {
  assert.deepEqual(issues({ type: "field", typing: [{ at: "59f", text: "long tail", glyph: "2s" }] }), []);
  assert.deepEqual(issues({ ...bars, delay: "59f", grow: "5s", stagger: "3s",
    items: [{ label: "one", value: 20 }, { label: "two", value: 40 }] }), []);
  assert.deepEqual(issues({ ...ticker, delay: "59f", interval: "3s" }), []);
});

test("missing beat grids report the authored component path", () => {
  assert.deepEqual(issues({ ...bars, delay: "1b" }).map(i => [i.path, i.code]), [[`${base}.delay`, "E_SCHEMA"]]);
});

test("CLI validation preserves JSON error envelope for component timing negatives", () => {
  const dir = mkdtempSync(join(tmpdir(), "vid2-component-validation-"));
  try {
    const file = join(dir, "timeline.json");
    const entry = fileURLToPath(new URL("../cli/index.ts", import.meta.url));
    for (const [layer, code] of [[{ ...ticker, interval: 0 }, "TICKER_INTERVAL"],
      [{ type: "chips", items: [{ at: "2s", text: "late" }] }, "COMPONENT_TIME_RANGE"]] as const) {
      writeFileSync(file, JSON.stringify(timeline(layer)));
      const result = spawnSync(process.execPath, [entry, "validate", file, "--json"], {
        encoding: "utf8", env: { ...process.env, VID2_HOME: join(dir, "home") }, timeout: 30000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 2, result.stdout + result.stderr);
      // The assertions check these serialized CLI fields at runtime.
      const envelope = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; details: { issues: ValidationIssue[] } } };
      assert.equal(envelope.ok, false);
      assert.equal(envelope.error.code, "E_INPUT");
      assert.deepEqual(envelope.error.details.issues.map(issue => issue.code), [code]);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
