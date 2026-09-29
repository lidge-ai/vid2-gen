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

The tag push's `release.yml` run 36608654190 was skipped (`NPM_PUBLISH_MODE=none`). A first dispatch (run 36612501785) reached
`npm publish` and failed with ENEEDAUTH because no Trusted Publisher existed. `aside exec` (which completes npm's security-key prompt with
Aside's passkey support) then added the Trusted Publisher (GitHub Actions, `lidge-ai` / `vid2-gen` / `release.yml`, no environment,
"Allow npm publish" checked); my earlier note that a person had to touch the key was wrong. `NPM_PUBLISH_MODE=oidc` and
`gh workflow run release.yml -f tag=v0.5.0` (run 36639968634, tag commit `5f6613e`) then published `vid2-gen@0.5.0` with signed
provenance through the OIDC step (the `_authToken` removal worked). The registry showed 0.4.0 for about two minutes after the log printed
`+ vid2-gen@0.5.0`, then `latest` moved to 0.5.0. A temp-prefix install of `vid2-gen@0.5.0` ran `vid2 -v`, `example ls`, `help audio beats`,
`example new vid2-intro` and `skill list` (7 skills), and `npm audit signatures` verified the attestations. The GitHub release
`vid2-gen 0.5.0` is published on `v0.5.0`. `NPM_PUBLISH_MODE` stays `oidc`, so later `v*` tags publish automatically.

## What did not improve

- The first tag push was skipped and a manual dispatch was needed, because the variable was `none` when the tag went out.
- The Windows/Node 24 raster-text test still times out occasionally at 180 s.
- ima2-gen's `ima2 service start --help` starts the service instead of printing help (observed, not in this repository's scope).
