# Compiler

`src/compile` turns a resolved timeline into a `RenderPlan` (`src/compile/ir.ts` is the authoritative type). The plan is plain JSON:
`vid2 compile t.json -o t.plan.json` writes it, and `vid2 render t.plan.json` renders it unchanged.

```text
ResolvedTimeline ──► per scene: SegmentPlan (inputs + filtergraph + ASS runs)   src/compile/segment.ts
                 ──► JoinPlan (xfade / concat with exact frame math)             src/compile/joins.ts
                 ──► PostPlan (timeline overlays + effects, absolute t only)     src/compile/plan.ts
```

## Segments

Each scene renders on its own at `fps × internalRate` (internalRate is the motion-blur frame count, otherwise 1):

1. A `color` lavfi canvas of the scene background (a colour, or a source id drawn as a full-frame cover layer).
2. Layers composite in authored order. A moving media read (video or capture) opens its source at `in` and reads `min(span × speed, out − in − 1 ms)`, so `out` is honored and the last allowed frame holds for the rest of the span; every such input records `pretrim{sourcePath,inSeconds,durationSeconds}`, which `compileSegment` keeps only for paths read more than once in the segment (structure/render.md). Stage layers compile to a `StageRender` (structure/stage.md) whose FFV1 alpha clip is overlaid like media. Media, window, shape and overlay layers are built by `src/compile/layers/*` and placed with
   `overlay=…:eof_action=pass:enable='gte(t,(start×rate−½)/R)*lt(t,(end×rate−½)/R)'` (R = fps × rate; `t` because ffmpeg 6.1's overlay miscounts `n`); each layer stream starts at t=0 and is shifted with
   `setpts=PTS-STARTPTS+start/TB`, so delayed layers show their first frame at their start. Screen/add overlays use `blend` on gbrp.
3. Consecutive text layers form one run → one ASS file (`src/compile/text/*`) applied at that position, so a later shape can cover text.
4. Scene effects (`src/compile/effects/*`), motion blur last (`tmix` then `fps` back to the timeline rate).
5. `trim=end_frame=renderFrames`, `format=yuv420p`. Non-final segments render 2 spare tail frames for the next transition.

## Motion

Camera moves use `perspective` on a 2× oversampled canvas (sub-pixel smooth; measured jitter 0.004 px vs 0.29 px for zoompan). Key
interpolation is a flat sum of eased segments over the input frame number `in`. Zoom below 1 fits the source at base size onto an
expanded background canvas and rescales keys to ≥ 1; the expanded canvas is capped at 8192 px (oversample drops to 1 above that).

## Joins

Custom transitions `zoomfrom` (next scene rescaled into a rect that grows to the frame) and `iris` (circle from a point) are `xfade=transition=custom` expressions built by `src/compile/transitions.ts` on `gbrp` input: progress is `1 − P` (ffmpeg's `P` runs 1 → 0), resampling selects `b0/b1/b2` by `PLANE`, and the expression uses no `st()/ld()` registers because xfade's slice threads share them. `JoinStep.spec` keeps the definition (geometry scaled to the output) so preview rebuilds the same filter with its local offset.


Segment inputs are normalized (`fps, settb=AVTB, setpts=PTS-STARTPTS`). Before each step the accumulated stream is trimmed to
`start_i + T_i` frames; cuts use `concat`, transitions use `xfade=offset=start_i/fps:duration=T_i/fps` computed from the rational fps.
The runner rejects any step with `offset + duration > len(acc)` (xfade would silently drop the second clip).

## Escaping

Every value placed in a filter goes through `src/compile/escape.ts`: `escapeValue` (option + graph level), `escapePath` (forward slashes,
escaped drive colon), `quoteExpr` for expressions, `num` for numbers. Graphs are written to files and passed with `-/filter_complex`
(ffmpeg ≥ 7.1) or `-filter_complex_script`, which avoids shell quoting and the Windows command-line limit.

## Capability checks

`compileTimeline` requires libass when any text exists, `xfade` when a transition exists, `alphamerge` for windows, and every filter an
effect declares in `requires.filters`. A missing filter is an `E_CAPABILITY` error (exit 3); nothing falls back silently.
