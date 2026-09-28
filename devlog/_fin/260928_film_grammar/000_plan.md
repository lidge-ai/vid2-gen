# 000 — Film grammar upgrade: plan and work-phase map

## Objective

Close the gaps between vid2's films and the best agent-made films on X (001), measured frame by frame (005): cuts that land on the music, a constrained look, persistent HUD devices, typographic roles, and a review loop the authoring agent can read. Ship the result to lidge-ai/vid2-gen main with green CI.

## Constraints

- vid2 stays an ffmpeg-native CLI with the JSON envelope, error codes and zod timeline schema it has today (structure/, skills/vid2-timeline/references/schema.md). No browser renderer, no new runtime dependency for the renderer.
- Model calls are opt-in. `vid2 review` reports `SKIPPED` without an endpoint and never uploads media unless asked.
- Reference films are studied, not redistributed: no third-party frames or audio enter the repository.
- File length < 500 lines, function length < 50 lines, tests as src/**/*.test.ts and tests/e2e/*.test.ts (discovered by scripts/test.mjs).
- Push only to lidge-ai/vid2-gen main (authorized in this session); npm publication stays gated (NPM_PUBLISH_MODE=none).

## Work-phase map (dependency order, PHASE-SPLIT-01)

| WP | Decade doc | Scope | Consumes | Closes |
|---|---|---|---|---|
| wp1 | 000–005 | Research, reference breakdown, gap analysis, this roadmap | — | criteria 1–2 |
| wp2 | 010_timing_and_render.md | G1 cumulative frame rounding + `bar` unit; G2 media `out`; G3 pre-trim cache for repeated reads; G4 auto-camera key cap | — | criterion 3 |
| wp3 | 020_analyze_and_review.md | G5 `vid2 analyze` (shots, beats, onsets, palette, keyframe sheet) and `vid2 review` (evidence package → vision model → findings) | exact cut times from wp2 | criterion 4 |
| wp4 | 030_looks_hud_grammar.md | G6 looks, G7 `hud` overlay, G8 beat ergonomics, G9 skill references (film grammar, reference films, review workflow) | analyzer to verify looks/HUD | criterion 5 |
| wp5 | 040_generated_clips.md | G10 guards, clip-length warning, verified generated-clip render | wp2 media fixes | criterion 6 |
| wp6 | 050_release.md | version bump, changelog, push to main, CI green, release film re-render | all | criterion 7 |

Each implementation work-phase is one full PABCD cycle. Its P re-verifies the decade doc against the code (earlier phases move lines), amends it, then builds.

## Verification strategy

- Unit tests next to the code (`src/**/*.test.ts`) for every rule, including the activation scenario of each guard.
- `npm run typecheck`, `npm run lint`, `npm test` before each D.
- Lint gate: examples/opencodex-* are local untracked studies; eslint ignores them (050). Real evidence: re-render examples/opencodex-mix after wp2 and run `vid2 analyze` on it (cut/beat deltas ≤ 1 frame); run `vid2 review` against the local proxy (gpt-6-astra) and keep the findings; render a look + HUD sample; render a generated Grok clip through ima2.

## SoT sync

structure/ (architecture docs) and skills/vid2-timeline/references/schema.md are the sources of truth; each phase's C patches them. README gains the new commands.

## Architect consultation

Recorded in 006_architect_consultation.md (proposal, main dispositions, reflection).

## Precedence

Within each decade doc, "Amendments" sections (reflection, then audit rounds) govern over earlier body text; the phase P consolidates them into the body before B.
