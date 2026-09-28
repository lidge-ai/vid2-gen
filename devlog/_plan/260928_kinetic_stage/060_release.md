# 060 — Release v0.2.0 and closeout (wp6)

**Summary.** Publish the upgrade: version 0.2.0, CHANGELOG, README section linking a still and the film uploaded as GitHub release
assets (never committed; AGENTS.md allows only small test fixtures), structure docs synced, pushed to lidge-ai/vid2-gen `main`,
annotated tag `v0.2.0`, GitHub release,
CI green on macOS, Windows and Linux. npm publication follows the 0.1 release workflow's `NPM_PUBLISH_MODE` gate; if it requires npm
credentials that are not configured, the outcome is NEEDS_HUMAN for that single step. Then archive this unit to `devlog/_fin/`.

## Steps

1. Bump `package.json` (and lockfile) to 0.2.0; CHANGELOG 0.2.0 entry (stage engine, kinetic, components, transitions, auto SFX,
   template, skill guidance); README feature table and example.
2. Full local gate: typecheck, lint, build, test, privacy scan, skills check, `npm pack` + install smoke.
3. `git push https://github.com/lidge-ai/vid2-gen.git codex/vid2-gen:main`; wait for CI on all three OSes; fix forward if red.
4. `git tag -a v0.2.0` on the green commit, push the tag, `gh release create v0.2.0` with notes; confirm the release workflow outcome.
5. Move the unit to `devlog/_fin/260928_kinetic_stage/` with the attestation log; push.

## Acceptance

- `gh run list` shows the CI run for the release commit green on macOS, Windows and Linux legs.
- `gh release view v0.2.0 -R lidge-ai/vid2-gen` exists; `git ls-remote` shows `refs/tags/v0.2.0` at the release commit.

## wp6 P revalidation (2026-09-28)

Previous D (wp5): the dogfood film passes QA and the sync checks; direction unchanged: ship 0.2.0. Checked at P: `lidge-ai/vid2-gen`
`main` is at 7d20854a (0.1.0 closeout); the local branch `codex/vid2-gen` is a fast-forward of it (86487a90..HEAD are this unit's
commits). `NPM_PUBLISH_MODE` is `none`, so `release.yml` skips npm on the tag exactly as for 0.1.0 — npm publication is the single
NEEDS_HUMAN step (an npm maintainer sets the variable/secret or publishes the tarball); the GitHub release carries the tarball, as 0.1.0
did. CI (`ci.yml`) runs on pushes to `main` across macOS/Windows/Linux × Node 22/24 plus the pack smoke.

Steps (B/C): 1) `package.json`/lockfile 0.2.0, CHANGELOG 0.2.0, README section "Kinetic launch films" (layers table + a 12-line
timeline + link to the release film), release notes file in the unit; 2) local gate + `npm pack` install smoke (existing
`tests/e2e/pack.test.ts`); 3) `git push https://github.com/lidge-ai/vid2-gen.git codex/vid2-gen:main`; watch CI; fix forward if red;
4) annotated tag `v0.2.0` on the green commit, push tag, `gh release create v0.2.0` with `vid2-gen-0.2.0.tgz`, `ima2-launch.mp4` and
the poster; 5) move the unit to `devlog/_fin/260928_kinetic_stage/`, fix links, push (docs-only, but ci.yml has no path filters, so the full matrix runs and must pass).
Acceptance: `gh run list` green for the release commit on all legs; `gh release view v0.2.0` lists the three assets; `git ls-remote`
shows `refs/tags/v0.2.0` at the release commit; README links resolve.

Reflection (architect 01a0e4f2, wp6): MISALIGNED, 5 gaps, all folded: (1) `tests/e2e/pack.test.ts` reads the expected version from
`package.json` instead of the hard-coded 0.1.0; (2) `ci.yml` has no path filters, so the docs-only closeout push runs the full matrix
and wp6 waits for it too; (3) the tag check compares the peeled `refs/tags/v0.2.0^{}` with the release commit; (4) as in 0.1.0 (080),
the tarball is packed from a clean checkout of the tag and, after upload, installed from the release URL into a temp prefix whose
`vid2 version --json` must report `data.version` 0.2.0 (audit wp6 round 1: `--version` is not an option); (5) README also updates the install URL (0.1.0 → 0.2.0 tarball), the "four templates" claims and
the stale "Commands and delivery" availability column (it still names planned phases). `.claude-plugin/plugin.json` version moves to
0.2.0 with the package.
