# 000 — Kinetic stage roadmap (master plan)

**Summary.** Make vid2 able to produce launch films with the look of the Aside launch video (001): kinetic typography, magic-move
reflow, inline icons, rebuilt UI components, "app opens" transitions and sound that follows motion. The core is a deterministic
pure-JS stage renderer whose frames ffmpeg encodes into a cached alpha clip that the existing compiler composites (010). Presets on
top of it cover typography (020) and UI (030); transitions and auto SFX close the remaining gaps (040); a dogfood film for ima2-gen,
a template and direction guidance prove it (050); v0.2.0 ships it (060). Reference analysis: 001. Gap analysis: 002.

## Loop spec

| Field | Value |
|---|---|
| Loop archetype | Satisfy-spec, multi-cycle HOTL (cxc-loop); one PABCD per work-phase wp1..wp6 |
| Trigger | User request 2026-09-28: "reinforce vid2 so films like x.com/hyojun_at/status/2069497198879048131 come out" with cxc-loop |
| Goal | Criteria c-1..c-6 in the goalplan `.codexclaw/goalplans/upgrade-lidge-ai-vid2-gen-worktree-users-jun-dev/` (native cwd ima2-gen) |
| Non-goals | GUI editor; native or browser rendering dependencies; SVG decoding; complex-script shaping beyond the existing raster path; copying the reference's media; changes to ima2-gen product code |
| Verifier | `npm run typecheck` (exit 0 at baseline), `npm run lint` (0), `npm run privacy:scan` (0), `npm test` (0, 38.7 s; scripts/test.mjs discovers `src/**/*.test.ts` so new colocated tests are read), `npm run build`, `npm run skills:check`; pixel/frame tests named in each decade doc; bench and contact-sheet review recorded as evidence (human-review rows, not gates) |
| Stop condition | c-1..c-6 met with fresh evidence, or an exact NEEDS_HUMAN blocker (npm credentials) recorded |
| Memory artifact | this unit (attestation log below) + goalplan ledger |
| Terminal outcomes | DONE, NEEDS_HUMAN (npm publish only), BLOCKED (same host blocker 3 turns) |
| Escalation | schema decisions that break 0.1 timelines; anything destructive outside the vid2-gen worktree |

HOTL bounds: tokens/time unlimited per the user's standing grant for vid2-gen work; write scope = vid2-gen worktree, `/tmp/vid2-*`,
`~/.vid2/`; external writes = push to lidge-ai/vid2-gen `main`, its tags and GitHub releases (granted for this repository in the
0.1 loop and reused here); ima2-gen is used only as a local asset generator and capture target. Delegation: sol subagents for the
architect, the independent reviewer and bounded implementation slices with disjoint write scopes.

## Work-phase map

| Work-phase | Doc | Depends on | Independently verifiable result |
|---|---|---|---|
| wp1 | 000–002 + decade docs | — | audited roadmap |
| wp2 | 010 | wp1 | stage layer renders, caches, previews; pixel tests |
| wp3 | 020 | wp2 | kinetic layer with reflow/follow/accent/icons; pixel tests |
| wp4 | 030 + 040 | wp3 | components, custom transitions, auto SFX; tests |
| wp5 | 050 | wp4 | dogfood film + template + skill guidance; QA report |
| wp6 | 060 | wp5 | v0.2.0 pushed, tagged, released, CI green |

wp4 consumes two decade docs because components and transitions/SFX share one verification pass (both feed the dogfood); they
remain separate documents for review. Build order follows the architecture: render primitive → typography → components/joins/audio →
integration film → release. No stacked PRs: this repository ships from one branch pushed to `main` as in 0.1.

## Architect consultation (formal P)

Architect: sol subagent `01a0e4f2-282f-75b3-bb2e-b50e30e4bca5` ("James"), proposal STG-01..STG-07 received 2026-09-28.

| ID | Proposal | Disposition |
|---|---|---|
| STG-01 | Deterministic frame-indexed `src/stage/`; presets compile to one node model; bounded sprite regions, benchmark first | **Accept** (010: dirty-rect compositing, sprite cache, bench acceptance 8) |
| STG-02 | FFV1 `bgra` in Matroska; rawvideo RGBA over stdin with backpressure; test alpha end to end | **Accept** (010 acceptance 2) |
| STG-03 | `stageRenders[]` in RenderPlan, materialized before segments by a shared function used by render and preview; deps only for preview | **Accept** (010 file map, field chain) |
| STG-04 | `kinetic` and `field` first, then `bars`/`ticker`/`chips`; raw `stage` escape hatch | **Accept**, ordering by dependency: raw `stage` (010) → `kinetic` (020) → all four UI presets (030) |
| STG-05 | Reflow, follow, pill, icon expansion inside a stage; cross-scene transitions separate | **Accept** (020; 040 for joins) |
| STG-06 | Stage SFX events on the absolute frame clock through `audio.autoCues`; cap density | **Accept** (040 mapping + caps) |
| STG-07 | zoom-from-rect / blur-dissolve as a follow-up with one shared expression builder | **Amend**: in scope for wp4 because the reference's reveal depends on it; blur dissolve is covered by the existing `hblur`/`fade` so only `zoomfrom` and `iris` are custom; shared `transitionChain` builder + `JoinStep.spec` (040) |
| Image decoding | png.ts only encodes; decode via a library with ADR or ffmpeg | **Accept ffmpeg decode** at materialization (010 `images.ts`); no new dependency |
| Open: spare tail frames | — | stage layers ending at scene end cover the 2 spare tail frames (010 decisions) |
| Open: SVG icons | — | out of scope; bundled Lucide stroke paths + PNG/JPEG/WebP images (020) |
| Open: complex scripts | — | unchanged raster shaping; Hangul works with a custom font (precomposed syllables); documented limitation |
| Open: generation time / cache size | — | bench acceptance (010 #8); stage cache lives in `cacheDir("stage")` alongside segments |

## Attestation log

Reflection (same architect, 2026-09-28): **MISALIGNED**, 7 gaps, all accepted and folded: (1) stage events → audio plan chain and
authored-vs-auto precedence (040); (2) transition geometry through resolve/joins and gbrp wrapping and `JoinStep.spec` rebuilt per context by `transitionChain` (040; supersedes the first-draft `JoinStep.filter`);
(3) 0.1 plan loader normalization + replay test (010); (4) image decode by bounded `spawn`, keyed by file content, invalidation test
(010); (5) dirty-rect redraw of intersecting stationary nodes + full-recomposite equality test (010); (6) icon-to-brand `expand` state in
kinetic (020) with the `zoomfrom` transition kept as the cross-scene alternative; (7) stage text boxes feed the QA contrast check with
4.5/3 thresholds (030).

Audit (A, reviewer sol `01a0e4fa-679a-7bd1-93aa-b7114033455e` "Feynman", 2026-09-28): round 1 **FAIL** (4 High: random-frame
determinism under dirty rects; preview cannot reuse a stored join chain; stage contrast unreachable from `vid2 qa`; dogfood gate too
weak for look and sound; Low: committed README still). All accepted and folded (010 seek rule + cold-frame test; 040 `JoinStep.spec` +
`transitionChain` with local offsets; 030 `stageTextBoxes` in QA; 050 13-shot mapping, strip and sound checks; 060 release assets).
Round 2 **FAIL** (field lacked grow/accent for shot 1; cue sample vs anchor; stale `JoinStep.filter`), folded. Round 3 **FAIL** (typing
cadence measured on 10 fps strips; stage-event rate conversion), folded. Round 4 **PASS** with one wording note (average cadence), folded.

### wp2 (stage core) — D, 2026-09-28

Conclusion: the stage primitive works end to end. A stage layer compiles to a JSON `StageRender`, is materialized into a cached FFV1
bgra clip before its segments, and composites with correct alpha; preview matches the full render. Evidence at vid2-gen 419669b2
(commits 776dd064, dab23431, 13b1cf75, and the golden refresh): full gate `typecheck && lint && build && privacy:scan && skills:check &&
npm test` exit 0, 252 pass / 7 skipped (receipt in the native cwd evidence dir); `src/stage/stage.test.ts` (spring closed form,
first-spring hold, dirty-rect vs full byte equality over 45 frames, cold seek frame 37) and `src/stage/stage-render.test.ts` (moving rect
at analytic x, 50 % alpha = 128 ±8, two cached stage events on re-render, plan JSON replay frame hash equal, preview ≤ 2 mean diff, 0.1
plan replay, image/font content invalidation, E_SCHEMA issue paths, E_CAPABILITY encoder:ffv1); bench 77 fps at 1080p before encode.
Plan deviations: the spring continuity bound in acceptance was corrected from 40 px to 20 % of travel per frame (a 400 px spring move
peaks at ~63 px/frame at 30 fps, which is intended motion); SVG path flattening (`icons/path.ts`) landed early with the renderer
because the icon node kind shares the sprite code; the built-in icon set remains 020 work.
Did not improve / open: FFV1 encode throughput at 1080p is unmeasured (bench covers JS only); the clip is full-canvas, so a small
stage in a big frame pays full-frame encode and overlay cost — revisit if dogfood renders are slow. What would prove the direction
wrong: if kinetic layouts with 40+ glyph nodes per frame fall below real-time, sprite reuse per glyph must be restructured.
Next: wp3 kinetic preset (020).

wp2 implementation review (same reviewer, after a C→P misstep: the D note was committed after the receipt, so D refused the stale
receipt and the cycle re-entered at P). Round 1 **FAIL**, 5 High, all real and fixed in 15fecb1a with regression tests: dirty
signatures missed stroke width and image radius (now the full evaluated node + transform + opacity + clips); blur levels were two
source-over draws (alpha 191 at blur 3) — now mixed per pixel and composited once; parsed fonts were cached by path — now re-read on
size/mtime change and reset per clip; decoded images were keyed by path — see round 2; stage clips were not composited through the
spare tail frames — now composited through `renderFrames` with `holdFrame` freezing evaluation. Round 2 **FAIL**: an image with an
animated width vanished (lookup key used evaluated size) — fixed in 2ac48c0c by decoding each file once at native size (long side
≤ 2048) and fitting per sprite with box filtering. Round 3 **PASS**. Lesson recorded for the next cycles: commit the D note before
taking the Check receipt.
