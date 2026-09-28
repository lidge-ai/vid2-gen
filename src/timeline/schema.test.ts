import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TimelineSchema } from "./schema.ts";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../tests/fixtures/timelines/${name}.json`, import.meta.url)), "utf8"));
}

test("minimal authored timeline receives nested defaults", () => {
  const value = TimelineSchema.parse(fixture("minimal"));
  assert.equal(value.output.width, 1920);
  assert.equal(value.output.fps, 30);
  assert.equal(value.scenes[0]?.layers[0]?.type, "text");
  assert.deepEqual(value.sources, {});
});

test("invalid fixtures fail with precise paths", () => {
  for (const [name, key] of [["invalid-unknown", "scenes.0"], ["invalid-time", "scenes.0.duration"], ["invalid-font", "fonts.bad"]]) {
    if (!name || !key) throw new Error("invalid test case");
    const result = TimelineSchema.safeParse(fixture(name));
    assert.equal(result.success, false, name);
    if (!result.success) assert.ok(result.error.issues.some(issue => issue.path.join(".").startsWith(key)), name);
  }
});

test("published input schema keeps defaults optional and strict objects closed", () => {
  const schema = z.toJSONSchema(TimelineSchema, { target: "draft-2020-12", io: "input" });
  assert.deepEqual(schema.required, ["version", "scenes"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(TimelineSchema.safeParse({ version: 1, scenes: [{ id: "one", duration: "1s" }], typo: true }).success, false);
  assert.equal(TimelineSchema.safeParse({ version: 1, scenes: [{ id: "one", duration: "1s", typo: true }] }).success, false);
});

test("font path or family is required at runtime", () => {
  assert.equal(TimelineSchema.safeParse(fixture("invalid-font")).success, false);
  assert.equal(TimelineSchema.safeParse({ version: 1, fonts: { display: { family: "Instrument Serif" } }, scenes: [{ id: "one", duration: 1 }] }).success, true);
});

test("media cursor is optional, defaulted and closed", () => {
  const base = { version: 1, sources: { cap: { type: "capture", session: "demo.vid2cap" } } };
  const layer = (cursor: unknown) => ({ ...base, scenes: [{ id: "one", duration: "1s", layers: [{ type: "media", source: "cap", cursor }] }] });
  const parsed = TimelineSchema.parse(layer({}));
  const media = parsed.scenes[0]!.layers[0]!;
  assert.deepEqual(media.type === "media" ? media.cursor : null, { style: "arrow", ripple: true, scale: 1 });
  assert.equal(TimelineSchema.safeParse(layer({ style: "dot", typo: 1 })).success, false);
  assert.equal(TimelineSchema.safeParse(layer({ style: "laser" })).success, false);
});


test("audio schema: TTS voice, anchored cue, provider music; strict union rejects mixed voice", () => {
  const base = { version: 1, scenes: [{ id: "one", duration: "2s" }] };
  const ok = (audio: unknown) => TimelineSchema.safeParse({ ...base, audio }).success;
  assert.equal(ok({ voice: [{ tts: { text: "Hello" }, at: 0 }] }), true);
  assert.equal(ok({ cues: [{ at: 1, sfx: "preset:whoosh", anchor: "peak" }] }), true);
  assert.equal(ok({ music: { provider: "elevenlabs", prompt: "uplifting synthwave" } }), true);
  assert.equal(ok({ voice: [{ source: "vo", tts: { text: "x" }, at: 0 }] }), false);
  assert.equal(ok({ cues: [{ at: 1, sfx: "preset:whoosh", anchor: "middle" }] }), false);
  assert.equal(ok({ autoCues: true, typo: 1 }), false);
});

test("root look and HUD parse with defaults; HUD is not a scene layer", () => {
  const base = { version: 1, scenes: [{ id: "one", duration: "3s" }] };
  const parsed = TimelineSchema.parse({ ...base, look: { preset: "riso" }, overlays: [{ type: "hud", label: "REC",
    counter: { keys: [{ at: "0s", value: 30 }] }, ticker: { items: [{ at: "0s", text: "LIVE" }] } }] });
  assert.equal(parsed.look?.strength, 1);
  assert.equal(parsed.look?.seed, 0);
  const hud = parsed.overlays[0];
  assert.equal(hud?.type, "hud");
  if (hud?.type === "hud") {
    assert.equal(hud.font, "mono");
    assert.equal(hud.counter?.mode, "linear");
    assert.equal(hud.ticker?.height, 44);
  }
  assert.equal(TimelineSchema.safeParse({ ...base, look: { preset: "film", typo: true } }).success, false);
  assert.equal(TimelineSchema.safeParse({ ...base, look: { preset: "riso", palette: ["#000000"] } }).success, false);
  assert.equal(TimelineSchema.safeParse({ ...base, look: { preset: "paper", strength: 1.1 } }).success, false);
  assert.equal(TimelineSchema.safeParse({ ...base, overlays: [{ type: "hud", typo: true }] }).success, false);
  assert.equal(TimelineSchema.safeParse({ ...base, scenes: [{ ...base.scenes[0], layers: [{ type: "hud" }] }] }).success, false);
});
