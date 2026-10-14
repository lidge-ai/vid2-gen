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

## wp5 P re-verification (2026-09-30, after wp4 D at 60c68f4)

- State: PR #17 (intro film) and PR #18 (help tree) are merged into `dev` (`01d3caf`, `10d6b4e`); PR #19 (`codex/example-command`)
  is open with CI running. `.claude-plugin/plugin.json` already lists `./skills/vid2-examples` (added in wp4), so the release commit
  only bumps its version. CHANGELOG has an `## Unreleased` section written during wp3/wp4; the release commit renames it to
  `## 0.5.0 — 2026-09-30` and adds a one-line lead plus a note that the repository now lives in its own git database (no user effect).
- Release branch: `codex/release-0.5.0` cut from `origin/dev` after #19 merges. Commit 1: `npm version 0.5.0 --no-git-tag-version`,
  plugin.json version, CHANGELOG. Commit 2: move this unit to `devlog/_fin/260930_split_cli_examples/` and add `050_outcome.md` (PRs,
  run ids, local gates). Local gates as listed above, then push, PR, CI, merge, promotion PR `dev` → `main`, CI, merge.
- Publish, route 1 (Trusted Publishing). `aside exec` (account u0 default host, deadline 600 s, guard permission) opens
  `https://www.npmjs.com/package/vid2-gen/access`, signs in as the package owner through Aside Vault if needed, and adds a Trusted Publisher:
  GitHub Actions, organization `lidge-ai`, repository `vid2-gen`, workflow filename `release.yml`, no environment. It changes nothing
  else and stops with the exact blocker on MFA/passkey/CAPTCHA. Verification: the page lists the publisher (Aside report + a REPL read).
  Then `gh variable set NPM_PUBLISH_MODE -R lidge-ai/vid2-gen --body oidc`, `git tag -a v0.5.0 <main merge sha>`, `git push origin v0.5.0`;
  `release.yml` runs `npm test` and `npm publish --provenance --access public`. Success = run conclusion success + `npm view vid2-gen
  version` = 0.5.0 + provenance attestation present (`npm view vid2-gen@0.5.0 dist.attestations`).
- Route 2 only if route 1 is blocked: one-day granular token through Aside as for 0.4.0, publish from a clean checkout of the tag with a
  throwaway userconfig, delete the token, reset `NPM_PUBLISH_MODE` to `none` if it was changed.
- After publish: temp-prefix install of `vid2-gen@0.5.0` runs `vid2 -v`, `vid2 example ls`, `vid2 help audio beats`;
  `gh release create v0.5.0 --title "vid2-gen 0.5.0" --notes-file <0.5.0 changelog section>`; record the publish run id and results in a
  follow-up devlog commit on `dev` through a PR.
- Out of scope: updating globally installed copies (`npm ls -g vid2-gen` is reported only).
- wp5 audit folds (Goodall, GO-WITH-FIXES, blockers=1) — supersede the text above where they differ:
  - B1. The release commit also changes `.github/workflows/release.yml`: `NODE_AUTH_TOKEN` is set only in token mode, and an OIDC-only step
    before `npm publish` removes the `_authToken` line that `actions/setup-node` wrote to the userconfig
    (`sed -i '/_authToken/d' "${NPM_CONFIG_USERCONFIG:-$HOME/.npmrc}"`), so an empty token cannot stop npm from using OIDC. The tag runs
    the workflow file of the tagged commit, so this lands through branch 4 before `main` is tagged.
  - If the tag's publish run fails, keep its log in the outcome record and publish route 2 from the same tag.
  - Before pushing the tag: `git show v0.5.0:package.json` shows `"version": "0.5.0"`. If the tag is pushed before the variable is set,
    recover with `gh workflow run release.yml -R lidge-ai/vid2-gen -f tag=v0.5.0`.
  - `NPM_PUBLISH_MODE` stays `oidc` after a route 1 success on purpose: later releases publish from their `v*` tag.
  - The "add `./skills/vid2-examples`" line in the release-commit list above is already done (wp4); only the version changes.
