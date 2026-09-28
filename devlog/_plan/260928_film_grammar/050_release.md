# 050 — WP6: release

## File and action map

| Path / action | Change |
|---|---|
| package.json | MODIFY: version 0.2.0 → 0.3.0. |
| CHANGELOG.md | MODIFY: 0.3.0 entry — new commands (analyze, review), looks, hud, bar unit, generated-clip guards; behavior change: scene cuts quantize cumulatively and can move ≤ 4 frames toward the exact grid. |
| .gitignore | MODIFY: \`examples/opencodex-*/\` (local studies with private captures), \`examples/*/media/*.mp4\`, \`examples/*/media/*.wav\`, \`examples/*/*.vid2cap/\`, \`examples/*/.work/\`. |
| eslint.config.js | MODIFY: ignores add \`examples/opencodex-*/**\` (untracked local studies must not gate lint). |
| skills-manifest.json | REBUILD via \`npm run build\` (hashes only). |
| examples/ima2-launch | re-render with 0.3.0 (\`node ../../bin/vid2.js render timeline.json --profile final\`), QA, check-sync, analyze. |
| devlog/_plan/260928_film_grammar → devlog/_fin/260928_film_grammar | MOVE at D. |

## Gates (all must exit 0, recorded with their tails)

1. \`npm run typecheck\`, \`npm run lint\`, \`npm test\`, \`npm run skills:check\`, \`npm run privacy:scan\`, \`node --test src/timeline/json-schema-drift.test.ts\`.
2. \`git status --porcelain\` shows no file > 200 KB staged (\`git diff --cached --numstat\` + size check) and no examples/opencodex-* path.
3. \`git ls-remote https://github.com/lidge-ai/vid2-gen.git main\` equals the parent of the release commit; otherwise stop and rebase, never force.
4. Push \`codex/vid2-gen:main\` by explicit URL; \`gh run watch\` on the pushed head → success. A red CI run is fixed forward.
5. Tag \`v0.3.0\` on the pushed head; \`npm pack\` → \`vid2-gen-0.3.0.tgz\`; \`gh release create v0.3.0 vid2-gen-0.3.0.tgz ima2-launch.mp4 ima2-launch-poster.jpg -R lidge-ai/vid2-gen\`; verify with \`gh release view v0.3.0 -R lidge-ai/vid2-gen --json assets\` that all three assets exist and the tag SHA equals main.

## Stop conditions

Remote main moved; CI failing twice on the same cause (root-cause first); any staged file > 200 KB; privacy scan hit.

## Accept

Main and tag at the same SHA with green CI; release lists the three assets; unit archived to _fin.
## Amendments from reflection (006 G-15–G-17)

- G-15: tests include top-level tests/e2e/*.test.ts (scripts/test.mjs:36-39).
- G-16: examples/opencodex-* stay untracked; `.gitignore` adds `examples/*/media/*.mp4`, `examples/*/media/*.wav`, `examples/*/*.vid2cap/`, `examples/*/.work/` before any broad add. Receipts that depend on them are local evidence, stated as such.
- G-17: "rebuild skills manifest" (npm run build), not a version field. Re-check `git ls-remote https://github.com/lidge-ai/vid2-gen.git main` equals the parent before pushing.

## Amendments from audit round 2 (R2-4)

- CI is watched with `gh run list -R lidge-ai/vid2-gen --commit <sha>` then `gh run watch <id> -R lidge-ai/vid2-gen --exit-status` (this checkout's origin is ima2-gen). The tag is annotated (`git tag -a v0.3.0 <sha>`), pushed by explicit URL, and the release uses `gh release create v0.3.0 --verify-tag -R lidge-ai/vid2-gen`. Assets: `vid2-gen-0.3.0.tgz` from `npm pack`, `examples/ima2-launch/.work/ima2-launch.mp4`, and `ima2-launch-poster.jpg` from `ffmpeg -ss 12 -i .work/ima2-launch.mp4 -frames:v 1 -q:v 2 .work/ima2-launch-poster.jpg`.
