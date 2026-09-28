# 005 — Frame-level gap analysis: our films vs the references

Inputs: 001 (reference measurements), 002 (GitHub survey), 003 (theory digest), 004 (review and Grok video), plus failures hit while making five opencodex films on 2026-09-28 (examples/opencodex-*, uncommitted). Measurements come from `/tmp/vid2-research/filmstats.mjs` (prototype of the planned `vid2 analyze`).

## G1 — Cuts drift off the beat (bug, measured)

`resolveTimeline` rounds every scene duration to frames independently (`src/timeline/resolve.ts:169`, `frame(scene.duration, ctx, "duration")`), and `toFrames` rounds beat units per call (`src/shared/time.ts:63`). In examples/opencodex-mix (132 BPM, bar = 1.8182 s = 54.55 frames) the authored scene starts drift from the grid:

| Scene | Intended (s) | Rendered start (s) | Drift |
|---|---|---|---|
| drop | 5.4545 | 5.467 | +12 ms |
| b4 (4th quarter-bar cut) | 8.6364 | 8.700 | +64 ms |
| app | 12.7273 | 12.800 | +73 ms |
| npm | 34.5455 | 34.667 | +121 ms |
| end | 36.3636 | 36.500 | +136 ms (4 frames) |

Rendered cuts sit 34–212 ms after the nearest audio onset; only 1 of 14 detected cuts is within 50 ms of an onset (references: 58–62 %). **Fix:** round cumulative exact time (scene start = round(exactStart·fps)), add a `bar` time unit, and report cut/beat deltas.

## G2 — Media `out` is ignored; clips cannot be trimmed from a capture (bug)

`sourceInput` (`src/compile/layers/media.ts:40-55`) opens video and capture inputs with `-ss in -t span·speed`; `outSeconds` from `resolve.ts:97` never reaches the input. On 2026-09-28 the opencodex.me capture kept scrolling past the intended card; the workaround was pre-cutting with ffmpeg. **Fix:** cap the read at `out−in` and hold the last frame for the rest of the span (the tpad hold already exists).

## G3 — Two reads of one file in a segment can deadlock ffmpeg (reliability, observed 3×)

Segments with 4–5 inputs of the same mp4 at different `-ss` (session scenes cut from one terminal recording) hung with ffmpeg at 0 % CPU for 5+ minutes on ffmpeg 9.0.2; a retry or pre-cutting the clip fixed it. **Fix:** when one segment reads the same file more than once, pre-trim each read into a cached intermediate (hash of path, mtime, in, duration, speed) and feed that instead.

## G4 — Auto camera on event-heavy captures overflows ffmpeg's expression parser (bug)

`camera: {auto: "events"}` on a capture with a typed field emitted a 167,842-character perspective expression and ffmpeg failed with ENOMEM. **Fix:** merge events closer than `hold` and cap the key count (for example 24), and fail validation with a fix hint beyond that.

## G5 — No review loop the agent can read (capability gap)

vid2 QA produces a 0.5 fps contact sheet, seam stills, waveform and spectrogram (004 §Part 1) but no shot table, no cut/onset/beat alignment, no palette per shot and no model critique. Both reference prompts make repeated watching part of the job. **Add:** `vid2 analyze` (shots from the plan or scene detection, shot length in beats, onset/beat deltas, motion, luma/saturation/palette per shot, per-shot keyframe sheet with timestamps) and `vid2 review` (evidence package → OpenAI-compatible vision model with a rubric → schema-checked findings with scene, time, severity, fix; SKIPPED when no model is configured). The local proxy answered an image question correctly with gpt-6-astra (004).

## G6 — No look system (craft gap)

We have `grain`, `vignette`, `flash`, `rgbsplit`, `motionblur`. The references rely on a constrained palette and a print/film finish across every shot. **Add:** named timeline looks built from ffmpeg filters — `film` (grade, halation, grain, gentle weave), `riso` (paper texture, halftone, palette quantize, misregistration), `paper` — with a palette the look quantizes toward.

## G7 — No persistent HUD devices (craft gap)

Continuity between 0.2–1.8 s shots comes from overlays that persist and change: a climbing counter, a date stamp, a ticker strip, corner brackets. vid2 has timeline `overlays` and kinetic/ticker/bars layers, but no counter whose value is keyed across the whole film and no HUD frame component. **Add:** a `hud` overlay component (corners, label, timecode/frame counter, keyed counter with format, ticker strip).

## G8 — Rhythm vocabulary is manual (craft gap)

Strobe runs and beat-multiple shot ladders are hand-authored scene lists today. **Add:** beat-unit durations everywhere (`"2b"`, `"1bar"`), and document the shot-length ladder (½, 1, 2, 3, 4, 8 beats) with strobe patterns in the direction skill; the analyzer reports each shot's length in beats.

## G9 — Film grammar is not in the skills (knowledge gap)

The direction skill has kinetic grammar but not Murch's priorities, shot-length statistics, phrase-boundary cutting, reading-time rules, color scripts, trailer structure, sound cue sheets or moodboard-to-style workflow (003). **Add:** condensed, rule-shaped references with numeric thresholds and the reference-film breakdown (001).

## G10 — Generated clips are possible but unguarded (capability gap)

`generate` with `kind: "video"` already routes to `ima2 video` (004 §Part 2). Missing: capability guards (1–15 s, ≤7 references, 1080p only for text/image-to-video), a warning when a layer outlasts its clip (silent last-frame hold), and a verified end-to-end render in an example. **Add:** guards + warning + example evidence.

## Out of scope for this unit

Transcript/caption sidecars with word timing (002 #4), EDL rationale fields (002 #7), an MCP adapter (002 #8), platform safe-area masks (003 #3) and per-cut intent metadata (003 #4) are recorded as follow-ups; they do not block the gaps above.

## Ranking

By dependency order (foundations first, PHASE-SPLIT-01): G1–G4 timing and render correctness → G5 analysis and review (needs exact cut times from G1) → G6–G9 grammar, looks, HUD, knowledge (reviewed with G5) → G10 generated clips → release.
