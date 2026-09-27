import test from "node:test";
import assert from "node:assert/strict";
import { anchorStart, autoCues, AUDIO_RATE } from "./cues.ts";
import { SFX_PRESETS } from "./sfx/presets.ts";

void test("start, peak and end anchors use integer samples at 48 kHz", () => {
  const cut = 2 * AUDIO_RATE;
  assert.equal(anchorStart(cut, SFX_PRESETS.click), cut);
  assert.equal(anchorStart(cut, SFX_PRESETS.whoosh), cut - Math.round(SFX_PRESETS.whoosh.peakS * AUDIO_RATE));
  assert.equal(anchorStart(cut, SFX_PRESETS.riser), cut - Math.round(SFX_PRESETS.riser.durationS * AUDIO_RATE));
  assert.equal(anchorStart(0, SFX_PRESETS.riser), -Math.round(SFX_PRESETS.riser.durationS * AUDIO_RATE));
});

void test("auto cues follow transition, drop and capture clocks", () => {
  const cues = autoCues({ transitions: [{ atSample: 96000, type: "fade" }, { atSample: 144000, type: "fadewhite" },
    { atSample: 192000, type: "cut" }], drops: [144000, 240000], synthMusic: true,
    captureEvents: [{ atSample: 100000, kind: "click" }, { atSample: 200000, kind: "type", chars: 3, durationSamples: 4800 }] });
  assert.equal(cues.filter((cue) => cue.sfx === "whoosh").length, 2);
  assert.deepEqual(cues.filter((cue) => cue.sfx === "impact").map((cue) => cue.anchorSample), [144000, 240000]);
  assert.deepEqual(cues.filter((cue) => cue.sfx === "type").map((cue) => cue.anchorSample), [200000, 202400, 204800]);
  assert.equal(cues.find((cue) => cue.sfx === "click")?.atSample, 100000);
  assert.ok(cues.every((cue) => cue.gain > 0 && cue.gain <= 1));
});

void test("drops require synth music and typing tick count respects privacy-only chars", () => {
  const cues = autoCues({ transitions: [], drops: [96000], synthMusic: false,
    captureEvents: [{ atSample: 1000, kind: "type", chars: 0 }, { atSample: 2000, kind: "type", chars: 2 }] });
  assert.equal(cues.some((cue) => cue.sfx === "impact"), false);
  assert.equal(cues.filter((cue) => cue.sfx === "type").length, 2);
});
