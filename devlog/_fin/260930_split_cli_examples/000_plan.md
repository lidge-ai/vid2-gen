# 000 plan: vid2-gen on its own, a help tree, examples on demand, 0.5.0

Loop-spec: HOTL goal loop (codexclaw session 01a0ee04-1982-7861-9549-15bce63b0e68, goalplan
`separate-vid2-gen-from-ima2-gen-make-its-cli-hel`). Tool scope: local git, gh on lidge-ai/vid2-gen, npm for vid2-gen only,
read-only access to the ima2-gen checkout except the ref and worktree cleanup in 010. Write scope: this repository, the ima2-gen git
database refs listed in 010, a backup bundle under `~/.vid2/backups/`. Budget: one working session; wall-clock bound is the release
landing on npm. Authority: the user asked to separate the repositories, organize the CLI, add the examples skill and "배포" (release),
which covers pushing branches, opening and merging PRs after green CI, tagging and publishing vid2-gen 0.5.0.

## Why

1. The vid2-gen checkout is a git worktree of the ima2-gen repository. `git rev-parse --git-dir` prints
   `<workspace>/.git/modules/700_projects/ima2-gen/worktrees/vid2-gen`, `git remote -v` lists
   `lidge-ai/ima2-gen` and `fml09/ima2-gen`, and `git branch` shows about 90 ima2 branches next to six vid2 ones. Every vid2
   push so far named the vid2 URL by hand; one `git push origin` would have sent vid2 history to ima2-gen.
2. `vid2 --help` is a flat list, and `vid2 render --help` repeats one usage line without explaining any option. Commands with
   subcommands (`audio`, `assets`, `capture`, `skill`) have no subcommand help at all: `vid2 audio beats --help` prints the
   whole audio usage line. ima2-gen groups its commands, documents every option with value names and defaults, and gives each
   subcommand its own help.
3. The example films researched and built on 2026-09-29 (`devlog/_fin/260929_hw_bun_examples/001_research.md` §3 and the
   `examples/` folders) only exist in a git checkout. An agent with `npm i -g vid2-gen` cannot list or copy them, and no skill
   tells it which example matches a request.

## Work-phase map (dependency order)

| WP | Doc | Outcome | Verifier |
|---|---|---|---|
| wp1 | this unit | Roadmap written to diff level | A-phase audit of 000-040 |
| wp2 | [010](010_repo_split.md) | vid2-gen has its own `.git`; ima2-gen keeps no vid2 worktree or branch | `git rev-parse --git-dir`, `git branch -a`, `git -C <ima2> worktree list` |
| wp3 | [020](020_cli_help_tree.md) | Registry with groups, option metadata, examples, nested subcommands; help renderer; `-v` | `node --test src/cli/*.test.ts tests/e2e/cli.test.ts`, full `npm test` |
| wp4 | [030](030_example_command_skill.md) | `vid2 example ls/show/new/path`, manifests, packaged sources, `vid2-examples` skill | `node --test tests/e2e/examples.test.ts`, `VID2_PACK_TEST=1 node --test tests/e2e/pack.test.ts` |
| wp5 | [040](040_release.md) | PRs merged on green CI, main promoted, v0.5.0 tagged and on npm | hosted CI run ids, `npm view vid2-gen version` |

wp3 comes before wp4 because `vid2 example` is the first command written against the new subcommand spec, and the skill lint
checks skill text against the registry that wp3 reshapes.

## Scope

In: 010-040 as written. Out: ima2-gen source changes (its `ima2 service start --help` starts the service instead of printing
help; reported, not fixed here), new render features, committed media.

## Source of truth to sync in C

`structure/cli-contract.md` (help, subcommands, `-v`), `structure/INDEX.md` and `AGENTS.md` (new `src/examples/` owner),
`structure/skills.md` (new skill), `examples/README.md`, `README.md` (command list), `CHANGELOG.md`.

## Branches and PRs

Each PR targets `dev` and merges only after its head commit's CI passes (checks, 6-leg test matrix, pack, bun, aggregate `ci`).

1. `codex/vid2-intro-film` (existing two commits: the vid2-intro example).
2. `codex/cli-help-tree` (this unit's docs + wp3).
3. `codex/example-command` (wp4).
4. `codex/release-0.5.0` (version, changelog, outcome), then `dev` → `main`, tag `v0.5.0`, publish.
