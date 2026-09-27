# 080 — wp9 Release (GitHub repo, CI, npm, GitHub release)

User-authorized external writes: create public lidge-ai/vid2-gen, push, CI, npm publish of vid2-gen, GitHub release. C4 care (release surface).

## Steps

1. Pre-push privacy check (DEV-PRIVACY-01, audit blocker 8): scripts/privacy-scan.mjs scans every blob reachable in the push range
   (`git rev-list --objects <remote>/main..HEAD`, or all of HEAD for the first push) for absolute home paths (a slash, the word Users or home, a slash, a name,
   a slash; and the Windows equivalent), personal emails (anything except the GitHub noreply domain and the org address), and complete token
   shapes only, each with a required minimum value length so that documentation mentioning a prefix never matches: GitHub OAuth/PAT tokens
   (`gh[opsu]_[A-Za-z0-9]{30,}`, `github_pat_[A-Za-z0-9_]{40,}`), npm (`npm_[A-Za-z0-9]{30,}`), OpenAI-style (`sk-[A-Za-z0-9_-]{32,}`), and
   header-with-value forms (`api-key["':= ]+[A-Za-z0-9]{24,}`); a hit fails with file:line; fixes rewrite the unpushed commits. A unit test runs the
   scanner over this roadmap unit and README and expects zero hits, and over planted real-shaped fakes and expects each to hit.
   The script is added in wp2 (package.json `privacy:scan`, CI checks job) so every phase stays clean. Confirm LICENSE, README, SECURITY, CHANGELOG.
2. `gh repo create lidge-ai/vid2-gen --public --description "<package description>" --homepage https://www.npmjs.com/package/vid2-gen`; set
   topics (video, ffmpeg, cli, ai-agents, codex, claude-code, motion-graphics); add remote `vid2` in the worktree; `git push vid2 codex/vid2-gen:main`;
   set default branch main; enable issues; branch protection light (require CI "ci" check on main) via `gh api`.
3. CI on main: wait for the `ci` aggregate; diagnose per DEV-CI-EVIDENCE-01 (expected jobs actually ran on the pushed SHA; no cancelled legs).
   Fix forward on main with small commits until green on macOS/Windows/Linux × Node 22/24.
3b. Before tagging (audit blockers 7 and round-2 4): commit `.github/workflows/release.yml` to main (it must exist in the tagged tree): triggers
   `workflow_dispatch` (input `tag`) and `push: tags: ["v*"]`; permissions `contents: read`, `id-token: write`; a single job `publish` with a
   job-level condition `if: vars.NPM_PUBLISH_MODE == 'token' || vars.NPM_PUBLISH_MODE == 'oidc'` (audit round 3: a successful guard step would not stop
   later steps; the job-level `if` skips the whole job, which GitHub reports as skipped) and a first step that fails fast when mode is `token`
   but `secrets.NPM_TOKEN` is empty; its steps check out the tag, setup-node 22 with
   registry-url, `npm ci`, `npm test` (ubuntu, ffmpeg installed), then `npm publish --provenance --access public` (with
   `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` in token mode). The workflow never creates or uploads GitHub releases. Its CI run on main must be
   green before the tag.
   Workflow proof: a `workflow_dispatch` run on main with mode `none` must show job `publish` as skipped (observed via `gh run view --json jobs`)
   before the tag is pushed; token/oidc paths are observed on the real tag run (token) and documented for the next release (oidc).
3c. Choose exactly one publisher before pushing the tag: if `gh secret list -R lidge-ai/vid2-gen` (or the org) shows NPM_TOKEN → set
   `NPM_PUBLISH_MODE=token` (Path B); else if `npm whoami` succeeds locally → set `NPM_PUBLISH_MODE=none` and publish locally (Path A); else set
   `NPM_PUBLISH_MODE=none` and record NEEDS_HUMAN (Path C). After the first publish and trusted-publisher setup the variable becomes `oidc`.
4. Tag first: once CI is green on main, create annotated tag `v0.1.0` on that exact SHA and push it; all publishing uses that tag.
   npm: the name `vid2-gen` is free (checked 2026-09-27); trusted publishing needs the package to exist first (001 §e). Path A (mode none,
   local login) → `npm publish --access public` from a clean checkout of tag v0.1.0. Path B (mode token) → the tag push runs release.yml, the only
   publisher. Path C → NEEDS_HUMAN with the exact command for the user (`npm login`, then `npm publish --access public` in a clean checkout of tag
   v0.1.0); everything else is completed. After the first publish, document configuring the npm trusted publisher (github.com/lidge-ai/vid2-gen,
   workflow release.yml) and switch the variable to `oidc` for later tags.
5. After npm shows the version (or the NEEDS_HUMAN record exists): `gh release create v0.1.0 --verify-tag --title "vid2 0.1.0" --notes-file
   <generated from CHANGELOG> <npm pack tarball> <dogfood mp4>` — creation and upload in one command.
6. Post-release verification: `npm view vid2-gen version` = 0.1.0; fresh temp dir `npx -y vid2-gen@0.1.0 doctor --json` works; release page lists
   the asset; README badges resolve.

## File map

NEW .github/workflows/release.yml, CHANGELOG.md entry 0.1.0 (MODIFY), README badges (MODIFY). No engine changes except CI fixes (recorded here).

## Verification (C for wp9)

`gh run list --commit <sha>` shows ci success with all matrix legs completed; `gh api repos/lidge-ai/vid2-gen --jq .visibility` = public;
`npm view vid2-gen version` (or NEEDS_HUMAN record); `gh release view v0.1.0 --json assets`.
