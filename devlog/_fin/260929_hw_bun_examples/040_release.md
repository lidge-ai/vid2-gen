# 040 release 0.4.0

| Step | Evidence |
|---|---|
| WP1 examples | PR #12 → dev `fe7c427` (Kimi review: nothing blocking; Windows path, top-level workspace folders and media gate folded) |
| WP2 hardware encode | PR #13 → dev `04d4d63` (Kimi review: nothing blocking, three low notes left as follow-ups) |
| WP3 Bun | PR #14 → dev `d3ef5a4` (Kimi review: nothing blocking; comment, text layer and temp cleanup folded) |
| Release | this PR: version 0.4.0 in package.json, package-lock.json and .claude-plugin/plugin.json; CHANGELOG; README install via npm; release.yml on Node 24 for Trusted Publishing |

Every PR merged only after its head commit's CI (checks, 6-leg test matrix, pack, bun where present, aggregate `ci`) passed.
One Windows/Node 24 leg on #12 timed out in an unrelated raster-text test and passed on rerun.

Local gates on the release branch (M5 Pro, Node 26, ffmpeg 9.0.2): typecheck, lint, skills:check, build, schema:json with a clean
schema diff, privacy scan (561 files) all 0; `VID2_REQUIRE_FFMPEG=1 npm test` 389 pass, 9 skipped, 0 fail; `VID2_PACK_TEST=1 node --test
tests/e2e/pack.test.ts` pass; `npm pack --dry-run` 666 files, 971.5 kB, no `examples/`.

npm: the package did not exist, so npm could not register a Trusted Publisher yet. The first publish uses a one-day granular token
(`vid2-gen-bootstrap`, created through Aside's browser agent on the bitkyc08 account, the same route used for music2-gen 0.3.0) and a
throwaway userconfig. The token is deleted after the publish. Later releases can use `NPM_PUBLISH_MODE=oidc` once
`lidge-ai/vid2-gen` + `release.yml` is registered as the package's Trusted Publisher.

Follow-ups: Kimi's low notes on #13 (probe cache never evicts in long-lived embedders; the encoder log uses the `post` stage;
a broken ffmpeg binary reports `E_CAPABILITY` instead of `E_FFMPEG_MISSING` under `required`); NVENC/QSV/AMF/VAAPI quality settings
are unmeasured on real hardware.
