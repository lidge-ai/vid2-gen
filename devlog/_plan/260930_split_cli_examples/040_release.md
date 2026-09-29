# 040 wp5: release 0.5.0

## PR train

Every PR targets `dev`. Merge (merge commit, as #12-#16 did) only after the PR head commit's CI run is complete with the `checks`,
six `test` legs, `pack`, `bun` and aggregate `ci` jobs green. Record run id, head SHA and event per PR (DEV-CI-EVIDENCE-01).

| # | Branch | Content |
|---|---|---|
| 1 | `codex/vid2-intro-film` | vid2-intro keynote film example (existing commits 856bc1e4, d48edc8f) |
| 2 | `codex/cli-help-tree` | devlog unit 260930 + 020 |
| 3 | `codex/example-command` | 030 |
| 4 | `codex/release-0.5.0` | version + changelog + outcome record |
| 5 | `dev` → `main` | promotion PR "release 0.5.0: promote dev to main" |

Branches 2-4 are cut from `origin/dev` after the previous PR merges, so no stack restacking is needed.

## Release commit (branch 4)

- MODIFY `package.json` `"version": "0.4.0"` → `"0.5.0"`; `package-lock.json` both root version fields via
  `npm version 0.5.0 --no-git-tag-version`.
- MODIFY `.claude-plugin/plugin.json` `"version": "0.5.0"`, add `"./skills/vid2-examples"` to `skills` (030 adds the skill).
- MODIFY `CHANGELOG.md`: new `## 0.5.0 — 2026-09-30` section above 0.4.0 covering the help tree, `vid2 example`, the
  `vid2-examples` skill, the vid2-intro example and the repository split (repo hygiene, no user-facing effect).
- MOVE `devlog/_plan/260930_split_cli_examples` → `devlog/_fin/260930_split_cli_examples` with `050_outcome.md` recording
  PR numbers, run ids, local gate outputs and the publish route used.

Local gates on the release head before pushing: `npm run typecheck`, `npm run lint`, `npm run skills:check`, `npm run build`,
`npm run schema:json && git diff --exit-code -- schema`, `npm run privacy:scan`, `VID2_REQUIRE_FFMPEG=1 npm test`,
`VID2_PACK_TEST=1 node --test tests/e2e/pack.test.ts`, `npm pack --dry-run` (file count and size recorded).

## Publish

The npm token from 0.4.0 was deleted after use; `npm whoami` returns E401 and the repository variable `NPM_PUBLISH_MODE` is
`none`. Routes, in order:

1. Trusted Publishing. The package now exists, so npm accepts a Trusted Publisher. Through Aside's signed-in browser on
   npmjs.com (package vid2-gen → Settings → Trusted Publisher → GitHub Actions): organization `lidge-ai`, repository
   `vid2-gen`, workflow `release.yml`, no environment. Then `gh variable set NPM_PUBLISH_MODE -R lidge-ai/vid2-gen --body oidc`,
   tag `v0.5.0` on the promoted `main` commit and push the tag. `release.yml` runs `npm test` and `npm publish --provenance`.
2. One-day granular token (the 0.4.0 route): create it through Aside on the bitkyc08 account, publish locally from a clean
   checkout of the tag with a throwaway userconfig, delete the token afterwards.
3. If both need an interactive login or 2FA the browser session cannot complete, report NEEDS_HUMAN with the exact step.

After publish: `npm view vid2-gen version` = 0.5.0; `npm i -g vid2-gen@0.5.0` in a temp prefix, then `vid2 --version`,
`vid2 example ls` and `vid2 help audio beats` succeed. Create the GitHub release `vid2-gen 0.5.0` on tag `v0.5.0` with the
changelog section as notes (`gh release create v0.5.0 --notes-file`).

Installed global copies are not updated unless they already track npm (`npm ls -g vid2-gen` is checked and reported).
