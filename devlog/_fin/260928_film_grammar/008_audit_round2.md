# Adversarial roadmap audit, round 2: film grammar (PABCD A)

Target: `devlog/_plan/260928_film_grammar/` at HEAD `13a0e45a067c009f08c071caa7acd56eec2f7c7e` (remote `lidge-ai/vid2-gen` main is the same SHA per `git ls-remote`). Read-only: no repository file was modified. Scratch media for the palette experiment lives under `/tmp/vid2-research/b8/`. Amendment precedence (000:42–44) is applied: the audit-round sections govern over earlier body text.

## Verifiers rerun

| Command | Result | Observes |
|---|---|---|
| `npm run lint` | exit 0 | Whole tree including untracked `examples/opencodex-*`; `HALF` is gone from `examples/opencodex-mix/music/gen-song.mjs`. `eslint.config.js:6` still has no `examples/opencodex-*` ignore (that lands in WP6). |
| FFmpeg 9.0.2, exact B8 swatch graph (n = 3, 4, 6) | builds; paletteuse accepts it | See B8 below for the measured ΔE numbers. |
| `git ls-remote https://github.com/lidge-ai/vid2-gen.git main` | `13a0e45a…` = HEAD | Confirms the release gate premise today. `git remote -v` in this checkout points `origin`/`fml09` at **ima2-gen**, and the branch `codex/vid2-gen` has no upstream. |

Round 1 verifier results (typecheck 0, unit 239 pass / 5 skip, skills:check 0) are unchanged by the doc-only amendments and were not repeated. No code change exists yet, so none of these verifiers observes a planned change target; the accept tests named in each decade doc are the future observers.

## Round 1 blocker closure

| # | Round 1 blocker | Amendment | Status against docs and code |
|---|---|---|---|
| 1 | referenceImages chain | 040 "audit round 1" B1 | **Partly closed.** Chain is now enumerated end to end (provider type → requestFor → hash → ima2 argv → CLI `--ref`), with order, byte-change and cache tests. But the hashing step is placed in `normalizeAssetOptions`, which is synchronous (`src/assets/manifest.ts:13`) and whose output is the provider's option object (`src/assets/resolve.ts:27,42`). New blocker 1. |
| 2 | hold math and plan replay | 040 B2 | **Closed.** Formula now accounts for `in`, `out` and speed (5 s clip, in 4 s, span 2 s → 1 s held). Computing after `materializeSources` (`plan-shared.ts:32`) and `resolveTimeline` (:35) is feasible; `RenderPlan.warnings` survives JSON replay because `loadPlanOrTimeline` spreads `raw` (:53). Residual detail in blocker 5. |
| 3 | stale pretrim cut | 010 B3 | **Closed.** Key uses `hashFile` content identity (same helper as `segmentCacheKey`, `src/render/cache.ts:13–25`); frame-count check and a same-size, restored-mtime regression test are specified. |
| 4 | HUD-only timeline unreachable | 030 B4 | **Closed for dispatch**: both `validate.ts:43` and the `plan.ts:75` early return are named, and `renderPlan` materializes all stage clips (`runner.ts:209`), so a post-only HUD stage renders. The new test fixture is internally inconsistent: new blocker 3. |
| 5 | long-HUD fallback compositing | 030 B5 | **Closed** (absolute-time chunks, composited post-join, tested with forced 2 s chunks). Reachability note in blocker 10. |
| 6 | release phase not diff-level | 050 rewrite | **Closed structurally** (file/action map, gates, stop conditions). Wrong-repository risk in one gate: new blocker 4. |
| 7 | red lint gate | 000:32, 050:10, example fixed | **Closed** (lint exit 0 now). Ordering residual in blocker 8. |
| 8 | riso palette contract | 030 B8 | **Closed.** The 256×1 in-graph swatch works for n = 3, 4, 6 (odd widths fine). Sampling point unspecified: blocker 6. |
| 9 | camera failure branch | 010 B9 | **Not closed.** Tolerances are now numeric, but the failure fixture does not reach the error branch with current grouping: new blocker 2. |
| 10 | contact-sheet labels | 020 B10 | **Closed.** `src/analyze/sheet.ts` NEW, `textMask` exists (`src/stage/raster.ts:81`), 41-shot / 2-page test with nonblank label pixels. Cosmetic: "cell 40 → page 2 cell 0" mixes 1-based pages with 0-based cells; pick one base in the test. |

## Grounding spot check (round 2, 24 anchors, all exist)

`normalizeAssetOptions`/`requestHash` manifest.ts:13–35; `materializeRequest` manifest.ts:86; `requestFor` resolve.ts:22–46; `assets gen` assets.ts:47–83, options :95–103; `planFromTimeline` plan-shared.ts:24–44, plan replay :47–65; `segmentCacheKey` cache.ts:13–26; `hashFile` shared/hash.ts:8; `checkReferences` root overlay loop validate.ts:43; `checkCapabilities` plan.ts:50–59; `overlayOps` plan.ts:61–68; `postPlan` plan.ts:70–87; `compileTimeline` stages map plan.ts:95, `stageRenders` :114; `STAGE_FAMILY` segment.ts:20; `compileSegment` segment.ts:109; `sourceInput` media.ts:37; `prepareMedia` media.ts:76; `resolveTimeline` resolve.ts:153; `transition` resolve.ts:126; `onsetTimes` audio/beats.ts:49 (moved from round 1's 45; the docs cite no line); `runQa` qa/run.ts:26; `TextNode.counter` stage/types.ts:51 with `toFixed(c.decimals)` scene.ts:102; camera `groupsFor` camera.ts:58–73; camera `hold` schema.ts:44; `renderPlan` stage materialization runner.ts:209, render manifest :218–220; render envelope warnings render.ts:45. Missing: `secondsToFrames` (used in the 010 diff) exists nowhere in `src/` (blocker 9).

## Field chains (PLAN-FIELD-CHAIN-01) after amendments

| Field | Chain | Status |
|---|---|---|
| `bar` unit | literal → schema/JSON schema → `toSeconds`/`toFrames` → resolved frames → plan | Complete. Compiled plans hold frames; the authored guard is N/A on `.plan.json`. |
| root `look` | schema → resolved → `postPlan` → PostPlan in plan JSON → runner `finalEncode` (runner.ts:177) | Complete; ir.ts (PostPlan) named in G-10. |
| `hud` overlay | schema union → validate (separate HUD check) → resolved absolute span → stage spec in `stages` → `stageRenders` → `renderPlan` materializes all stages → post graph | Complete. Capability gap: blocker 7. |
| `InputSpec.pretrim` | `sourceInput` → segment inputs → plan JSON → runner substitution, content-hash key | Complete. |
| `referenceImages` | authored options (schema is `z.record`, schema.ts:30, so no schema change needed) → `requestFor` → hash → manifest entry → ima2 argv; direct CLI `--ref` | Enumerated, but hash step location wrong and manifest-entry recording (`ima2.ts:168` records only `seedImageSha`) not named: blocker 1. |
| `RenderPlan.warnings` (new, B2) | planFromTimeline → plan JSON → replay → runner → `<out>.render.json` | Complete apart from the old-plan default: blocker 5. |

## Guards and activation (PLAN-BYPASS-NAMED-01 / C-ACTIVATION-GROUNDING-01)

| Guard | Activation fixture | Reachable? |
|---|---|---|
| pretrim content identity | overwrite + `utimes` restore | Yes |
| camera tolerance → E_INPUT | 120 events, opposite corners, every 2 frames, `hold:"0s"` | **No with current grouping** (blocker 2) |
| camera expression ≤ 20,000 chars | 200-event trace | Yes |
| HUD-only dispatch | root overlay `{type:"hud"}` only | Yes, but the assertion fails as written (blocker 3) |
| HUD fallback chunks | forced 2 s chunk size | Only if the knob ships regardless of the benchmark (blocker 10) |
| riso ΔE metric | isolated palette stage, 2,000 seeded samples | Yes, if sampled before encoding (blocker 6) |
| ref/seed exclusivity, ref order/bytes | refs [A,B] vs [B,A], edit A | Yes once the hash location is fixed (blocker 1) |
| hold warning replay | `.plan.json` replay | Yes |
| release remote/CI | ls-remote parent check, `gh run watch` | Parent check yes; CI watch targets the wrong repo by default (blocker 4) |

## Risky claims rechecked

- **In-graph paletteuse swatch (B8):** verified locally. `color=c=<hex>:s=<k>x1:d=1` × n → `hstack` → `format=rgb24,trim=end_frame=1` → `paletteuse=dither=bayer:bayer_scale=2:new=0` renders for n = 3 (86+85+85), 4 and 6 (46+42×5). Output on a seeded 4-color gradient: raw rgb24 100 % exact palette colors. After libx264 yuv420p CRF 18 re-decode, within ΔE2000 ≤ 6 of a color or sRGB 50 % mix: n=4 96.0 %, n=3 97.4 %, n=6 **95.2 %**. The 95 % gate passes only narrowly once chroma subsampling blends the dither.
- **Drawtext-free labels:** `textMask` is available; B10 closes it.
- **FFV1 pretrim equivalence:** B3 adds content identity and a ±1 frame-count check. The VFR source and PTS-origin residual from round 1 remains an implementation-phase test obligation ("expected frame count" needs a defined source fps for VFR inputs). Recorded as residual, not a blocker.

## Numbered blockers

1. **Medium: 040_generated_clips.md, "Amendments from audit round 1", B1.** `normalizeAssetOptions` is synchronous (manifest.ts:13) and cannot read image bytes. Its return value is the provider's option object (resolve.ts:27,42; assets.ts:70 via `provider.normalize`), so swapping paths for hashes there would strip the paths that `ima2.ts` needs for `--ref`. Fix: mirror the `seedImage` pattern. Keep `referenceImages` paths in options. Hash bytes in `requestFor` and in `generateOne`. Add `referenceImagesSha?: string[]` to `AssetRequestKey` and `GenerateRequest`. Have `requestHash` delete `referenceImages` and include the ordered SHA list. Record it in the manifest entry next to `seedImageSha` (ima2.ts:168). Define missing-ref behavior in `status` mode, mirroring `seedMissing` (resolve.ts:34–37).
2. **Medium: 010_timing_and_render.md, "Amendments from audit round 1", B9 (and file map line 19).** The failure fixture cannot activate E_INPUT with current grouping. `groupsFor` merges any action within `merge ?? 0.7 s` of the previous one, or overlapping it (camera.ts:60–66). Events two frames apart all collapse into one union-rect group, the path is almost static, and simplification succeeds. Fix: either state the grouping change exactly (for example "`mergeFrames = frameCount(hold)`, replacing the 0.7 s default") with a unit test for it, or respace the fixture past the merge window (for example 30 non-overlapping corner groups 1 s apart) and assert that the dense path breaches 1.5 % width before simplification.
3. **Medium: 030_looks_hud_grammar.md, "Amendments from audit round 1", B4 test (and accept 3).** The counter default is `decimals=0` (G-11), and today's evaluator formats with `toFixed(decimals)` (scene.ts:102), so 99.9 renders as "100". The key `at:"3s"` on a 3 s timeline sits at the exclusive span end. The last frame is 89/30 = 2.967 s, where linear interpolation gives about 99.1, and a "within span" check may reject the key outright. Fix: set `decimals:1`; place the last key at the last frame time, or assert the evaluator at t = 3 s separately; state whether HUD spans are half-open.
4. **Medium: 050_release.md, "Gates" 4–5.** In this checkout `origin` is `lidge-ai/ima2-gen` and `codex/vid2-gen` has no upstream. A bare `gh run watch` resolves the repo from git remotes and could follow an ima2-gen run, a possible false green. `gh release create v0.3.0` without `--target`/`--verify-tag` creates the tag at whatever the default-branch head is when it runs. The two release assets have no stated source path or poster command. Fix: `gh run list/watch -R lidge-ai/vid2-gen --commit <sha>`. Annotate the tag, push it by explicit URL, then run `gh release create … --verify-tag` (as in 0.2.0, `_fin/260928_kinetic_stage/060_release.md:15`). Name the film's output path and the poster extraction command.
5. **Low: 040 B2.** 0.2 `.plan.json` files lack `warnings`. Add `warnings: raw.warnings ?? []` at plan-shared.ts:53 and a 0.2-plan replay test. Also state that render.ts:45 must not append the same hold warnings twice (PlanLoad.warnings plus runner copy).
6. **Low: 030 B8.** Specify that the ΔE sample comes from rgb24 rawvideo or PNG output of the post graph before the yuv420p encode (measured margin after encode is 0.2–2.4 points). Define the 50 % mix color space (sRGB average was used here).
7. **Low: 030 file map / B4.** `checkCapabilities` requires ffv1 only for `STAGE_FAMILY` types (plan.ts:57, segment.ts:20), and "hud" is not in that set. A HUD-only timeline on an ffmpeg without ffv1 fails at render instead of E_CAPABILITY. Fix: include "hud" in the stage capability check and add it to the B4 test matrix.
8. **Low: 000_plan.md "Verification strategy" line 32; 050 file map line 10.** The `examples/opencodex-*/**` ESLint ignore is scheduled for WP6, but WP2–WP5 D gates already run `npm run lint` over those untracked, actively edited studies. Fix: move the `eslint.config.js` change into WP2's file map.
9. **Low: 010 "Key diffs".** The diff calls `secondsToFrames` and a `seconds()` helper in resolve.ts; neither exists (only `framesToSeconds`/`toFrames`). Add them as NEW exports in the file map. Body tables escape their backticks with a backslash, so code spans render as literal text; fix when P consolidates the amendments.
10. **Low: 030 G-11 / B5.** The fallback is conditional on a one-time benchmark, while the B5 test forces it. State that chunked HUD rendering ships with an internal chunk-length setting (default ≤ 20 s) whatever the benchmark shows, so the forced test has code to exercise.

## Disposition

No High blockers remain. Round 1 blockers 2–8 and 10 are closed; 1 is partly closed (blocker 1) and 9 is not (blocker 2). Blockers 1–4 (Medium) should be corrected in the decade docs before WP B of their phases; 5–10 (Low) can be folded into each phase's P consolidation.

VERDICT: GO-WITH-FIXES (blockers=10)

