---
name: vid2-cli
description: Use when operating vid2 from an agent or diagnosing CLI output. Triggers include validate/resolve/preview/render/QA loops, JSON envelopes, exit codes, provider materialization, and repeatable delivery.
---

# CLI production loop

1. `vid2 doctor --json` for local capabilities; `vid2 validate timeline.json --json` for shape and relationships.
2. `vid2 resolve timeline.json --json` for frame positions. Check durations, overlap, event offsets and source status.
3. `vid2 preview timeline.json --at 0,25%,1.5s --out preview/ --profile proxy --json` for stills. Inspect first/middle/end and transition seams. Ask for a still review only when the user requested one.
4. `vid2 render timeline.json --profile proxy -o proxy.mp4 --json`, then `vid2 qa proxy.mp4 --timeline timeline.json --json`. Fix the measured issue, re-preview the touched scene, and rerender.
5. `vid2 render timeline.json --profile final -o final.mp4 --json`, then `vid2 qa final.mp4 --timeline timeline.json --json`. Report video path, duration and QA status/artifacts. If sources are intentionally absent, `--placeholders` gives labelled stripes for a structural render; replace them before a publishable final.

For a review cycle, run `vid2 render timeline.json -o film.mp4`, `vid2 analyze film.mp4 --timeline timeline.json --json`, then `vid2 review film.mp4 --timeline timeline.json --listen --json`. Fix the authored timeline using `film.mp4.review/review.json` and `film.mp4.review/analyze/report.json`, then render again. Configure image review with `VID2_REVIEW_BASE_URL` and `VID2_REVIEW_MODEL` (or `--base-url` and `--model`), and optional `VID2_REVIEW_API_KEY`. Listening requires `--listen`, `VID2_REVIEW_AUDIO_BASE_URL`, `VID2_REVIEW_AUDIO_MODEL` and optional `VID2_REVIEW_AUDIO_API_KEY`. The hosts are bare HTTP(S) origins. `--listen-excerpt S` accepts 1–120 s, default 30 s.

Read evidence by source: DSP owns measured loudness, low end and sync; listener remarks own perceived timbre, groove, arrangement and mood; frames own visuals. Listener feedback is second-hand and weak on sub-bass or 808 weight, so listener-sourced low-end findings stay informational. Do not turn an `UNHEARD` result into an auditory claim. An unconfigured image model returns `SKIPPED` with no request; QA failures remain in evidence. A `REVIEWED` status means a model responded, not that all findings are resolved.

JSON success is `{ok:true,command,data,artifacts,warnings,meta:{vid2}}`; failure is `{ok:false,command,error:{code,message,fix,details,retryable},meta:{vid2}}`. Exit 2 means input/schema/path, 3 capability, 4 access/provider, 5 render, 6 open failing QA issue, 7 timeout/interruption. Read `error.fix` and QA issue `measured`, `threshold`, `range`, and `fix`; waived issues retain reason. Warnings do not equal successful visual review.

Do not edit a rendered MP4 with ad hoc ffmpeg and call it source-of-truth; change the timeline and rerender. Do not assume `vid2 render` fetches a provider asset: use `vid2 assets resolve timeline.json` or an explicit `vid2 assets gen` request first. Do not force `--generate` or a provider call to repair a missing local file. Keep the generated plan with `vid2 compile timeline.json -o timeline.plan.json --json` when reproducing a render.
