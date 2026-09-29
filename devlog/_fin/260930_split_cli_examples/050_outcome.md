# 050 outcome: repository split, help tree, examples on demand, 0.5.0

## Result

| Work phase | Outcome | Evidence |
|---|---|---|
| wp2 repository split | vid2-gen has its own `.git` (origin lidge-ai/vid2-gen); the ima2-gen database has no vid2 worktree or branch | 010 Outcome; backup bundle in `~/.vid2/backups/260930-vid2-from-ima2/` |
| wp3 help tree | PR #18, merged `10d6b4e` | head `9daefb2`, run 36603560823 attempt 2 all green (attempt 1: known Windows/Node 24 raster-text timeout) |
| wp4 examples | PR #19, merged `994e945` | head `60c68f4`, run 36606118840 all green |
| intro example | PR #17, merged `01d3caf` | head `d48edc8`, run 36601749308 all green |
| release | PR #20 `8baf618` (run 36606956930), promotion PR #21 `b8cc020` (runs 36607763011, 36607773366), `main` `5f6613e`, tag `v0.5.0` | `git diff b8cc020 v0.5.0` is empty |

Local gates on the release head (macOS, Node 26, ffmpeg 9): typecheck, lint, skills:check (7 skills, 20 commands), build,
`schema:json` with no diff, privacy scan (589 files), `VID2_REQUIRE_FFMPEG=1 VID2_PACK_TEST=1 npm test` 417 tests, 409 pass, 8 skipped,
0 fail; `npm pack --dry-run` 0.5.0, 735 files, 1.05 MB.

Reviews: architect Feynman (D1-D13, reflection ALIGNED); plan audits by Goodall (wp1 FAIL then GO-WITH-FIXES, wp2/wp5 GO-WITH-FIXES,
wp3/wp4 PASS); implementation reviews by Parfit (wp3: GO-WITH-FIXES then PASS) and Darwin (wp4: FAIL on overwritten edits, then PASS).

## Publish

The tag's `release.yml` run 36608654190 was skipped (`NPM_PUBLISH_MODE=none`). Setting up the Trusted Publisher through Aside stopped
at npm's security-key confirmation for the maintainer account: the form (GitHub Actions, `lidge-ai` / `vid2-gen` / `release.yml`, no
environment) must be saved by a person who can touch the key, with "Allow npm publish" checked (unchecked, the publisher may only
stage-publish). Nothing on the package changed. After that: `gh variable set NPM_PUBLISH_MODE -R lidge-ai/vid2-gen --body oidc` and
`gh workflow run release.yml -R lidge-ai/vid2-gen -f tag=v0.5.0`. The GitHub release `vid2-gen 0.5.0` is staged as a draft on
`v0.5.0` and is published once npm has 0.5.0.

## What did not improve

- `release.yml` has never completed a publish; the OIDC path (with the `_authToken` removal) is untested until the first run.
- The Windows/Node 24 raster-text test still times out occasionally at 180 s.
- ima2-gen's `ima2 service start --help` starts the service instead of printing help (observed, not in this repository's scope).
