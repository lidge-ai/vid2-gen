# QA and preview

## vid2 qa

`vid2 qa out.mp4 [--timeline t.json] [--out dir] [--waive black@0-0.4] [--expect-audio] [--strict-motion] --json` writes an evidence folder
(`out.mp4.qa/` by default): `qa.json`, `contact.png`, `keyframes/` (scene start/mid/end, seams ±1 frame, capture events when a timeline is given),
`probe.json`, and `waveform.png` + `spectrogram.png` when there is an audio stream.

| Check | Severity | Rule |
|---|---|---|
| format | fail | mp4/mov h264/hevc: yuv420p, even size, faststart; mov prores: yuv422p10le; webm vp9: yuv420p |
| duration | fail | frames = resolved timeline frames ± 1 |
| black | fail | blackdetect d=0.5 pic_th=0.98 pix_th=0.02 outside waivers |
| av_sync | fail | audio and video durations within one frame |
| frozen | warn | freezedetect n=−60 dB d=3 (stills are legitimate; `--strict-motion` makes it a failure) |
| loudness | warn (fail when TP > target + 0.5) | ebur128 integrated within target ± 1 LU |
| silence | warn | silencedetect when audio is expected |
| text_safe, contrast | warn | from the timeline: ordinary text boxes inside 5 % margins and contrast ratio ≥ 3; stage-family text boxes at their first sampled opaque hold also use 5 % margins and estimated contrast ≥ 4.5 under 40 authored px, ≥ 3 above (structure/stage.md) |

Stage title-safe warnings use parent-transformed geometry, scaled once to the actual output, and identify the sampled absolute
time. They share existing `text_safe` waivers and remain warnings. Samples wait for opacity and color; they do not prove geometric
settling, later reflow states, every motion frame, overlap-free layout, or full accessibility conformance.

Audio checks are `skipped` for a video without an audio stream unless `--expect-audio` or the timeline has `audio`. Waivers (CLI or `qa.waive` in the
timeline) keep the issue in the report with its reason. Exit 6 only when an open `fail` issue remains.

## vid2 analyze and review

`vid2 analyze film.mp4 [--timeline timeline.json] [--bpm 132] [--out dir] --json` writes `report.json`, shot keyframes, labelled contact sheets and an optional spectrogram. Without `--out`, the folder is `film.mp4.analyze/`. The report records shot boundaries, motion, color, cut timing and measured audio. Without a timeline, scene IDs are null and boundaries come from scene detection. Missing audio produces `NO_AUDIO`; missing `showspectrumpic` produces `SPECTROGRAM_UNAVAILABLE` and a null spectrogram.

`vid2 review film.mp4 [--timeline timeline.json] [--bpm 132] [--out dir] [--base-url URL] [--model ID] [--listen] [--listen-excerpt S] --json` writes `dir/analyze/`, `dir/qa/`, `dir/images/`, `dir/evidence.json` and `dir/review.json`. The default folder is `film.mp4.review/`. QA issues, including open failures, remain evidence and do not change review's exit code. `REVIEWED` and `SKIPPED` both exit 0; without an image model host or model ID, status is `SKIPPED` with `reason:"model_not_configured"` and no image request.

Image review uses OpenAI-compatible Chat Completions at `<bare-host>/v1/chat/completions`. `--base-url` and `--model` override `VID2_REVIEW_BASE_URL` and `VID2_REVIEW_MODEL`; `VID2_REVIEW_API_KEY` supplies an optional bearer key. At most 24 images, each at most 1280 px on its long edge and 6 MB combined, are sent. The request times out after 120 s. An invalid JSON or finding schema gets one repair attempt. HTTP 401/403 maps to `E_ACCESS`, timeout to `E_TIMEOUT`, and other model errors to `E_PROVIDER`.

`--listen` separately enables an audio excerpt through Responses `input_file` at `<bare-host>/v1/responses`. Configure `VID2_REVIEW_AUDIO_BASE_URL`, `VID2_REVIEW_AUDIO_MODEL` and optionally `VID2_REVIEW_AUDIO_API_KEY`. The excerpt defaults to 30 s centered on the loudest window; `--listen-excerpt` accepts 1–120 s. Upload is 64 kbps MP3 when libmp3lame exists, otherwise mono 22.05 kHz WAV, capped at 8 MB. Missing listener config is `SKIPPED`; unsupported audio, `heard_audio:false`, a provider failure or oversized audio is `UNHEARD` with a reason. Neither changes the image review exit code. Keys, encoded media and raw model responses are excluded from reports and errors.

Trust measured DSP data for loudness, low end and sync. Use the listener for timbre, groove, arrangement and mood; its sub-bass judgment is weak. Frames ground visual findings. Every finding identifies its source. Listener-sourced `lowEnd` findings are informational even when the model asks for higher severity.

## vid2 preview

`vid2 preview t.json --at 0,25%,1.5s,<marker>,<event> [--profile proxy|final] [--placeholders]` renders single frames through the real composition:
the touched segment (or both segments and a local xfade inside a transition), shifted to absolute time before the timeline-level overlays and
effects. Frames match the full render within 2/255 mean absolute difference (tested at a fade, a flash, a later transition with a sweep overlay,
and a global rgbsplit).

## Placeholders

`--placeholders` (compile, render, preview) stands in striped PNG images for missing media files and uncached generated sources and drops missing
audio, with a `W_PLACEHOLDER <sourceId>` warning each; no provider is called. Templates render cold with it.
