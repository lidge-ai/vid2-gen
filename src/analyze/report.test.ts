import { test } from "node:test";
import assert from "node:assert/strict";
import { AnalyzeReportSchema, buildCuts, buildSummary } from "./report.ts";
import type { AnalyzeShot } from "./types.ts";

void test("summary counts beat and onset cuts, preserving nulls without tempo/audio", () => {
  const shots = [0, 1, 2].map((n): AnalyzeShot => ({ id: `shot-${n}`, sceneId: null,
    startFrame: n * 30, endFrame: (n + 1) * 30, startS: n, endS: n + 1, seconds: 1, beats: 2,
    nearestBeatDeltaMs: 0, nearestOnsetDeltaMs: 0, motion: 0, meanLuma: 0, meanSaturation: 0,
    palette: [], keyframe: "" }));
  const cuts = buildCuts(shots, 120, 0, [1.02, 2.03]);
  assert.equal(buildSummary(shots, cuts, 30, 120, [1.02, 2.03]).cutsOnBeat, 2);
  assert.equal(buildSummary(shots, cuts, 30, 120, [1.02, 2.03]).cutsNearOnset, 2);
  assert.deepEqual(buildSummary(shots, cuts, 30, 120, []).beatHistogram, { "2": 3 });
  assert.equal(buildSummary(shots, buildCuts(shots, null, 0, null), 30, null, null).cutsOnBeat, null);
  assert.equal(buildSummary(shots, buildCuts(shots, null, 0, null), 30, null, null).cutsNearOnset, null);
});

void test("report schema rejects unknown authored output fields", () => {
  assert.equal(AnalyzeReportSchema.safeParse({ version: 1, unexpected: true }).success, false);
});
