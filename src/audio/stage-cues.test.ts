import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIO_RATE, stageCues } from "./cues.ts";
import { SFX_PRESETS } from "./sfx/presets.ts";

const ms = (v: number) => Math.round((v / 1000) * AUDIO_RATE);

void test("stage cues: mapping, per-source spacing and a rolling 10-per-second cap", () => {
  const glyphs = Array.from({ length: 40 }, (_, i) => ({ atSample: ms(i * 35), kind: "glyph", source: "a" }));
  const cues = stageCues([...glyphs, { atSample: ms(100), kind: "icon", source: "a" }, { atSample: ms(200), kind: "token", source: "a" },
    { atSample: ms(10), kind: "glyph", source: "b" }]);
  const typeA = stageCues(glyphs).filter((c) => c.sfx === "type");
  for (let i = 1; i < typeA.length; i++) assert.ok(typeA[i]!.anchorSample - typeA[i - 1]!.anchorSample >= ms(55));
  for (const c of cues) assert.ok(cues.filter((o) => o.anchorSample >= c.anchorSample && o.anchorSample - c.anchorSample < AUDIO_RATE).length <= 11);
  assert.ok(cues.some((c) => c.sfx === "pop"), "icon → pop");
  assert.ok(!cues.some((c) => c.anchorSample === ms(200) && c.sfx !== "type"), "token is silent");
  assert.ok(cues.some((c) => c.sfx === "type" && c.anchorSample === ms(10)), "source b has its own budget");
  const grow = stageCues([{ atSample: ms(3000), kind: "grow", source: "k" }])[0]!;
  assert.equal(grow.sfx, "riser");
  assert.equal(grow.atSample, ms(3000) - Math.round(SFX_PRESETS.riser.durationS * AUDIO_RATE), "riser ends on the event");
});
