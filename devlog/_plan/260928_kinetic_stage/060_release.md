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
