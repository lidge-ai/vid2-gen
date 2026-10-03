# Release and publication

Depends on: motion and authoring cycles. C4; push, integration and deployment are within the owner's explicit request.

## MODIFY version and release notes

Files: `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md`.

Before: package/plugin and both lockfile roots are 0.5.0.
After: 0.6.0 (recheck npm/tag before use); notes describe cumulative motion precision, component timing validation, stage title-safe warnings, offline motion study, and compatibility limits. No dependency upgrade or release workflow redesign.

Regenerate package skill manifest with `npm run build`; schema is unchanged and generation must leave `schema/` clean. Archive the completed unit into existing `devlog/_fin/261003_motion_harness` only after implementation closes; keep publication outcome factual.

## Exact-head gates

Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run skills:check`, `npm run schema:json`, `git diff --exit-code -- schema`, `node --test scripts/privacy-scan.test.mjs`, `npm run privacy:scan`, `VID2_REQUIRE_FFMPEG=1 npm test`, `VID2_PACK_TEST=1 node --test tests/e2e/pack.test.ts`, `npm pack --dry-run`.

These commands exist in package.json and .github/workflows/ci.yml. scripts/test.mjs discovers src/**/*.test.ts and tests/e2e/*.test.ts. Record fresh outcomes after implementation; no up-front passing claim. Privacy scan defaults to committed HEAD: additionally inspect `--range origin/dev..HEAD` after commit and before first push. Search introduced history for personal paths/emails and any client identifiers; exclude generated media.

Review exact diff, then push ordinary feature PR into dev, attach it to this chat, verify all ten CI jobs (checks, six platform/runtime legs, pack, bun, aggregate). Resolve findings before merge; preserve existing unrelated PR #22. Promote dev to main via ordinary PR and protected required checks. Recheck memberships/heads and review threads; do not bypass branch rules. No native stacks.

## Publish and installed proof

After main's exact-SHA CI passes, verify version/tag equality, create/push annotated v0.6.0 tag. Existing release.yml uses OIDC with Node 24 and runs tests/prepack. Verify completed publish step and npm exact version/latest/integrity/provenance; an absent/skipped job is not success. Create GitHub release separately with reviewed notes (workflow does not create it).

Install exact published version in a temporary prefix, isolated VID2_HOME; exercise version/help, skills, example list/copy, motion-study validation and render/QA. Record artifact integrity, builder run/attempt/event/SHA, installation outputs, and rollback route: consumers can pin 0.5.0; any new corrective publication uses a new version, never overwrite an existing artifact. No global install required.

If OIDC or a human security gesture blocks publication, preserve prepared changes and report the precise blocker. Do not switch accounts or weaken release gates. Terminal DONE requires all publication readbacks and smoke evidence.

## P revalidation

Previous D: motion and authoring units verified and committed; original study330frames with one disclosed freeze warning, independent source/visual PASS after portable skill-navigation repair. Source head30e4653; clean tree before this record. Current readback: npm latest0.5.0, no remote v0.6.0 tag, NPM_PUBLISH_MODE=oidc. Main protection requires ci; merge and squash methods are available. Existing unrelated PR 22 is preserved. No new permission/settings changes required.

The release remains one cohesive PR with separately reviewed runtime and authoring commits; most added lines are tests, the original timeline and documentation. No native stack is requested or created. Freeze/readiness evidence will name the final versioned source SHA, and any later outcome-only commit will explicitly distinguish its documentation delta from that release SHA.

## Adopted release decisions

Main accepts architect Mendel (`01a10242-6de0-7150-bda9-c4240492d297`) REL-01–06: 0.6.0 synchronized metadata/no dependency change; ten actual CI jobs at feature and promotion gates with tested-SHA/event/attempt records; tag only verified main with manual tag/version equality; exact published package installed outside checkout and explicit installed executable for 330-frame render/QA; registry integrity/provenance plus0.5.0 pinning fallback; post-publication archive/outcome commit separate from immutable release tag. Main enforces full CI before tag because release.yml itself only runs tests/prepack. No admin bypass or workflow weakening. Main dev branch is currently unprotected; this does not waive the ten-job integration gate.


## Released outcome — 2026-10-04 (Asia/Seoul)

DONE: vid2-gen 0.6.0 is published to npm latest and GitHub Releases. Tagged source is `0119a5c12f602fcfaceb48924551871665eba4a5`; annotated tag object is `4dfbaa33211ff4d28ff96538b4a047580ce99a9d`. Publication and installed-package proof are complete. This archive/outcome change is documentation-only and does not move the release tag.

| Gate | Exact evidence |
|---|---|
| Local release | All 11 configured commands passed at d81e24a: typecheck, lint, build, skills, schema generation/drift, privacy tests/scan, npm test, packed install, pack dry-run. 463 tests passed, 12 conditional skips, 0 failures; separate pack 3/3. Subsequent 9675e18 changed only the changelog date. |
| Feature PR23 | Head 9675e18, tested merge 141ee4f, [run 37131833668](https://github.com/lidge-ai/vid2-gen/actions/runs/37131833668), pull_request attempt 1, all 10 jobs successful. Squashed to dev e2ab194. |
| Dev push | Head e2ab194, [run 37132196947](https://github.com/lidge-ai/vid2-gen/actions/runs/37132196947), push attempt 1, all 10 jobs successful. |
| Promotion PR24 | Head e2ab194, tested merge b965916, [run 37132257020](https://github.com/lidge-ai/vid2-gen/actions/runs/37132257020), pull_request attempt 1, all 10 jobs successful. Merge result 0119a5c. |
| Main push | Head 0119a5c, [run 37132631511](https://github.com/lidge-ai/vid2-gen/actions/runs/37132631511), push attempt 1, all 10 jobs successful. |
| Publication | [run 37133014140](https://github.com/lidge-ai/vid2-gen/actions/runs/37133014140), push v0.6.0, attempt 1, source 0119a5c; publish job and Trusted Publishing OIDC step successful. |
| Registry | Exact version/latest 0.6.0; gitHead 0119a5c; SLSA v1 provenance metadata present. Published SHA1 fd5c4dc3cfe68c4c15903f1a5164ab17e45733d2 matches workflow output. |
| Installed smoke | Exact registry version installed outside checkout with scripts disabled and isolated VID2_HOME. Installed version/help, skill list/copy, example list/copy, validation, final uncached render and QA passed. Independent ffprobe: 330 frames, 960x540, 30/1fps. Main inspected installed render contact sheet. |

Both merged PRs were ordinary (stack=null, membership empty) and had zero unresolved review threads before/after merge. Existing unrelated PR 22 was preserved; no branch protection or publishing settings changed.

The first registry read returned 404 and first install returned ETARGET during propagation. Workflow logs proved 0.6.0 publication, so no republish was attempted. A later prefer-online registry read resolved 0.6.0, then the installed smoke passed. The study's only QA issue is its disclosed frozen 0–3s warning; text_safe and contrast pass. Twelve local skips include optional Electron/agg/live providers/native capture, unavailable Chromium/libass/legacy ffmpeg transport, and opt-in example/pack paths; packed install ran separately, and hosted Linux required Chromium/libass coverage.

Release: https://github.com/lidge-ai/vid2-gen/releases/tag/v0.6.0
Registry: https://www.npmjs.com/package/vid2-gen/v/0.6.0

Recovery: consumers may pin vid2-gen@0.5.0 (registry artifact was read back; SHA1 5073532b1b19a89bdef851c84b7eb9f760502dfd). No rollback was performed. Any fix uses a new version; never retag or overwrite 0.6.0.

### Verification commands and retained evidence

Exact local commands appear in the gate section above; `.tmp/motion-harness/release-checks/results.json` records argv, exit and elapsed time, with separate stdout/stderr. Remote receipts are `pr-ci.json`, `dev-ci.json`, `promote-ci.json`, `main-ci.json`, `publish.json`, and checkout proof files under `.tmp/motion-harness`. Registry read: `npm view vid2-gen@0.6.0 version dist-tags dist.integrity dist.shasum dist.tarball dist.attestations gitHead --registry=https://registry.npmjs.org --prefer-online --json`. Installed proof: `python3 .tmp/motion-harness/published-smoke.py`; all invoked commands and stdout/stderr retained under `published/`, plus `result.json`. No generated media or personal installation paths are committed.

Registry integrity: `sha512-/BF4qw7SC5Inyhf4FBhB6J7QGCkxEYDeEDkZCJGMVeU2Jsgf07e8NGmkSNn64kufIu9lJ3u3ym5XX5qDZ6rIwg==`.
