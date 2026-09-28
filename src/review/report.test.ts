import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnalyzeReport } from "../analyze/types.ts";
import { parseReview } from "./report.ts";

export const fakeAnalyze: AnalyzeReport = {
  version: 1, video: "fixture.mp4", method: "timeline", fps: 30, durationS: 2, bpm: null, beatOffsetS: null,
  shots: [{ id: "s1", sceneId: "opening", startFrame: 0, endFrame: 60, startS: 0, endS: 2,
    seconds: 2, beats: null, nearestBeatDeltaMs: null, nearestOnsetDeltaMs: null,
    motion: 0, meanLuma: 0, meanSaturation: 0, palette: [], keyframe: "frame.png" }],
  cuts: [], summary: { shots: 1, asl: 2, medianShot: 2, cutsOnBeat: null, cutsNearOnset: null, beatHistogram: {} },
  audio: null, artifacts: { dir: ".", report: "report.json", keyframes: ".", sheets: [], sheetIndex: "sheet.json", spectrogram: null }, warnings: [],
};

export const validReview = { scores: { narrative: 3, hierarchy: 2, legibility: 4, continuity: 3,
  motion: 2, audioTiming: "cannotDetermine", technical: 4 },
findings: [{ sceneId: "opening", timeS: 1, severity: "critical", category: "lowEnd", source: "listener",
  observation: "thin", evidence: "heard", fix: "adjust" }], limitations: [] };

test("review validates scene and time, and caps listener lowEnd severity", () => {
  const parsed = parseReview(JSON.stringify(validReview), fakeAnalyze);
  assert.equal(parsed?.findings[0]?.severity, "info");
  assert.equal(parseReview(JSON.stringify({ ...validReview, findings: [{ ...validReview.findings[0], sceneId: "unknown" }] }), fakeAnalyze), null);
  assert.equal(parseReview(JSON.stringify({ ...validReview, findings: [{ ...validReview.findings[0], timeS: 3 }] }), fakeAnalyze), null);
  assert.equal(parseReview("not JSON", fakeAnalyze), null);
});

test("structured report redacts a key and encoded media echoed by a model", () => {
  const input = { ...validReview, findings: [{ ...validReview.findings[0],
    observation: "SECRET_KEY data:image/png;base64,QUJDRA==",
    evidence: "data:audio/wav;base64,QUJDRA==", fix: "keep" }], limitations: ["SECRET_KEY"] };
  const report = parseReview(JSON.stringify(input), fakeAnalyze, "SECRET_KEY");
  assert.ok(report);
  assert.doesNotMatch(JSON.stringify(report), /SECRET_KEY|data:image|data:audio|QUJDRA==/);
});
