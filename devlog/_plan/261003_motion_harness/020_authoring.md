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
