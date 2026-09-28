# 040 — Transitions and sound from motion (wp4, part 2)

**Summary.** Two transitions complete the "app opens" and "iris" moments: `zoomfrom` grows the next scene out of a rounded rectangle
(e.g. a dock icon's rect) and `iris` opens a circle from any point. Both are `xfade=transition=custom` expressions built by one shared
function used by joins and preview. Sound follows motion: stage presets emit events (glyph typed, icon popped, click, bar grow, state
change), and `audio.autoCues: true` turns them — plus transitions — into SFX cues with density caps.

## Transitions

- Schema: `Transition` gains optional `rect:{x,y,width,height,radius}` (required for `zoomfrom`) and `center:{x,y}` (`iris`, default
  frame centre). Relational validation rejects `rect` on other types.
- Chain: `resolve.ts:126` `transitionOut` keeps `rect`/`center` (scaled nowhere; authored px) → `ResolvedScene.transitionOut` type →
  `plan.ts` passes them to `planJoin` → `joins.ts` `JoinTransition` gains the optional geometry and scales it by `output.scale` for
  proxy → `transitionChain` builds the statements.
- Pixel format: custom steps wrap their inputs: `[left]format=gbrp[l];[right]format=gbrp[r];[l][r]xfade=...,format=yuv420p`. The
  wrapping is emitted by `transitionChain` (the normalization at `joins.ts:39` stays yuv420p for built-in steps).
- `src/compile/transitions.ts` (new): `transitionChain` (below) emits a single `xfade=transition=<name>` for built-in names and the
  custom expression for `zoomfrom`/`iris`: progress eased with smoothstep; for `zoomfrom` the target rect interpolates from the source
  rect to the full frame, pixels inside the (rounded) rect sample `b` rescaled into it, pixels outside sample `a`; the inputs are
  converted to `gbrp` before the xfade so every plane has full size, then back to `yuv420p`.
- `JoinStep` gains `spec?: {type, rect?, center?, width, height}` (the transition *definition*, geometry already scaled to the output).
  `src/compile/transitions.ts` exports `transitionChain(spec, {duration, offset}, labels: {a, b, out}): string[]` returning labelled
  filter statements (gbrp wrapping for custom types, a single `xfade` for built-ins). `joins.ts` calls it with the global offset;
  `preview.ts` `sourceGraph` calls it with its local offset (`(first.frames − step.frames)/fps`, today `preview.ts:50`) instead of
  hard-coding `xfade=transition=${step.transition}` (`preview.ts:53`). 0.1 plans without `spec` build `{type: step.transition}`.

## Auto SFX

- `StageEvent.kind`: `glyph`, `token`, `icon`, `click`, `grow`, `state`, `tick`; the compiler converts them to absolute frames.
- Chain: `materialize` is not needed for events: the preset compiler emits `StageEvent` frames at compile time. `compile/layers/stage.ts`
  pushes them, converted to absolute output frames as `layer.absoluteStartFrame + Math.round(event.frame / ctx.rate)` (stage frames are at fps × `ctx.rate`, `ir.ts:47`; round half up), into `BuildContext.stageEvents`;
  `plan.ts` collects them across segments and passes `stageEvents` to `buildAudioPlan(t, dir, path, stageEvents)` (`audio-plan.ts:146`).
- `src/audio/cues.ts` `autoCues` input gains `stageEvents`; mapping: glyph→`type` (−6 dB, at most one per 55 ms), icon→`pop`,
  click→`click`, grow→`riser` anchored to end, state→`swoosh-up` when ≥ 3 tokens move; transitions of ≥ 0.3 s → `whoosh` at the
  midpoint. New cross-list precedence in `audio-plan.ts`: an auto cue within 80 ms of an authored cue is dropped (today's dedupe in
  `cues.ts:43` only compares auto cues with each other).
- Cap: at most 10 auto cues per second per preset; gains reduced 3 dB when music is present.

## Acceptance

1. `zoomfrom` with rect (860,480,200,120): at P = 0.5 the frame centre pixel equals B's centre and a pixel far outside the interpolated
   rect equals A (two solid-colour scenes, tolerance 4); preview of a frame inside the transition equals the full render's frame.
2. `iris` centred at (200,200): at mid-transition (210,210) is B and (1700,900) is A.
3. `autoCues` with a kinetic `type` layer of 20 glyphs at 0.035 s produces ≤ 20 cues spaced ≥ 55 ms; the audio plan contains
   `sfx-type`; disabling `autoCues` removes them.
4. A transition of 0.5 s produces one `whoosh` cue at its midpoint sample ±1 frame.
5. Stage events in scene 2 of a timeline whose scene 1 has a 0.5 s transition, with scene 2 carrying `motionblur` (rate 3), land at
   scene 2's absolute start (overlap subtracted) + round(event stage frame / 3), ±1 frame; an authored cue 40 ms from an auto cue suppresses the auto cue.
6. `zoomfrom` in proxy profile: the rect is scaled by 0.5 (probe pixel at the scaled rect centre at P=0.05 equals B).
7. Preview of a frame inside a `zoomfrom` between scenes 2 and 3 (three-scene timeline, scene 1→2 is a 0.4 s fade) equals the full
   render's frame at the same absolute time (mean abs diff ≤ 2).

## wp4 P revalidation (2026-09-28)

Previous D (wp3): kinetic typography verified (268 tests); direction unchanged: add the UI components, custom transitions and sound
from motion, then dogfood. Source facts checked at P:

- `xfade=transition=custom` (local ffmpeg 8.0.1): `P` runs **1 → 0** across the transition, so progress is `q = 1 − P`; on `gbrp`
  input `b0()` samples plane 0 only, so a resampling expression must select `b0/b1/b2` (and `a0/a1/a2`) by `PLANE` — verified with a
  left-to-right grow test (`/tmp/xf2.mjs`: frames 6–15 show B advancing one third per 3 frames).
- `src/audio/cues.ts` `autoCues` already places a `whoosh` at every non-cut transition midpoint (and `impact` for `fadewhite`), so 040's
  transition cue exists; wp4 adds stage events, density caps and authored-cue precedence only.
- `src/qa/checks.ts:90` `textIssues` iterates `text` layers only; QA receives a `ResolvedTimeline`, not a plan.

Implementation decisions:

- **Renderer counters**: `TextNode.counter {from, to, start, end, decimals, prefix, suffix}` (stage frames), evaluated like `scramble`,
  gives the bars' count-up without per-number nodes. Eased with `out`.
- **Presets** in `src/stage/presets/{style,field,bars,ticker,chips}.ts` on the same `SpecBuilder`; cursors (I-beam, arrow, hand) are
  24×24 paths in `src/stage/icons/cursors.ts`. Connectors are icon nodes whose path is drawn in node pixels (size 24 ⇒ scale 1) with a
  `progress` track; the travelling dot is a small rect keyed along the same polyline.
- **Schemas** in `src/timeline/components-schema.ts` (field, bars, ticker, chips) joined to `Layer`; compile wiring in
  `src/compile/layers/components.ts`; all four are in `STAGE_FAMILY` already.
- **Transitions**: `src/compile/transitions.ts` `transitionChain(spec, {duration, offset}, labels)` emits built-ins unchanged and, for
  `zoomfrom`/`iris`, `format=gbrp` on both inputs, the custom expression (smoothstep of q; rounded-rect or circle test; plane-selected
  resampling of B into the growing rect), then `format=yuv420p`. `TRANSITIONS` gains `zoomfrom` and `iris`; `Transition` gains
  `rect`/`center`; resolve and `JoinTransition` carry them; `JoinStep.spec` stores the definition; preview rebuilds with its local offset.
- **Auto SFX**: `AutoCueInput.stageEvents {atSample, kind}` from `BuildContext.stageEvents` (absolute frames) through `compileTimeline` →
  `buildAudioPlan(t, opts, stageEvents)`; mapping glyph→type, token→none, icon→pop, click→click, grow→riser (end-anchored), state→
  swoosh-up, tick→click at −6 dB; per-preset minimum spacing 55 ms and at most 10 per second; auto cues within 80 ms of an authored cue
  are dropped in `audio-plan.ts`.
- **QA contrast for stage text**: `src/compile/layers/stage-text.ts` `stageTextBoxes(t, baseDir)` compiles each stage-family layer with a
  scale-1 context into its spec and evaluates text nodes at their settle frame through `frameItems`, returning absolute frame, box and
  colour; `checks.ts` samples the background just outside each box (threshold 4.5 under 40 px, 3 above; severity warn).

wp4 tasks: t1 counter + cursors + style; t2 field; t3 bars; t4 ticker; t5 chips; t6 schemas/validation/compile wiring; t7 transitions
(schema chain, builder, joins, preview); t8 auto SFX chain; t9 QA stage contrast; t10 tests for 030 #1–5 and 040 #1–7; t11 docs.

Reflection (architect 01a0e4f2, wp4): MISALIGNED, 5 gaps, all accepted: (1) collected stage events carry `source` (the stage render id)
and caps apply per source: ≥ 55 ms spacing and a rolling window of at most 10 cues per second; (2) kinetic `grow` is emitted at the
expand's settle time (`settleTime(critical move spring)`) so the end-anchored riser lands when the plate fills — test measures the riser
anchor sample against the settle frame; (3) the transition whoosh keeps the existing every-non-cut-transition policy (the 0.3 s
threshold in 040 is dropped; acceptance 4 unchanged); (4) connectors use a new `path` stage node: SVG path data in node pixels with
explicit `width`/`height` bounds, `strokeWidth`, `color`, `progress` (the icon node keeps its 24×24 contract); (5) QA resolves fonts
with a scratch work directory under `cacheDir("qa-fonts")` (the resolver copies into it; the authored files are never touched).

Audit wp4 round 1 (reviewer 01a0e4fa): FAIL, 1 plan blocker — the solid-colour acceptance could not tell rescaling from a plain mask.
Folded: acceptance 1 now uses a patterned scene B (four quadrants: red, green, blue, white, split at the frame centre) and asserts at
mid-transition (q = 0.5 after smoothstep ⇒ the rect is halfway between the source rect and the frame) that a point inside the rect but
left of its centre shows B's **left** quadrant colour and a point right of centre shows B's **right** colour, while those same canvas
points in B itself (mask-only reveal) would show the opposite quadrant for at least one of them; a point outside the rect equals A.
Round 2 **FAIL** (a centred source rect keeps every interpolated rect centred, so quadrant colours cannot separate rescale from mask).
Folded with an off-centre source rect: `rect (200,150,200,120)` on 1920×1080. At q = 0.5 the rect is x 100…1160, y 75…675
(halfway to the frame; corrected in audit round 3: y 75…675). Canvas point (900, 300) lies inside it; rescaled, it samples B at
((900−100)/1060·1920, (300−75)/600·1080) = (1449, 405) → B's **top-right** quadrant; a mask-only reveal would show B at (900, 300) → **top-left**. Canvas point (1500, 900) lies
outside the rect → A. The test asserts all three.
