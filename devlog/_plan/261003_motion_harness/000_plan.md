# Motion harness and production recipes

Repeated animation intervals currently lose precision before they are repeated, component events can begin outside their layer, and stage text is omitted from title-safe warnings. This unit repairs those paths, adds an offline choreography example and research-backed authoring guidance, then publishes the verified package.

## Loop specification

- Archetype: satisfy-spec; trigger: owner request for repeated PABCD, inherited parallel subagents, Aside exec research, push and deployment.
- Goal: reproducible motion timing, useful early validation and sampled composition QA, with a runnable example and released package.
- Non-goals: new renderer/framework, generic collision detection, account/settings changes, unrelated repositories, copied third-party media, native PR stacks.
- Verifiers: focused Node tests (explicit target paths), existing stage/QA tests, actual ffmpeg renders and inspected frames; release runs package scripts and hosted CI matrix. Prose claims receive semantic review, not phrase tests.
- Stop: all four cycles and their evidence complete, npm and GitHub release read back, installed package smoke passes. DONE requires evidence; a concrete access/approval blocker is NEEDS_HUMAN, never a successful release.
- Memory artifact: this existing devlog convention and session-bound goalplan. No memory-store edits.
- Escalation: secret/access changes, destructive operations, or unavailable required human approval. User already authorized scoped push and deployment.
- Resources: no user token/cost/total-time bound; finite source questions, disjoint workers, managed subprocesses. Aside calls each have a 600-second host deadline. No arbitrary global cap is inferred.

## Source and responsibility map

`src/compile/layers/` converts authored motion into stage specs; `src/timeline/` owns relational validation; `src/qa/` owns measured warnings; `skills/` and `examples/` are packaged. Reuse `structure/` and `devlog/`; no new top-level convention or dependency.

1. `roadmap`: docs-only PABCD locks this roadmap and all decade docs.
2. `motion`: [010_motion.md](010_motion.md), three disjoint workers; compiler timing, component validation and stage title-safe QA.
3. `authoring`: [020_authoring.md](020_authoring.md), one original offline example and updated production guidance.
4. `release`: [030_release.md](030_release.md), integration gates, reviewed dev/main promotion and publication.

Discovery: architect decision D1 identifies early rounding in `src/compile/layers/components.ts:24` and `kinetic.ts:15`; D2 identifies missing component timing checks in `src/timeline/validate.ts:70`; D3 identifies stage contrast-only QA in `src/qa/checks.ts:89`. Main accepts all three; extends D2 only to explicitly authored event starts, not automatically generated final glyph/row completion. Intentional cuts remain legal.

No-code alternatives: existing helpers are reused; configuration cannot repair cumulative rounding or missing validation. No new public schema fields, runtime dependencies, or QA check names are needed. Validation gains domain errors within the existing envelope; sampled title-safe findings remain warnings.

## Consultation and authority

Native delegation family: multi_agent_v1, `send_input` / `close_agent`; inherited model, no model overrides. Architect handle `01a10208-ab08-7c02-8e37-9f266d66678e` supplied D1-D3; executable roadmap is sent to the same handle for reflection. Independent reviewer audits afterward. Each later formal P revalidates its owning decade doc and repeats proposal/reflection. Leaves never own goals/FSM/git operations.

Git: task branch `codex/motion-harness-261003` from `origin/dev` at `b8cc020`; existing unrelated release-outcome PR #22 is preserved. Delivery uses ordinary PRs. Separate runtime and authoring commits preserve reviewability; a single cohesive release PR is preferred unless size warrants separate PRs.

## Evidence and continuation

Baseline: dependency install `npm ci` passed, 102 packages, no vulnerabilities. Baseline `node --test src/stage/presets/components.test.ts src/stage/presets/kinetic.test.ts src/compile/layers/kinetic.test.ts src/timeline/validate-kinetic.test.ts` passed 18/18; separate `node --test src/qa/stage-contrast.test.ts` passed 1/1. An earlier incorrect multi-path command only ran stage-contrast; it was not counted as component coverage. Architect reflection ALIGNED; accepted its four clarifications: explicit zero/subframe regressions, pre-round interval positivity, authored-second ordering, and precise baseline evidence. Exact results, independent review, actual render observations, and cycle conclusions are appended before each D.

## Roadmap cycle conclusion

Architect ALIGNED; independent reviewer `01a10215-f4d4-7483-8ba5-55e982092824` returned VERDICT: PASS with no blockers. Six source-level boundary probes confirmed the validation gap and compatibility cases. The reviewed docs are locked; only docs were changed in this cycle. No production behavior has improved yet. Next: revalidate 010 and implement D1-D3 in disjoint scopes. The chosen direction would be wrong if resolved-clock tests show intentional subframe timing or clipping rejected.
