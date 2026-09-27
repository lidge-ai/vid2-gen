# 090 — Closeout (archive, standalone checkout, handoff)

After wp9 D: (1) append the final attestation to 000; (2) move this unit to `devlog/_fin/260927_vid2_roadmap/` in a docs commit and push;
(3) replace the orphan-branch linked worktree with a standalone clone: `git clone https://github.com/lidge-ai/vid2-gen.git /tmp/vid2-gen-clone`,
verify HEAD equals origin/main, remove the linked worktree with `git -C <ima2-gen> worktree remove <path>` (only after confirming no uncommitted
work), move the clone into vid2-gen, delete the local branch `codex/vid2-gen` from the ima2-gen repo
(its objects remain reachable from the new clone's remote); (4) goalplan validate + update_goal complete; (5) final report with evidence.
Step (3) happens only after the FSM cycle is closed because the session source is bound to the worktree path.

