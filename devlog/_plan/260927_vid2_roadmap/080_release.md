# 080 — wp9 Release (GitHub repo, CI, npm, GitHub release)

User-authorized external writes: create public lidge-ai/vid2-gen, push, CI, npm publish of vid2-gen, GitHub release. C4 care (release surface).

## wp9 architect consultation

Architect Gibbs W9-01..W9-06 (2026-09-28), checked now: the repo is already public with main pushed since wp2 (deviation from step 2's order,
so every phase ran 3-OS CI); issues on; topics empty; no branch protection; `npm whoami` → E401 (local token invalid); no NPM_TOKEN secret;
`npm view vid2-gen` → 404; dogfood MP4 = 5,122,759 bytes. Dispositions:

- W9-01 accept: set topics and protection requiring the `ci` check; tag only a SHA whose `ci` aggregate and every leg completed green.
- W9-02 accept: **Path C** — `NPM_PUBLISH_MODE=none`, NEEDS_HUMAN for the first npm publication with the exact commands (npm login; whoami;
  download the release tarball; `npm publish ./vid2-gen-0.1.0.tgz --access public`); npm and its badge are not reported live before that.
- W9-03 accept: release.yml as step 3b; dispatch on main with mode none → job `publish` skipped, observed with `gh run view --json jobs`.
- W9-04 accept: CHANGELOG 0.1.0 replaces "Foundations (in progress)": features, capture support levels, prerequisites, known limits (Wayland
  unsupported; provider credentials optional; Grok video was not dogfooded — lane was signed out). Release notes link the film and state npm pending.
- W9-05 accept: release assets = `vid2-gen-0.1.0.tgz` packed from a clean checkout of the tag (contents + SHA-256 listed in the notes) and
  `vid2-launch.mp4`; smoke = install the tarball **from the release URL** into a temporary npm prefix and run `vid2 version|doctor|skill list --json`.
- W9-06 accept: 090's worktree replacement runs only after this task stops using the path; ignored `.work/` evidence (63 MB) is copied out first;
  if the path is still in use at closeout, the replacement is recorded as pending (the linked worktree stays).

## Steps

1. Pre-push privacy check (DEV-PRIVACY-01, audit blocker 8): scripts/privacy-scan.mjs scans every blob reachable in the push range
   (`git rev-list --objects <remote>/main..HEAD`, or all of HEAD for the first push) for absolute home paths (a slash, the word Users or home, a slash, a name,
   a slash; and the Windows equivalent), personal emails (anything except the GitHub noreply domain and the org address), and complete token
   shapes only, each with a required minimum value length so that documentation mentioning a prefix never matches: GitHub OAuth/PAT tokens
   (`gh[opsu]_[A-Za-z0-9]{30,}`, `github_pat_[A-Za-z0-9_]{40,}`), npm (`npm_[A-Za-z0-9]{30,}`), OpenAI-style (`sk-[A-Za-z0-9_-]{32,}`), and
   header-with-value forms (`api-key["':= ]+[A-Za-z0-9]{24,}`); a hit fails with file:line; fixes rewrite the unpushed commits. A unit test runs the
   scanner over this roadmap unit and README and expects zero hits, and over planted real-shaped fakes and expects each to hit.
   The script is added in wp2 (package.json `privacy:scan`, CI checks job) so every phase stays clean. Confirm LICENSE, README, SECURITY, CHANGELOG.
2. Done in wp2 (W9-01): public repo, description, homepage, issues, main pushed. Remaining: set topics (video, ffmpeg, cli, ai-agents, codex,
   claude-code, motion-graphics) and light branch protection requiring the `ci` check on main via `gh api`.
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
   before the tag is pushed; with Path C the tag run also shows `publish` skipped (mode none); the token/oidc paths are documented for later releases
   and first exercised when the variable changes.
3c. Choose exactly one publisher before pushing the tag: if `gh secret list -R lidge-ai/vid2-gen` (or the org) shows NPM_TOKEN → set
   `NPM_PUBLISH_MODE=token` (Path B); else if `npm whoami` succeeds locally → set `NPM_PUBLISH_MODE=none` and publish locally (Path A); else set
   `NPM_PUBLISH_MODE=none` and record NEEDS_HUMAN (Path C). After the first publish and trusted-publisher setup the variable becomes `oidc`.
4. Tag first: once CI is green on main, create annotated tag `v0.1.0` on that exact SHA and push it; all publishing uses that tag.
   npm: the name `vid2-gen` is free (checked 2026-09-27); trusted publishing needs the package to exist first (001 §e). Path A (mode none,
   local login) → `npm publish --access public` from a clean checkout of tag v0.1.0. Path B (mode token) → the tag push runs release.yml, the only
   publisher. Path C → NEEDS_HUMAN with one procedure for the user: `npm login --registry=https://registry.npmjs.org/`, `npm whoami`,
   `curl -fL -o vid2-gen-0.1.0.tgz https://github.com/lidge-ai/vid2-gen/releases/download/v0.1.0/vid2-gen-0.1.0.tgz`,
   `npm publish ./vid2-gen-0.1.0.tgz --access public` (the exact tarball attached to the release, packed from a clean checkout of the tag);
   everything else is completed. After the first publish, document configuring the npm trusted publisher (github.com/lidge-ai/vid2-gen,
   workflow release.yml) and switch the variable to `oidc` for later tags.
5. After npm shows the version (or the NEEDS_HUMAN record exists): `gh release create v0.1.0 --verify-tag --title "vid2 0.1.0" --notes-file
   <generated from CHANGELOG> <npm pack tarball> <dogfood mp4>` — creation and upload in one command.
6. Post-release verification (Path C): the release page lists both assets; the tarball installed from the release URL into a temporary npm
   prefix runs `vid2 version|doctor|skill list --json`. Registry checks (`npm view vid2-gen version`, `npx -y vid2-gen@0.1.0 doctor --json`,
   the npm badge) stay pending until the user completes the NEEDS_HUMAN publication.

### Audit wp9 round 1 folds (normative)

- Remote (blocker 1): this checkout's `origin` is ima2-gen. Every push uses the explicit URL `https://github.com/lidge-ai/vid2-gen.git`
  (main: `HEAD:refs/heads/main`; tag: `refs/tags/v0.1.0`), after `gh repo view lidge-ai/vid2-gen --json url` confirms the target.
- Protection order (blocker 2, round 2): topics now; branch protection (require `ci`) is the **very last** action — after the tag, the release,
  the 090 archive commit and that commit's green CI run — so no direct push follows it.
- npm badge (blocker 3): the README npm badge and `npm install -g vid2-gen` line are replaced, in the release commit, by the release-tarball
  install (`npm install -g https://github.com/lidge-ai/vid2-gen/releases/download/v0.1.0/vid2-gen-0.1.0.tgz`) with a note that npm publication is
  pending; the badge and npm line return after `npm view vid2-gen version` succeeds.
- Tarball smoke (blocker 4): `P=$(mktemp -d)`; `npm install --global --prefix "$P" https://github.com/lidge-ai/vid2-gen/releases/download/v0.1.0/vid2-gen-0.1.0.tgz`;
  then `"$P/bin/vid2" version --json`, `"$P/bin/vid2" doctor --json`, `"$P/bin/vid2" skill list --json` (absolute path, from a directory outside any
  checkout); version must equal 0.1.0.
- Closeout (blocker 5): this task copies `examples/vid2-launch/.work/` to `~/.vid2/evidence/vid2-launch-0.1.0/` (verified by file count and size),
  records the worktree replacement and the `codex/vid2-gen` branch deletion in ima2-gen as **pending** (a later idle task, with separate
  authorization for the ima2-gen branch deletion), and closes the goal with that note.

## File map

NEW .github/workflows/release.yml, CHANGELOG.md entry 0.1.0 (MODIFY), README badges (MODIFY). No engine changes except CI fixes (recorded here).

## Verification (C for wp9)

`gh run list --commit <sha>` shows ci success with all matrix legs completed; `gh api repos/lidge-ai/vid2-gen --jq .visibility` = public;
`npm view vid2-gen version` (or NEEDS_HUMAN record); `gh release view v0.1.0 --json assets`.
