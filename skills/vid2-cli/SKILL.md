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

JSON success is `{ok:true,command,data,artifacts,warnings,meta:{vid2}}`; failure is `{ok:false,command,error:{code,message,fix,details,retryable},meta:{vid2}}`. Exit 2 means input/schema/path, 3 capability, 4 access/provider, 5 render, 6 open failing QA issue, 7 timeout/interruption. Read `error.fix` and QA issue `measured`, `threshold`, `range`, and `fix`; waived issues retain reason. Warnings do not equal successful visual review.

Do not edit a rendered MP4 with ad hoc ffmpeg and call it source-of-truth; change the timeline and rerender. Do not assume `vid2 render` fetches a provider asset: use `vid2 assets resolve timeline.json` or an explicit `vid2 assets gen` request first. Do not force `--generate` or a provider call to repair a missing local file. Keep the generated plan with `vid2 compile timeline.json -o timeline.plan.json --json` when reproducing a render.
