import assert from "node:assert/strict";
import { test } from "node:test";
import { ONSET_SAMPLE_RATE, onsetTimes } from "./beats.ts";

void test("onsetTimes finds every click of a synthetic click train within 20 ms", () => {
  const rate = ONSET_SAMPLE_RATE;
  const pcm = new Float32Array(rate * 3);
  const clicks = [0.25, 0.61, 1.0, 1.37, 1.9, 2.4];
  for (const c of clicks) for (let i = 0; i < 220; i++) pcm[Math.round(c * rate) + i] = Math.sin(i * 0.9) * Math.exp(-i / 40) * 0.8;
  for (let i = 0; i < pcm.length; i++) pcm[i] = pcm[i]! + Math.sin(i * 0.02) * 0.01;
  const found = onsetTimes(pcm);
  for (const c of clicks) assert.ok(found.some((t) => Math.abs(t - c) <= 0.02), `click at ${c}: ${found.map((t) => t.toFixed(3)).join(",")}`);
  assert.ok(found.length <= clicks.length + 2, "no flood of false onsets");
});
