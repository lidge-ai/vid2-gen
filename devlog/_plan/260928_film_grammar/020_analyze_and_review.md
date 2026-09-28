# 020 — WP3: analysis and review the agent can read (G5)

Decisions D3.1–D3.3 (006).

## File change map

| File | Change |
|---|---|
| src/analyze/shots.ts | NEW: shots from resolved plan (scene start frames, ids) or ffmpeg scene score 0.30 fallback (\`method\`). |
| src/analyze/metrics.ts | NEW: per-shot motion (mean abs frame diff), luma, saturation (signalstats), top-5 palette (quantized RGB histogram on a 64×36 downscale). |
| src/analyze/audio.ts | NEW: decode once (22.05 kHz mono), \`onsetTimes\` from src/audio/beats.ts, nearest onset/beat deltas. |
| src/analyze/artifacts.ts | NEW: keyframes/ (one per shot, mid frame), labelled contact sheet pages (drawtext-free: labels burned via the stage text raster or placed in a JSON index). |
| src/analyze/report.ts | NEW: strict zod AnalyzeReport v1 + summary (ASL, median, cut/beat and cut/onset within 1 frame / 50 ms counts, shot-length histogram in beats). |
| src/analyze/run.ts | NEW: orchestrates; used by CLI and review. |
| src/cli/commands/analyze.ts | NEW: \`vid2 analyze <video> [--timeline t.json] [--bpm N] [--out dir] [--json]\`. |
| src/review/{evidence,rubric,client,report,run}.ts | NEW: evidence package (analyze + qa artifacts + ≤24 images incl. a short motion strip), rubric prompt, Chat Completions client with data-URL images, strict findings schema, SKIPPED without config. |
| src/cli/commands/review.ts | NEW: \`vid2 review <video> [--timeline t.json] [--bpm N] [--out dir] [--base-url URL] [--model ID] [--json]\`. |
| src/cli/registry.ts | MODIFY: register analyze, review. |
| structure/qa.md, structure/cli-contract.md, README.md, skills/vid2-cli/SKILL.md | SoT sync. |

## Contracts

AnalyzeReport v1: \`{version:1, video, method:"timeline"|"scene-detect-0.30", fps, bpm, beatOffsetS, shots:[{id, sceneId, startFrame, endFrame, startS, seconds, beats, nearestBeatDeltaMs, nearestOnsetDeltaMs, motion, meanLuma, meanSaturation, palette:[hex…], keyframe}], summary:{shots, asl, medianShot, cutsOnBeat, cutsNearOnset, beatHistogram}, artifacts, warnings}\`.

ReviewReport v1: \`{version:1, status:"REVIEWED"|"SKIPPED", reason?, model, evidence, scores:{narrative, hierarchy, legibility, continuity, motion, audioTiming, technical} (0–4 or "cannotDetermine"), findings:[{sceneId, timeS, severity:"info"|"warn"|"critical", category, observation, evidence, fix}], limitations, usage}\`.

## Accept criteria

1. On a deterministic 3-scene fixture with audio clicks at scene starts, \`vid2 analyze --timeline\` reports 3 shots, method "timeline", onset deltas within ±34 ms, beats per shot matching the authored bars; without \`--timeline\` the method is scene-detect and cuts land within 1 frame.
2. No audio → onset fields null plus a warning; no BPM → beat fields null.
3. \`vid2 review\` without base URL/model → status SKIPPED, zero network requests (test with a fake server counting hits), evidence folder written.
4. With a fake OpenAI-compatible server returning valid JSON → REVIEWED with findings; malformed JSON → one repair retry then E_PROVIDER; finding with timeS beyond duration or unknown sceneId is rejected.
5. Real run: analyze + review on the re-rendered opencodex-mix via the local proxy (gpt-6-astra) produce a report kept under devlog evidence (text only).
6. typecheck, lint, tests pass.

## Amendments from reflection (006 G-6–G-8)

- G-6: shots carry `endFrame`, `endS`; report has a top-level `cuts:[{frame, s, beatDeltaMs, onsetDeltaMs}]`. `onsetTimes` is exported from src/audio/index.ts. Still extraction shared with src/qa/artifacts.ts through a small `extractStill` helper. Labels: a JSON index (`sheet.json`: page, cell → shot id, time) plus the stage text raster burned into each cell (drawtext-free, structure/overview.md:36). Sheets page at 40 cells (8×5); long films emit multiple pages.
- G-7: review exits 0 for REVIEWED or SKIPPED regardless of finding severity; QA failures are embedded as evidence (runQa result), never abort review. SKIPPED carries `reason: "model_not_configured"` exactly.
- G-8: transport config: flags `--base-url`/`--model` win over `VID2_REVIEW_BASE_URL`/`VID2_REVIEW_MODEL`; key from `VID2_REVIEW_API_KEY` only (never a flag). Caps: ≤24 images, long edge ≤1280 px, ≤6 MB total image bytes, 120 s timeout, one repair retry. Errors: 401/403 → E_ACCESS, timeout → E_TIMEOUT, other HTTP / invalid JSON / schema → E_PROVIDER. Tests assert logs and the report never include the auth header, image bytes or raw model output. Sending frames to the local proxy in accept 5 is an explicit opt-in run.
- Tests: src/analyze/shots.test.ts, metrics.test.ts, run.test.ts, src/review/report.test.ts, client.test.ts (fake HTTP server), tests/e2e/analyze-review.test.ts.

## Amendments from audit round 1 (blocker 10)

- B10: new src/analyze/sheet.ts composes pages: ffmpeg extracts one mid-frame per shot (shared `extractStill`), a label band (shot id · start time · beats) is rasterized with src/stage/raster.ts text masks in the default sans font and overlaid per cell; `sheet.json` maps page/cell → shot id/time. Test: a 41-shot synthetic video yields 2 pages (40 + 1), the index maps cell 40 → page 2 cell 0, and each cell's label band has nonblank pixels (luma variance > 0).
