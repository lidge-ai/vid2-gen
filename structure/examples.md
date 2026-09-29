# Examples

`examples/<name>/` holds the code and steps for one finished film: build scripts or a timeline, capture steps, music sources, a README
and an `example.json` manifest. Media, captures, generated timelines and renders never live there; they are made in the example's
workspace, `$VID2_HOME/examples/<name>` (default `~/.vid2/examples/<name>`). The sources ship in the npm package, so an installed vid2
can list and copy every example.

## Manifest

`src/examples/manifest.ts` validates `example.json` with a strict zod schema: `name` (equals the folder), `title`, `summary`,
optional `durationS` and `size`, `techniques[]`, `goodFor[]` (the requests the example answers), `needs[]` (`tool`, `optional`,
`note`), `edit[]` (`file`, `what`: where to change content for a new film), `steps[]` (`run`, `note`) and `output` (the final video,
relative to the workspace). `steps[].run` are the README's bash-block lines in order, without `cd` lines and trailing comments;
`tests/e2e/examples.test.ts` enforces this, checks that every `vid2` step resolves to a real command with real options, and that
every example appears in `examples/README.md` and in the vid2-examples skill.

## Catalog and workspaces

`src/examples/catalog.ts` lists folders under `<package>/examples` that hold a manifest and loads one by name (unknown names fail
`E_INPUT` with `details.examples`). `src/examples/workspace.ts` copies an example's sources into its workspace or `--dir`. By default
it writes only files the destination does not have, so edits survive a re-run; `force` overwrites them. Top-level `media/`, `out/`,
`.work/`, `*.vid2cap/` and any `.DS_Store` are neither copied nor touched. The destination must not be inside the packaged source and
must not be a file; a non-empty folder that is not this example's workspace (its `example.json` names another example or is missing)
needs `force`. All three refusals are `E_INPUT`. `examples/workspace.mjs` is the repository-only wrapper over the same module and
always forces, because in a checkout the sources are edited in the repository.

## CLI

`vid2 example ls` lists examples (name, title, summary, duration, needs, goodFor, `workspace` path, `ready` when it exists) and the
`vid2 init` templates. `vid2 example show <name>` returns the manifest plus `source`, `readme`, `workspace` and `ready`.
`vid2 example new <name> [--dir <path>] [--force]` syncs the sources and returns `path`, `source`, `files`, `copied`, `skipped`,
`steps` and `output`; in text mode it prints only the path (and a note on stderr when files were kept), so
`cd "$(vid2 example new <name>)"` works. `vid2 example path <name> [--source]` prints the workspace (or
packaged source) path without side effects.

## Packaging

`package.json` `files` adds `examples` and excludes `examples/workspace.mjs` and `examples/ima2-launch/check-sync.mjs` (both import
`src/`, which is not packed), the workspace-only folders and `.DS_Store`. npm also skips files that an example's own `.gitignore` lists (generated `timeline.json`s) and
the nested `.gitignore` files themselves. `tests/e2e/pack.test.ts` checks the exclusions in a temporary copy, that every tracked
example file ships, that example sources stay under 600 KB, and (with `VID2_PACK_TEST=1`) that the installed CLI runs
`vid2 example ls` and `vid2 example new`.
