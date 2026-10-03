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

After: import `componentTimingIssues` and append its results next to `kineticTimingIssues(r)`. The new pure validator iterates resolved scene layers, selects field/bars/ticker/chips, and uses existing time literal parsing with fps/beat context. Check nonempty spans, authored starts rounded exactly as compiler output anchors inside `[0, layer.endFrame-layer.startFrame)`, strictly increasing field typing starts in authored seconds (distinct starts may quantize to one frame), and positive ticker interval. Field starts include typing, clear, mask, cursor at/click; bars/ticker delay and chips item at are layer-relative. Preserve simultaneous chips, zero glyph/stagger, fractional positive periods, and animations clipped by the scene cut. Do not demand generated last glyph/row/ticker completion inside the span.

Return existing `ValidationIssue {path,code,message}` objects with precise authored paths and stable component-specific codes. New fields/enums: none; errors flow validateTimeline -> existing CLI validation envelope without serialization changes.

Tests: empty span, start exactly at end rejected, one frame before end accepted, just-before-end timestamp rounding to the end rejected, delayed layer semantics, beat/rational fps, unordered typing, zero interval rejected versus positive subframe ticker interval accepted before rounding, simultaneous chips and intentional cutoff accepted. Direct `validateTimeline` tests plus CLI negative smoke prove reachability.

## QA worker: MODIFY existing stage scan, NEW safety regression

Files: `src/qa/checks.ts`, `src/qa/stage-safe.test.ts`.

Before: `stageContrast()` compiles `stageTextBoxes(t)` and emits only contrast warnings; ordinary text has a separate 5% title-safe test.

After: compute stage boxes once, evaluate their scaled bounds against the same 5% margins, and emit existing `text_safe`/`TEXT_SAFE` warning with the sampled absolute time. Perform geometry checks before any color-parser continue, then retain existing contrast sampling/thresholds. Keep full box geometry and parent transforms supplied by stageTextBoxes; use output scale exactly once. No report version/check-name/waiver/exit change.

Tests: unsafe kinetic text, centered safe text, parent-translated stage text, delayed absolute sample time, proxy dimensions, and waiver behavior where applicable. Use real ffmpeg for observable report behavior. Document that first fully opaque hold sampling is not full trajectory, overlap or geometric-settling proof.

## Main integration and acceptance

MODIFY `structure/stage.md`, `structure/timeline.md`, `structure/qa.md` with actual contracts and coverage limits. Main owns those docs and devlog. Workers may read adjacent owners but write only assigned files; no git, package, schema or shared doc writes.

Run new tests and existing stage/component/kinetic/QA suites, typecheck and lint. Render an original compact kinetic/component fixture with real ffmpeg, inspect entrance/hold/cut frames. No generated media committed. Validation is runtime enforcement at authored input (direct internal compiler calls can bypass it); QA is an opt-in sampled warning, bypassed when not invoked, with unsampled-motion residual. Final universal layout enforcement: none.

## P revalidation and baseline

Previous D: roadmap locked, runtime unchanged; continue D1-D3. At 283969b the owning signatures still match. Main independently rendered the 45ms field fixture: decoded frame 9 already displays all ten digits, while the authored cumulative onset is frame 12. Uncommitted evidence: `.tmp/motion-harness/before.mp4`, `before-frame9.png`, `before-render.json`. Actual CLI `validate` returned ok/empty issues for zero ticker interval and chip at 2s in a 2s layer. These are the reachable negative cases to reverse.

Motion P architect `01a1021b-9299-7d41-8c69-62cd7b60fedb`: main accepts D1, D2 frame-vs-seconds clock clarification and near-end rounding negative, D3 geometry-before-color clarification. No production changes since roadmap; reflection returned ALIGNED; independent A reviewer returned VERDICT: PASS with no blockers. Main additionally rendered unsafe stage text and confirmed baseline QA incorrectly reports text_safe pass with no issues (`.tmp/motion-harness/unsafe-before-qa.json`).

## C evidence

- Timing worker: 24 failing regressions before patch -> 24 passing; affected suites 41/41. Validation worker: 20 failed/4 passed before patch -> 34/34 with adjacent validation. QA worker: 5 failed/1 passed before patch -> 11/11 with adjacent QA. Full command transcripts are uncommitted `.tmp/motion-harness/{timing,validation,qa}-evidence.txt`.
- Main independent runs: compiler/preset/QA set 52/52, validator/kinetic-validation set 34/34; npm run typecheck and npm run lint exit 0. Initial concurrent typecheck caught TS2532 in a new test, fixed by the owning worker before the final pass.
- Main real CLI matrix: absent/malformed/unknown flag, zero ticker, late chip all exit 2 with one JSON object; valid repeated invocation and version exit 0; unsafe stage text warns, time waiver retains waived evidence. Ten scenarios pass; QA receipt validator passes.
- Main decoded and viewed `after-frame9.png` (eight digits) and `after-frame12.png` (ten digits), compared against `before-frame9.png` (ten digits). Rendering used the same 640x360/30fps fixture and --no-cache. This proves the visible cumulative-timing correction, not only changed metadata.
- Source clarification: scene boundaries use half-down ties, unlike ordinary anchors; independently checked resolve.ts:22 after questioning the cumulative-quantization test. Test oracle was retained and its explanation corrected.

Remaining limit: sampled first-opaque-hold safety does not measure every motion state, overlap or actual spring settling. The next authoring cycle will teach boundary and hold inspection and ship a repeatable offline study. Independent C review is required before this cycle closes.

Exact main verification commands (all exit 0):

```sh
node --test src/compile/layers/components-timing.test.ts src/compile/layers/kinetic.test.ts src/stage/presets/components.test.ts src/stage/presets/kinetic.test.ts src/qa/stage-safe.test.ts src/qa/stage-contrast.test.ts src/qa/run.test.ts
npm run typecheck
npm run lint
node --test src/timeline/validate-components.test.ts src/timeline/validate.test.ts src/timeline/validate-kinetic.test.ts
python3 .tmp/motion-harness/cli-check.py
node src/cli/index.ts render .tmp/motion-harness/timing.json --no-cache -o .tmp/motion-harness/after.mp4 --json
ffmpeg -v error -y -i .tmp/motion-harness/after.mp4 -vf 'select=eq(n\,9)' -frames:v 1 -update 1 .tmp/motion-harness/after-frame9.png
ffmpeg -v error -y -i .tmp/motion-harness/after.mp4 -vf 'select=eq(n\,12)' -frames:v 1 -update 1 .tmp/motion-harness/after-frame12.png
```

Independent C reviewer `01a10228-75b9-7f53-ae18-0e6815aa9bd7` reviewed all 12 scoped files, reran the three new suites with `VID2_REQUIRE_FFMPEG=1` (54/54, no skips), and returned VERDICT: PASS, no blockers. `npm run build` also passed. D conclusion: D1-D3 are implemented and verified; next cycle consumes 020_authoring.md. No new effects or complete trajectory analysis are claimed.
