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
