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

Previous D: motion and authoring units verified and committed; original study330frames with one disclosed freeze warning, independent source/visual PASS after portable skill-navigation repair. Source head30e4653; clean tree before this record. Current readback: npm latest0.5.0, no remote v0.6.0 tag, NPM_PUBLISH_MODE=oidc. Main protection requires ci; merge and squash methods are available. Existing unrelated PR22 is preserved. No new permission/settings changes required.

The release remains one cohesive PR with separately reviewed runtime and authoring commits; most added lines are tests, the original timeline and documentation. No native stack is requested or created. Freeze/readiness evidence will name the final versioned source SHA, and any later outcome-only commit will explicitly distinguish its documentation delta from that release SHA.

## Adopted release decisions

Main accepts architect Mendel (`01a10242-6de0-7150-bda9-c4240492d297`) REL-01–06: 0.6.0 synchronized metadata/no dependency change; ten actual CI jobs at feature and promotion gates with tested-SHA/event/attempt records; tag only verified main with manual tag/version equality; exact published package installed outside checkout and explicit installed executable for 330-frame render/QA; registry integrity/provenance plus0.5.0 pinning fallback; post-publication archive/outcome commit separate from immutable release tag. Main enforces full CI before tag because release.yml itself only runs tests/prepack. No admin bypass or workflow weakening. Main dev branch is currently unprotected; this does not waive the ten-job integration gate.
