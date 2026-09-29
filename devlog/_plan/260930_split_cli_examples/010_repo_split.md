# 010 wp2: give vid2-gen its own repository

## Current state (2026-09-30)

| Fact | Evidence |
|---|---|
| `vid2-gen/.git` is a file: `gitdir: <workspace>/.git/modules/700_projects/ima2-gen/worktrees/vid2-gen` | `cat .git` |
| Remotes are ima2's: `origin` = lidge-ai/ima2-gen, `fml09` = fml09/ima2-gen | `git remote -v` |
| vid2 root commit `e18dfca2d1c57b21f5cf48da7f477a03aa5ec8c4`; ima2 root `1162fb2b`; histories are unrelated | `git rev-list --max-parents=0` |
| Local branches descending from the vid2 root: `codex/vid2-bun` 0aa53cee, `codex/vid2-examples-workspace` 0bc46cbe, `codex/vid2-gen` f1ac2518, `codex/vid2-hw-encode` 6f6ecdaf, `codex/vid2-intro-film` d48edc8f (checked out, 2 commits not on GitHub), `codex/vid2-release-0.4.0` 90550a50 | `git merge-base --is-ancestor <root> <branch>` over `refs/heads` |
| No remote-tracking ref or tag in the ima2 database descends from the vid2 root; lidge-ai/ima2-gen has no vid2 branch | same loop over `refs/remotes` and tags; `gh api repos/lidge-ai/ima2-gen/branches` |
| lidge-ai/vid2-gen holds main, dev, the merged feature branches and tags v0.1.0-v0.4.0 | `gh api repos/lidge-ai/vid2-gen/branches`, `/tags` |
| Working tree is clean apart from untracked `.codexclaw/` (session state) and this plan folder | `git status -sb` |

## Steps

Variables: `IG=<workspace>/.git/modules/700_projects/ima2-gen`, `V=<workspace>/700_projects/vid2-gen`,
`BK=~/.vid2/backups/260930-vid2-from-ima2`.

1. Backup. `mkdir -p $BK && git -C $V bundle create $BK/vid2-branches.bundle codex/vid2-bun codex/vid2-examples-workspace
   codex/vid2-gen codex/vid2-hw-encode codex/vid2-intro-film codex/vid2-release-0.4.0`; `git bundle verify` must pass.
   Copy `$V/.git` (the pointer file) and `$IG/worktrees/vid2-gen` (the worktree admin dir) into `$BK`.
2. Standalone clone. `git clone --no-checkout https://github.com/lidge-ai/vid2-gen.git $BK/clone`, then
   `git -C $BK/clone fetch $BK/vid2-branches.bundle 'refs/heads/*:refs/heads/*'`. Set upstreams for branches that exist on GitHub
   (`git branch -u origin/<b> <b>` for codex/vid2-bun, codex/vid2-examples-workspace, codex/vid2-hw-encode,
   codex/vid2-release-0.4.0); `codex/vid2-gen` and `codex/vid2-intro-film` stay local-only until pushed.
3. Swap. `mv $V/.git $BK/dotgit-pointer.moved`, `mv $BK/clone/.git $V/.git`, `git -C $V symbolic-ref HEAD
   refs/heads/<current branch>`, `git -C $V reset -q` (rebuild the index from HEAD; the working tree is untouched).
   Add `.codexclaw/` to `$V/.git/info/exclude`, as the ima2 database did through its own exclude file.
4. Detach from ima2. `mv $IG/worktrees/vid2-gen $BK/ima2-worktree-admin` (git then no longer lists the worktree),
   `git -C $IG branch -D <the six branches>`. Nothing else in `$IG` changes.
5. Verify (all must hold):
   - `git -C $V rev-parse --git-dir` = `.git`; `git -C $V remote -v` shows only lidge-ai/vid2-gen.
   - `git -C $V branch -a` lists only vid2 branches; `git -C $V status -sb` shows the same untracked set as before the swap and
     no modified tracked files; `git -C $V log -1` = the pre-swap HEAD.
   - `git -C $IG worktree list` has no vid2-gen line; `git -C $IG for-each-ref refs/heads | grep vid2` is empty;
     `git -C <ima2-gen checkout> status -sb` is unchanged from before.
   - `git -C $V fsck --connectivity-only` passes.

## Rollback

Put the pointer file back (`mv $V/.git $BK/standalone.git; cp $BK/dotgit-pointer.moved $V/.git`), move the admin dir back to
`$IG/worktrees/vid2-gen`, and `git -C $IG fetch $BK/vid2-branches.bundle 'refs/heads/*:refs/heads/*'`.

## Not changed

ima2-gen's other branches, worktrees, remotes, tags, hooks and working trees; the parent `<workspace>` repository.

## Audit folds (Goodall round 1, 2026-09-30)

- A7 (rollback). Rollback order: `git -C $IG fetch $BK/vid2-branches.bundle 'refs/heads/*:refs/heads/*'` first, then move
  `$BK/ima2-worktree-admin` back to `$IG/worktrees/vid2-gen`, then restore the pointer file. Fetching after the admin dir is back
  fails with "refusing to fetch into branch ... checked out".
- A8 (authorship). The worktree config (`$IG/worktrees/vid2-gen/config.worktree`) sets `user.name = JUN`,
  `user.email` = the account email. Step 3 copies both into `$V/.git/config` (`git -C $V config user.name ...`); step 5 checks
  `git -C $V config user.name` = `JUN`.
- A10. The ima2 database did not exclude `.codexclaw/` (`git status` showed `?? .codexclaw/`). Step 5's untracked check compares
  against the pre-swap untracked set minus `.codexclaw/`.
- A7a (round 2 Low 2). Every rollback step runs only if its forward step ran (check: `$BK/ima2-worktree-admin` exists, pointer
  file moved), and the bundle fetch uses `--update-head-ok` so a partial rollback cannot stop on the checked-out branch.

## wp2 P re-verification (2026-09-30, after wp1 D)

- Branch set at execution time is computed, not copied: every `refs/heads` entry for which
  `git merge-base --is-ancestor e18dfca2d1c57b21f5cf48da7f477a03aa5ec8c4 <branch>` holds. Today that is the six branches above plus
  `codex/cli-help-tree` 148a17a6 (the wp1 docs commit), which is checked out. Step 1 bundles this set; step 4 deletes exactly this
  set from `$IG`; step 3's `symbolic-ref` uses `codex/cli-help-tree`.
- A concurrent task uses the ima2 database (`<codex worktrees>/16bf/ima2-gen` on `pr339-oauth-backoff`). The split touches only
  the vid2 refs and `$IG/worktrees/vid2-gen`; no `gc`, `prune` or `worktree prune` runs in `$IG`.
- Step 5 also checks that `git -C $IG worktree list` still shows every non-vid2 worktree it showed before the split.
- Architect reflection (Feynman, ALIGNED) folds:
  - Step 0 (new): record the baseline in `$BK/baseline.txt` before step 1: `git -C $V rev-parse HEAD`,
    `git -C $V status --porcelain`, `git -C $IG worktree list`, `git -C <ima2-gen checkout> status -sb`, the computed branch set.
    Precondition: `git -C $V status --porcelain` shows only untracked entries, and no other writer uses `$V` during the swap
    (wp3/wp4 start after wp2 closes).
  - Steps 1, 2 and 4 use the computed set, not the six names. Step 2 sets upstreams only for branches present in
    `git ls-remote --heads origin`; `codex/cli-help-tree`, `codex/vid2-gen` and `codex/vid2-intro-film` stay local-only.
  - Step 3's reason is A10's: the new `.git/info/exclude` gains `.codexclaw/`; the ima2 database never had it.
- wp2 audit folds (Goodall, GO-WITH-FIXES, blockers=1):
  - Step -1: commit the plan edits to `codex/cli-help-tree` before step 0, so the precondition (only untracked entries) holds.
  - Step 1 names its copies `$BK/dotgit-pointer.copy` and `$BK/ima2-worktree-admin.copy` (a plain `$BK/.git` would make
    `$BK` look like a worktree).
  - Step 0 records `git -C $V symbolic-ref HEAD`; step 3 uses that value.
  - Step 5's worktree-survival check ignores baseline entries already marked `prunable`.
  - A rollback after new commits in the standalone repository fetches from `$BK/standalone.git`, not the bundle.
