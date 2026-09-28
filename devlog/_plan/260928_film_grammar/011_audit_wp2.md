# wp2 A audit: 010_timing_and_render.md, consolidated contract and wp2 reflection

Scope: `devlog/_plan/260928_film_grammar/010_timing_and_render.md` lines 94–106 ("Consolidated contract for B") and 108–116 ("Amendments from wp2 reflection"), against HEAD `0b18b747`. That commit touches only devlog docs relative to `13a0e45a` (no change under src/, scripts/, tests/, package.json or eslint.config.js), so every code anchor below is current. Read-only for the repository; the scratch probe lives in `/tmp/vid2-research/wp2/expr.mts`.

Correction to my round 2 audit: its blocker 9 said `secondsToFrames` did not exist. That was wrong. It is exported at `src/shared/time.ts:28` and re-exported at `src/shared/index.ts:5`; my earlier search output was truncated by `head`. R2-9 in the doc is right.

## Grounding (all checked at 0b18b747)

| Contract claim | Code | Result |
|---|---|---|
| `TimeUnit`, `LITERAL`, `toFrames`, `BeatGrid.meter` | time.ts:5, :32, :54–60, :7; schema beat `meter` default 4 schema.ts:22; beat map meter resolve.ts:67 | Exists; bar needs no new beat field |
| primitives/schema regexes, preview token | primitives.ts:4, schema.ts:10, preview.ts:24 | Exists |
| scene loop, `transition()`, `frame()` | resolve.ts:166–179, :126–131, :17–19 | Exists; `scene.duration` is read only at :168 |
| existing transition_length issue (R7) | validate.ts:62–63 | Correct; a non-cut 0-frame transition is not rejected today |
| `sourceInput` capture and video branches, `prepareMedia` | media.ts:37–56, :76–91 | Exists; `tpad=stop_mode=clone` + `trim` (:84–85) already hold the last frame, so accept 2 can be reached |
| resolved `outSeconds` | resolve.ts:114 (media), :97–99 (capture) | Exists; no schema change needed for `out` |
| `InputSpec`, `inputRegistry` | ir.ts:27; segment.ts:31–41 (spread passes `pretrim` through, no dedupe) | Exists |
| renderSegment cache branch (R5) | runner.ts:79–87 hit, args built at :94 | The swap point exists between them |
| `--no-cache` | render.ts:22,38; runner.ts:22 | Exists |
| `cacheDir("pretrim")` | paths.ts:10 accepts any string | Exists |
| camera hold bug (R1) | decorate.ts:48 passes `hold` only when it is a number; schema default `"0.8s"` is a string (schema.ts:44); camera.ts:60/89 then use 0.7 s merge and 0.5 s hold | Confirmed |
| `cameraAt` shared by cursor (R3) | decorate.ts:33 | Exists |
| camera E_INPUT surfaces (R2) | `vid2 resolve` resolve.ts:19–20 and planFromTimeline decorate; `vid2 validate` validate.ts:21–25 never decorates | Correct |
| perspective expression | built in src/compile/motion.ts:62–80 at compile time | Exists, but missing from the consolidated file list (blocker 2) |
| docs, schema, tests | structure/{timeline,compiler,render,capture}.md, skills time.md/schema.md, CHANGELOG.md exist; `scripts/schema-json.mjs` writes schema/timeline.v1.json and `npm run build` copies it to the skills asset (skills-manifest.mjs:8–10; currently identical); resolve/validate/camera/decorate tests and tests/e2e/render.test.ts exist; time.test.ts, media.test.ts and pretrim.test.ts are new | Consistent |

## Reachability of conditional paths

| Path | Activation | Reachable? |
|---|---|---|
| `1bar` without a beat grid → E_SCHEMA | time.ts:57 already throws | Yes |
| non-cut transition quantizes to 0 frames | 0.01 s fade at 30 fps | **Depends on position** under the new formula: after a 1 s scene it gives 30 − round(29.7) = 0 (issue), after a 1.02 s scene 31 − round(30.3) = 1 (no issue). Blocker 4 |
| `out ≤ in`, `out` on image/color, read under one frame | validate on the resolved layer | Yes; formula ambiguity in blocker 5 |
| hold of the last frame after `out` | tpad clone (media.ts:84–85) | Yes |
| pretrim only for repeated paths; lock; atomic rename | three reads of one path in one segment | Yes |
| pretrim after a segment cache miss (R5) | runner.ts:82 branch | Yes |
| `--no-cache` recut | render option exists | Yes |
| camera > 24 keys → E_INPUT | 30 click groups 1 s apart, opposite corners | Yes. With merge = hold = 0.8 s (24 frames) the groups stay separate; single-click zoom 1.6 swings x between 0.3125 and 0.6875 of the frame; the spring (stiffness 200, damping 40, mass 2.25, ζ≈0.94) settles in about 0.5 s, so each swing needs its own keys |
| perspective expression > 20,000 → E_INPUT | 200-event trace must pass with ≤ 24 keys | **Contradictory**: measured below (blocker 1) |

Expression size, measured with the real `perspectiveFilters` at 1920×1080 with linear keys:

| keys | 2 | 4 | 6 | 8 | 10 | 12 | 16 | 24 |
|---|---|---|---|---|---|---|---|---|
| chars | 3,135 | 6,599 | 10,191 | 13,687 | 17,183 | **20,775** | 27,767 | **42,679** |

Each of the 8 corner arguments repeats the zoom expression three times plus one focus expression (motion.ts:56–74), so the cost is about 1,750 characters per key. The 20,000-character limit is hit at about 12 keys, well before the 24-key cap.

## Field chains

**`bar` unit.** Authored string → shared `TimeLiteral` (primitives.ts:4) and `SignedOffset` (schema.ts:10) → JSON schema (schema-json.mjs) → skills asset (npm run build) → `parseTimeLiteral` (time.ts:34) → consumers. The contract lists the `toFrames` path (resolve.ts, preview.ts) and `toSeconds`. Because the regex is shared, every time field gains `bar`, and several consumers skip `toFrames`:

- ass.ts:36–41 treats every unit other than s/f as beats, so `"1bar"` silently means one beat.
- kinetic.ts:37 treats every unit other than f as seconds, so `glyphStagger:"1bar"` silently means 1 s.
- motion.ts:16 (camera key `at`) and audio-plan.ts:73 call `toFrames` without the beat grid, so they fail with E_SCHEMA "beat units need a beat grid" even when the timeline has one.
- stage.ts:18, kinetic.ts:15 and text-raster.ts:22 pass `ctx.beat` and are correct.

Resolved and compiled plans store frames, so the chain ends at compile (N/A for `.plan.json`). See blocker 3.

**`InputSpec.pretrim`.** `sourceInput` creates it → `inputRegistry.add` spreads it → `compileSegment` prunes it to repeated paths → serialized into the plan (segment.inputs) → `loadPlanOrTimeline` spreads the raw plan (plan-shared.ts:53) → `segmentCacheKey` hashes it as part of `...input` (cache.ts:20; deterministic, originals still hashed) → `renderSegment` swaps it in after a cache miss. Old plans without `pretrim` render with the original args (old behavior, no `out` cap). The chain is complete; the old-plan residual is unnamed (blocker 6).

## Guards: tier, surface, bypass, residual

| Guard | Tier / surface | Bypass | Residual | Named in doc? |
|---|---|---|---|---|
| 0-frame non-cut transition | relational, validateTimeline (vid2 validate, compile, render, preview via planFromTimeline at preview.ts:58) | `.plan.json` replay | old plans keep old frames | No |
| `out ≤ in`, `out` on image/color, sub-frame read | relational, validateTimeline | `.plan.json`; a `generate` source of kind image with `out` passes `vid2 validate` (the authored type is `generate`) and fails only at the post-materialization validate (plan-shared.ts:33) | ffmpeg `-t` from old plans | No |
| camera > 24 keys / expression > 20,000 | post-decoration (decorate) and compile (motion.ts) | `vid2 validate` (named in R2); authored manual `camera:[…]` arrays are never capped | long graphs from manual keys | Partly |
| pretrim acceptance | runtime, pretrim.ts | `--no-cache` recuts (named) | VFR handled by the duration check (R4) | Yes |

## Verifiers

`npm run typecheck`, `npm run lint`, `npm test` (unit + tests/e2e via scripts/test.mjs) and `npm run skills:check` exist, as do `node scripts/schema-json.mjs` and the drift test. What they observe after B:

- resolve.test.ts observes cumulative placement.
- validate.test.ts observes the new issues.
- The drift test observes the regex/JSON schema pair.
- tests/e2e/render.test.ts observes pretrim with duplicate reads.
- decorate.test.ts and camera.test.ts observe hold/merge and the cap.
- lint observes the eslint ignore.

`skills:check` checks skill links and registry, not unit semantics. No verifier currently observes the ASS, kinetic or camera-key `bar` consumers. The code is unchanged since the last round, so the baseline gates were not rerun.

## Numbered blockers

1. **High: section "Consolidated contract", item 5, with "wp2 reflection" R3.** The 24-key cap and the 20,000-character bound conflict. Measured expression length is about 1,750 characters per key: 12 keys give 20,775 and 24 keys give 42,679. Any auto camera with 12 or more keys fails R3's expression check, so the ≤ 24-key test and the "200-event trace passes" criterion cannot both hold as written. Fix: pick one governing limit from measurement. Either set the key cap to what fits (≤ 10 keys at 1080p), or shrink the expression (for example, compute zoom and focus once per corner), or justify a higher character limit with a real ffmpeg limit. Then state that RDP loosens its tolerance, or that E_INPUT fires, when the limit is exceeded, and give the test fixture its expected key count.
2. **Medium: "Consolidated contract" item 5 and R2/R3.** The expression is built in `src/compile/motion.ts` (perspectiveFilters, :62–80) at compile time. Item 5 lists only decorate.ts and camera.ts, and R2 has `decorateCaptureLayers` throw, but decorate cannot measure the expression. Authored manual `camera:[…]` arrays use the same builder with no cap. Fix: add motion.ts (MODIFY) to item 5 with the length check and its error path. Either count keys in decorate against a precomputed per-key budget, or check in motion.ts with `details.path`. State whether manual arrays get the same bound, with a fix hint suited to manual keys.
3. **Medium: "Consolidated contract" item 1 (bar field chain).** The shared `TimeLiteral` regex exposes `bar` to every time field, and some consumers skip `toFrames`. ass.ts:36–41 would treat `"1bar"` as 1 beat, kinetic.ts:37 would treat `glyphStagger:"1bar"` as 1 s, and motion.ts:16 and audio-plan.ts:73 throw E_SCHEMA without the grid even when the timeline has one. Fix: list every `parseTimeLiteral` consumer (the rg list above) in item 1 and route each through `toSeconds`/`toFrames` with `ctx.beat`. Add tests: ASS `animationDuration:"1bar"` = meter beats, camera key `at:"1bar"` with a grid, glyphStagger in bar.
4. **Low: item 2 and accept 1b (line 76).** Transition frames now depend on position. The same 0.25 s fade at 30 fps becomes 7 or 8 frames depending on where it falls, and the 0.01 s activation fixture only yields 0 frames when the prior scene ends on a whole frame (after a 1.02 s scene it resolves to 1 frame). Fix: pin the fixture's first scene to "1s" and record the ±1-frame transition behavior in structure/timeline.md and the CHANGELOG entry from R1.
5. **Low: item 3.** "Reads shorter than one output frame" is ambiguous about before or after the 1 ms guard and about speed. Applied after the guard, it rejects an exact one-frame read (1/30 − 0.001 < 1/30). Fix: define the issue as `(out − in)/speed < 1/fps`, computed before the guard.
6. **Low: both sections (PLAN-BYPASS-NAMED-01).** The new validate rules have no bypass or residual lines. Fix: add the ledger rows above: `.plan.json` replay keeps old frames and uncapped reads by design; `generate` sources of kind image with `out` pass `vid2 validate` and fail at compile; manual camera arrays (blocker 2).
7. **Low: "Tests … Gates" line 106.** AGENTS.md checks include `npm run build` and `npm run privacy:scan`; the D gate list omits both, although item 7 needs build to refresh the skills schema asset. Fix: add both to the wp2 gates.
8. **Low: item 4.** FFV1 cuts in `cacheDir("pretrim")` grow without limit, and no cache prune command exists in src/cli. Fix: state a size or age policy, or document the manual cleanup path in structure/render.md.
9. **Low: consolidation hygiene.** Item 4's "frame-count check (expected ±1)" is replaced by R4's duration check. Item 5's test drops R2-2's dense-path breach pre-check. Neither section says that a `"2bar"` position means the start of bar 3 (plus offset), while `{bar:2, beat:1}` means the start of bar 2. Fix: fold R1–R7 into items 1–7 before B and add the `bar`-unit versus `BarRef` note to skills time.md.

VERDICT: GO-WITH-FIXES (blockers=9)
