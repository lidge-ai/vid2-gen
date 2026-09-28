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

## Amendments from user steering 260928 (audio listening, G-9)

The agent cannot hear. music2-gen already proved two ways to borrow ears; review must carry both.

- G-9a DSP evidence (always, no network): `src/analyze/audio.ts` also emits `audio:{integratedLufs, truePeakDbtp, lra, bands:[{name, fromHz, toHz, share}], perShot:[{shotId, lufs, onsetDensity}], loudestS, quietestS}` from ffmpeg `ebur128` plus band energy from the decoded 22.05 kHz buffer (sub 20–60, low 60–250, lowMid 250–500, mid 500–2k, presence 2–6k, air 6–11k). Per-shot loudness lets the report state "the drop at shot 7 is 1.2 LU quieter than the build" as a number. `artifacts.spectrogram` is a 1280×320 `showspectrumpic` PNG (legend off, drawtext-free) and is one of the review images. Warnings: `AUDIO_CLIPPING` (true peak > −0.5 dBTP), `AUDIO_FLAT_DYNAMICS` (per-shot LUFS spread < 1.5 LU across ≥ 6 shots), `AUDIO_LOW_END_DOMINANT` (sub+low share > 0.75), `AUDIO_SILENT_SPAN` (≥ 1 s below −50 LUFS momentary).
- G-9b audio critique (opt-in): `src/review/listen.ts` sends one excerpt (default 30 s, max 120 s, 16-bit WAV) as a Responses `input_file` to `VID2_REVIEW_AUDIO_MODEL` at `VID2_REVIEW_AUDIO_BASE_URL` + `/v1/responses` (key `VID2_REVIEW_AUDIO_API_KEY`, default "local"). Flag `--listen` enables it; without the model env it records `listen:{status:"SKIPPED", reason:"audio_model_not_configured"}` and makes zero requests. One streamed retry when the route answers 400 "stream must be set to true". Reply schema follows music2 (`heard_audio, overall, timbre[], groove[], mix[], arrangement[], top_fixes[]`) plus `sync:[{timeS, note}]`. `heard_audio:false`, unsupported modality, or any failure → `listen.status:"UNHEARD"` with a reason, never invented feedback; review still completes. Heard text enters the image review prompt as labelled second-hand evidence.
- G-9c trust rules (report and skill): DSP numbers own loudness, low end and sync; the listener owns timbre, groove, arrangement and mood. The listener is weak on sub-bass and 808 weight, so its low-end remarks are recorded at severity `info`. Findings carry `source:"frames"|"dsp"|"listener"`.
- G-9d verified route (260928): `music2 critique` through the local proxy at `http://127.0.0.1:10100` with `google-antigravity/gemini-3.8-flash` returned `heard_audio:true` on examples/opencodex-mix/media/music.wav, named 132 BPM synthwave and flagged a missing breakdown. Accept 5 runs `--listen` on the same route.
- Tests: fake Responses server — heard → HEARD; `heard_audio:false` → UNHEARD; 400 stream demand → one streamed retry; no env → SKIPPED with zero hits; report and logs never contain `data:audio` bytes or the key. DSP: a synthetic tone fixture whose second half is 6 dB louder yields per-shot LUFS differing by 6 ± 0.5 and a band share dominated by the tone's band.


## Amendments from architect reflection wp3 (R-1..R-9, supersede conflicting text above)

- R-1 endpoints: `VID2_REVIEW_BASE_URL` and `VID2_REVIEW_AUDIO_BASE_URL` are bare hosts (e.g. `http://127.0.0.1:10100`); the client appends `/v1/chat/completions` or `/v1/responses`. A trailing `/v1` is stripped once. Neither has a default; model calls are opt-in only.
- R-2 outcomes (exit codes): image model not configured → review SKIPPED, exit 0. Image model errors follow G-8 (E_ACCESS/E_TIMEOUT/E_PROVIDER, non-zero). Listener outcomes never change the exit code: not configured or no `--listen` → `listen.status:"SKIPPED"`; any failure, `heard_audio:false`, or oversize → `UNHEARD` with `reason`. With `--listen` and a configured listener but no image model, the listener still runs and review is SKIPPED with `listen` filled.
- R-3 ReviewReport v1 adds `listen:{status:"HEARD"|"UNHEARD"|"SKIPPED", reason?, model?, excerpt:{startS, seconds, format}?, reply?:{heard_audio, overall, timbre[], groove[], mix[], arrangement[], lowEnd[], top_fixes[]}}` and `findings[].source:"frames"|"dsp"|"listener"`. CLI usage: `vid2 review <video> [--timeline t] [--bpm N] [--out dir] [--base-url URL] [--model ID] [--listen] [--listen-excerpt S] [--json]`.
- R-4 listener remarks stay in `listen.reply`; they reach findings only through the image model prompt, labelled "listener (second-hand, weak on sub-bass)". Findings sourced from the listener about low end are forced to severity info. `sync` is dropped from the reply; DSP owns sync.
- R-5 two audio passes: (a) ffmpeg `ebur128=peak=true` on the source audio for integrated LUFS, LRA, true peak and momentary series → per-shot LUFS by averaging momentary energy inside each shot; (b) one decode to 22.05 kHz mono for onsets and bands.
- R-6 per-shot `lufs` is null for shots shorter than 0.4 s; bands use a 4096-point FFT with Hann window and 50 % hop.
- R-7 listener upload: MP3 64 kbps when ffmpeg has libmp3lame, else mono 22.05 kHz 16-bit WAV; hard cap 8 MB → UNHEARD `reason:"excerpt_too_large"`. Default excerpt is 30 s centred on the loudest 3 s window (clamped to the film).
- R-8 layout: `vid2 review --out D` writes `D/analyze/` (report.json, keyframes/, sheets/, spectrogram.png), `D/qa/`, `D/evidence.json`, `D/review.json`. Default D is `<video>.review`. Review reuses analyze's spectrogram only.
- R-9 ownership: `artifacts.ts` makes one keyframe per shot; `sheet.ts` composes pages with the label band in `assets/fonts/Geist-SemiBold.ttf`. Trust rules live in `skills/vid2-cli/SKILL.md` (the rubric reference is WP4). Privacy tests cover report, logs and error `details`.

Worker split (merge order W2 → W1 → W3 per A-8; the only shared file is registry.ts per A-2):

| Worker | Owns |
|---|---|
| W1 visual + analyze CLI | src/analyze/{shots,metrics,artifacts,sheet,report,run}.ts + tests; src/cli/commands/analyze.ts; `extractStill` in src/qa/artifacts.ts; tests/e2e/analyze.test.ts. report.ts (full schema incl. audio block) is written first. |
| W2 audio DSP | src/analyze/audio.ts + test; src/audio/index.ts (export onsetTimes, decodeMono22k); src/audio/beats.ts (split decodeMono22k out of detectBeats). |
| W3 review + registry + docs | src/review/{evidence,rubric,client,listen,report,run}.ts + tests; src/cli/commands/review.ts; src/cli/registry.ts (both commands); tests/e2e/review.test.ts; structure/qa.md, structure/cli-contract.md, README.md, skills/vid2-cli/SKILL.md, CHANGELOG Unreleased. |


## Amendments from audit wp3 round 1 (A-1..A-7, supersede conflicting text above)

- A-1 main writes the shared types before dispatch: `src/analyze/types.ts` (AnalyzeReport, AudioAnalysis, ShotSpan, and the AnalyzeAudioFn signature `analyzeAudio({video, shots, ffmpeg, bpm?, beatOffsetS?}) => Promise<AudioAnalysis|null>`, null when there is no audio stream) and `src/review/types.ts`. Workers import them and never edit them; changes go through main. W1's run.ts imports `analyzeAudio` from W2's audio.ts. Workers run concurrently, so W1 finishes unit tests first and runs the analyze e2e once audio.ts exists. W1's report.ts holds builders and summary math.
- A-2 registry: W1 adds the analyze import and entry; W3 adds review after W1. The overlap is two lines.
- A-3 listener reply: the prompt asks for heard_audio, overall, timbre[], groove[], mix[], arrangement[], lowEnd[], top_fixes[]. Validator: lowEnd optional → []; genre_fit and unknown keys ignored; any other missing or mistyped field → UNHEARD `malformed_reply`.
- A-4 `findings[].category` is the FINDING_CATEGORIES enum. Rule: `source==="listener" && category==="lowEnd"` forces severity info; tested with the fake server.
- A-5 accept 5 is a live receipt outside the D gate (model, route, date). If the proxy is down, report "not fully verified". The offline gate is accept 1–4 plus the fake-server and synthetic-tone tests.
- A-6 defaults: analyze writes `<video>.analyze/` (same layout as R-8 `D/analyze/`); `sceneId:null` without a timeline; both clients omit the Authorization header when their key env is absent.
- A-7 run.ts calls `requireFeatures` for scale, select, signalstats, ebur128 → E_CAPABILITY. Missing showspectrumpic → `spectrogram:null` plus warning `SPECTROGRAM_UNAVAILABLE`, tested with a fake FfmpegInfo.


## Amendments from audit wp3 round 2 (A-8..A-10)

- A-8 merge order is W2 → W1 → W3. `run.ts` takes `analyzeAudio: AnalyzeAudioFn` as a parameter; `src/cli/commands/analyze.ts` and review wire the real import from `src/analyze/audio.ts`, so W1's unit tests pass a fake.
- A-9 W1's `artifacts.ts` owns the spectrogram: `<out>/spectrogram.png` via `showspectrumpic=s=1280x320:legend=0`; run.ts sets `artifacts.spectrogram` or null plus `SPECTROGRAM_UNAVAILABLE`.
- A-10 run.ts emits warning `NO_AUDIO` when analyzeAudio returns null. A missing BPM only nulls the beat fields and emits no warning.

