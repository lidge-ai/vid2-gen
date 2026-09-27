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
| text_safe, contrast | warn | from the timeline: text boxes inside 5 % margins; WCAG ratio ≥ 3 against the sampled background |

Audio checks are `skipped` for a video without an audio stream unless `--expect-audio` or the timeline has `audio`. Waivers (CLI or `qa.waive` in the
timeline) keep the issue in the report with its reason. Exit 6 only when an open `fail` issue remains.

## vid2 preview

`vid2 preview t.json --at 0,25%,1.5s,<marker>,<event> [--profile proxy|final] [--placeholders]` renders single frames through the real composition:
the touched segment (or both segments and a local xfade inside a transition), shifted to absolute time before the timeline-level overlays and
effects. Frames match the full render within 2/255 mean absolute difference (tested at a fade, a flash, a later transition with a sweep overlay,
and a global rgbsplit).

## Placeholders

`--placeholders` (compile, render, preview) stands in striped PNG images for missing media files and uncached generated sources and drops missing
audio, with a `W_PLACEHOLDER <sourceId>` warning each; no provider is called. Templates render cold with it.
