# Motion timing, validation and sampled title-safe QA

Depends on: docs-only roadmap. C3 implementation; release/public compatibility reviewed at C4 depth.

## Compiler worker: MODIFY existing time conversion, NEW focused regression tests

Files: `src/compile/layers/components.ts`, `src/compile/layers/kinetic.ts`, `src/compile/layers/components-timing.test.ts`.

Before: field glyph uses `seconds(t.glyph, ctx) || 0.045`; bars stagger, ticker interval, kinetic enter stagger and highlight sweep also use output-frame-quantized `seconds()`.

After: use the existing `toSeconds(parseTimeLiteral(value), ctx)` for repeated durations. Preserve existing `seconds()` for absolute anchors and nonrepeated durations. Reuse the existing kinetic glyphStagger conversion, avoid a new shared utility. `SpecBuilder.frame()` rounds each cumulative timestamp on the final stage clock. Explicit zero field glyph means simultaneous reveal; zero must not silently become a default.

Regression cases: 45ms field glyph interval (10th glyph at frame 12 for 30fps with zero anchor), 110ms stagger, beat-based intervals, 30/60/rational fps, and one motion-blur stage rate. Expectations use hand-derived cumulative timestamps, never compiler helpers as the oracle. Also test zero glyph simultaneous reveal and positive 5ms glyph periods at 30fps. Confirm red before patch and green after; exercise compiled track/event values rather than private conversion only.

## Validation worker: NEW owner and tests, MODIFY wiring

Files: `src/timeline/validate-components.ts`, `src/timeline/validate-components.test.ts`, `src/timeline/validate.ts`.

Before `checkResolved`: only kinetic-specific timing is added before the scene loop.

After: import `componentTimingIssues` and append its results next to `kineticTimingIssues(r)`. The new pure validator iterates resolved scene layers, selects field/bars/ticker/chips, and uses existing time literal parsing with fps/beat context. Check nonempty spans, authored starts inside `[0, layer.endFrame-layer.startFrame)`, strictly increasing field typing starts in authored seconds (distinct starts may quantize to one frame), and positive ticker interval. Field starts include typing, clear, mask, cursor at/click; bars/ticker delay and chips item at are layer-relative. Preserve simultaneous chips, zero glyph/stagger, fractional positive periods, and animations clipped by the scene cut. Do not demand generated last glyph/row/ticker completion inside the span.

Return existing `ValidationIssue {path,code,message}` objects with precise authored paths and stable component-specific codes. New fields/enums: none; errors flow validateTimeline -> existing CLI validation envelope without serialization changes.

Tests: empty span, start exactly at end rejected, one frame before end accepted, delayed layer semantics, beat/rational fps, unordered typing, zero interval rejected versus positive subframe ticker interval accepted before rounding, simultaneous chips and intentional cutoff accepted. Direct `validateTimeline` tests plus CLI negative smoke prove reachability.

## QA worker: MODIFY existing stage scan, NEW safety regression

Files: `src/qa/checks.ts`, `src/qa/stage-safe.test.ts`.

Before: `stageContrast()` compiles `stageTextBoxes(t)` and emits only contrast warnings; ordinary text has a separate 5% title-safe test.

After: compute stage boxes once, evaluate their scaled bounds against the same 5% margins, and emit existing `text_safe`/`TEXT_SAFE` warning with the sampled absolute time. Then retain existing contrast sampling/thresholds. Keep full box geometry and parent transforms supplied by stageTextBoxes; use output scale exactly once. No report version/check-name/waiver/exit change.

Tests: unsafe kinetic text, centered safe text, parent-translated stage text, delayed absolute sample time, proxy dimensions, and waiver behavior where applicable. Use real ffmpeg for observable report behavior. Document that first fully opaque hold sampling is not full trajectory, overlap or geometric-settling proof.

## Main integration and acceptance

MODIFY `structure/stage.md`, `structure/timeline.md`, `structure/qa.md` with actual contracts and coverage limits. Main owns those docs and devlog. Workers may read adjacent owners but write only assigned files; no git, package, schema or shared doc writes.

Run new tests and existing stage/component/kinetic/QA suites, typecheck and lint. Render an original compact kinetic/component fixture with real ffmpeg, inspect entrance/hold/cut frames. No generated media committed. Validation is runtime enforcement at authored input (direct internal compiler calls can bypass it); QA is an opt-in sampled warning, bypassed when not invoked, with unsampled-motion residual. Final universal layout enforcement: none.
