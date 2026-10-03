# Reproducible motion study and authoring guidance

Depends on: motion timing/validation/QA cycle. C3 packaged authoring surface.

## NEW original offline example

Files: `examples/motion-study/{timeline.json,example.json,README.md}`. Existing manifest/catalog handles discovery without source changes.

Timeline: schema v1, 960x540 at 30fps, approximately 9-12 seconds, no external media, provider or capture dependency. Three legible scenes: short mono field typing at 45ms, a small staggered chip/bar group, kinetic phrase reflow retaining one actor key. Explicit safe centered coordinates, high contrast, deliberate at-least-one-second readable holds, restrained entrances, no unsupported new effects. Times relative to each layer and repeated periods preserve cumulative intent. Background is nonblack; optional sound is omitted and disclosed. This is an original study inspired by motion patterns, not a copied brand film.

Manifest: name `motion-study`, accurate title/summary/duration/size, technique and request tags, ffmpeg need, timeline edit entry, ordered steps identical to README bash commands, output `out/motion-study.mp4`. Steps use installed `vid2 validate`, `preview` at documented boundary/hold samples, `render`, `qa --timeline`; all outputs stay in the example workspace. README includes a scene/time table, expected motion, reproducible commands and source links with observed-vs-inferred limits.

## MODIFY packaged guidance and indexes

- `examples/README.md`: add motion-study catalog row.
- `tests/e2e/examples.test.ts`: add `motion-study` to the existing EXAMPLES contract list so README/manifest steps and indexes are verified.
- `skills/vid2-examples/SKILL.md`: route timing/spacing/kinetic study requests to the new example.
- `skills/vid2-direction/references/motion.md`: preserve style choices but clarify entrance/hold/exit budgets, cumulative frame equation `round((start + index * interval) * fps)` where start is the already output-grid-quantized anchor, and preview both event boundary frames and readable holds.
- `skills/vid2-direction/references/kinetic-grammar.md`: replace universal camera motion and maximum typing-gap rules with intentional camera holds and cadence calculated from interval/fps. State sampled stage text QA coverage accurately.
- `skills/vid2-cli/SKILL.md`: add focused motion review recipe if current workflow lacks it; do not add commands that are absent from registry.
- `structure/{examples,skills}.md`: document new shipped example and guidance.
- Generated `skills-manifest.json`: regenerate with existing build.

Research belongs in `001_research.md`: direct primary-source example URLs, opened-source vs visually observed facts, limitations. Aside exec sessions are read-only public research with no repository writes. Numerical recommendations remain proposed defaults unless measured from a source.

## Verification

`npm run skills:check`, `node --test tests/e2e/examples.test.ts`, real example validate/preview/render/qa and readback of contact sheet plus event/hold samples. NEW `tests/e2e/motion-study.test.ts` only if existing examples tests do not execute the original timeline: assert validation, frame count, component/stage presence and expected motion frames without prose-string tests. Package install smoke in release verifies example discovery/copy plus render.

Main owns integration/render observations. Example writer owns only its new example, indexes and example test; guidance writer owns only named skill markdown. Semantic/visual approval uses independent review; no claim that a passing schema proves good choreography.

## P continuation

Previous D: D1-D3 implemented, 54 new regressions and 86 affected checks passed, real CLI and encoded-frame evidence matched authored cadence. At e63b34d the catalog, manifest and packaged skills still match the original plan. This cycle consumes that runtime, then adds the original study and guidance. Single cohesive delivery PR remains appropriate: most diff lines are explicit tests and evidence; runtime edits are bounded and have separate commit/review evidence. No native stack or unrelated existing PR changes.

Compatibility preflight: `VID2_REQUIRE_FFMPEG=1 node --test tests/e2e/template-kinetic.test.ts tests/e2e/templates.test.ts` exited 0, 8/8 passed, no skips; all five shipped templates still validate, proxy-render and produce QA artifacts after the stricter component validation.

## Adopted executable scene design (A1-A6)

Architect `01a1022c-e664-7782-b1b5-d93d3d26b7f1` proposed the following; main accepts A1-A6. Schema was checked in memory; visual acceptance remains a C gate. All values are original study choices.

- A1: 11 seconds / 330 frames, 960x540 at 30fps, background #14242E, three hard-cut scenes, no sources or audio. Use preset-specific origins inside a centered composition.
- A2 (0–89): field centered (480,270), width600 height76 radius16, mono32, caret false. Type `make room` at .5s with 45ms glyphs, accent #8FD8C8/decay .3s. Onsets 15,16,18,19,20,22,23,24,26 (space consumes an interval); readable hold36–89.
- A3 (90–179): bars top-left (220,177), width460 rowHeight50 gap18 size22, rows Pause45/Space65/Read85, max100, empty unit, countUp false. Delay .3s, stagger .145s, grow .5s. Global starts99/103/108, completed widths114/118/123; hold123–179. Values are illustrative, not benchmark claims.
- A4 (180–329): kinetic at (480,270), sans semibold48, maxWidth720 lineHeight2.25 gap.3 letterSpacing0, fixed camera. Enter rise .35s/stagger .135s/distance12/blur0; exit fade .2s; move stiffness196/damping28/mass1. At .3s tokens Room(key room), to(key to,newline true), think(key think); at2.6s only Room(key room). Preserve identity across reflow. Initial entrance completes208, readable hold208–257, reflow258, leavers gone264, spring tolerance277, final hold282–329. Geometry/tolerance claims require rendered inspection.
- A5: concise README preview list `14f,15f,26f,60f,89f,90f,99f,108f,123f,150f,179f,180f,208f,257f,258f,264f,277f,306f,329f`. Main additionally inspects encoded consecutive frames14–27 and257–278.
- A6: correct guidance to separate anchor quantization from repeated periods, intentional camera rest, cadence derived from fps, sampled-QA limits. Include primary-source links with evidence limits.

Worker split: example worker writes new example, examples/README.md, tests/e2e/{examples,motion-study}.test.ts, and skills/vid2-examples/SKILL.md; guidance worker writes only skills/vid2-direction/references/{motion,kinetic-grammar}.md and skills/vid2-cli/SKILL.md. Main owns structure docs, manifests, stage/index operations, renders and devlog. Existing EXAMPLES check requires new example files staged; worker must report that dependency, not run git.

Authoring consultation: architect Heisenberg ALIGNED on adopted A1-A6; independent reviewer Ohm VERDICT: PASS, no blockers, after in-memory schema/relational and 330-frame timing checks. Main accepted all decisions. Example and guidance writers dispatched on the final disjoint scopes; main updates structure/examples.md and structure/skills.md.

## C verification and observed output

Main commands: `npm run build`, `npm run skills:check`, `node --test tests/e2e/motion-study.test.ts`, `node --test --test-name-pattern='every example|every vid2 step|example index' tests/e2e/examples.test.ts`, `npm run typecheck`, `npm run lint`: all exit0; 4 new timing tests and 3 catalog/manifest contracts pass. Skills lint: 7 skills, 20 commands.

`python3 .tmp/motion-harness/study-check.py` copied the example through the built CLI, validated it, rendered 19 final-profile previews plus an uncached final MP4, and ran timeline-aware QA. Result: 330 frames, 960x540, QA WARN for frozen0–3 only; no text-safe or contrast issues. The worker confirmed source timeline unchanged after main captured these artifacts.

Main viewed the QA contact sheet and dense decoded-frame strips: typing14–27 shows expected incremental glyphs; reflow257–278 retains Room and removes the departing words without observed collision or clipping. The frames do not establish audio or full-playback rhythm; the study is silent. Raw ffmpeg `freezedetect=n=-60dB:d=3` logs also report0–3, while decoded frames demonstrate small glyph changes; README records the measured warning and does not auto-waive it.

Uncommitted evidence: `.tmp/motion-harness/study-{copy,validation,preview,render,qa}.json`, `study-typing.png`, `study-reflow.png`, and `study/out/motion-study.mp4`. Exact strip commands:

```sh
ffmpeg -v error -y -i .tmp/motion-harness/study/out/motion-study.mp4 -vf 'select=between(n\,14\,27),scale=320:-2,tile=7x2' -frames:v 1 -update 1 .tmp/motion-harness/study-typing.png
ffmpeg -v error -y -i .tmp/motion-harness/study/out/motion-study.mp4 -vf 'select=between(n\,257\,278),scale=320:-2,tile=6x4' -frames:v 1 -update 1 .tmp/motion-harness/study-reflow.png
```

Fresh independent source/contract and visual reviews are pending before D. No whole-trajectory QA guarantee or production benchmark is introduced.

C review synthesis: visual reviewer Noether PASS on inspected frames. Source reviewer Laplace found three new relative example README links broken after copy-style skill installation. Accepted and replaced them with portable `vid2 example show/path --source` navigation; no runtime/ownership change. Regenerate manifest and verify actual isolated skill copy before closure. Existing unrelated link debt is not expanded.

Closure: Laplace re-review PASS; all four portability-fix files reviewed, copied-file equality and generated hashes checked. Actual `node bin/vid2.js skill install --dir .tmp/motion-harness/copied-skills --json` installed 7 skills/26 files; `node bin/vid2.js example path motion-study --source --json` returned the packaged source. Visual review Noether PASS with sampled-frame limits. D conclusion: original 330-frame study and portable guidance verified; next cycle runs final package/matrix gates and publishes0.6.0. The small-motion freeze warning remains disclosed, not waived.
