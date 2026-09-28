# WP6 reflection (0.3.0 release), main 475f8f34; the release commit is being staged (38 files, package.json 0.3.0)
Verified read-only:
- lidge-ai/vid2-gen main = 475f8f34.
- Repo variable NPM_PUBLISH_MODE=none, so release.yml's publish job is skipped on a tag push.
- Protection on main: required check "ci", strict=false, enforce_admins=false, no required reviews.
- v0.2.0 has tgz, mp4 and poster assets and is marked "Latest".
- The staged devlog _fin files contain no home paths.

Executable as amended, with five fixes:
1. **Tag leak into ima2-gen (would trigger a publish there).** This checkout's git dir is ima2-gen's (common dir .git/modules/700_projects/ima2-gen), and it already holds local tags v0.1.0 and v0.2.0. ima2-gen's publish.yml runs on `tags: ['v*']`. Any `git push origin --tags` or `--follow-tags` from an ima2 worktree would push vid2 tags to lidge-ai/ima2-gen and start its publish workflow.
   Fix: push only `refs/tags/v0.3.0` by explicit vid2 URL, then `git tag -d v0.3.0 v0.2.0 v0.1.0` locally (all three exist on the vid2 remote).
2. **Stale files in the tarball.** `npm pack` in this checkout packs gitignored `dist/`, which already exists from earlier builds, and tsc never deletes outputs of removed modules.
   Fix: pack from a clean detached worktree of the tagged SHA (`git worktree add --detach <tmp> <sha>; npm ci; npm pack`). Record the tgz sha256 in the receipt, then remove the worktree.
3. **README goes stale when v0.3.0 becomes Latest.** The install line pins `releases/download/v0.2.0/vid2-gen-0.2.0.tgz` (README:27). "Full 30 s video" and the poster link point to `releases/latest` (README:6,9); v0.3.0 carries no film (X-2), so they would land on a release without the film.
   Fix: in the release commit, bump the install URL to v0.3.0 and point the film links at `releases/tag/v0.2.0`. Alternatively, re-upload the existing v0.2.0 mp4 and poster to v0.3.0 with `gh release download`/`upload`; that is not a re-render.
4. **Merge path.** The body's gates 3–4 (direct push of `codex/vid2-gen:main`) conflict with X-1 (PR). enforce_admins=false means an admin push would bypass the required "ci" check. strict=false means PR CI can pass on a stale base.
   Fix: strike gates 3–4. Push a `release/0.3.0` branch by explicit URL and open a PR with `-R lidge-ai/vid2-gen`. After merge, read the merge SHA from `gh pr view --json mergeCommit` and require `gh run list --commit <sha> --event push --workflow CI` = success. Only then tag that SHA; with a squash merge it differs from the local head.
5. **Version and notes.** Set 0.3.0 with `npm version 0.3.0 --no-git-tag-version`, which updates package.json and both lock fields and never creates a tag (see item 1). Build release notes with `--notes-file` from the extracted "0.3.0" CHANGELOG section; the heading must be renamed from "Unreleased" before the commit. Re-read NPM_PUBLISH_MODE right before pushing the tag.

REFLECTION: CHANGES
