# CLI contract

The executable is `vid2`. Every command accepts `--json`; `VID2_JSON=1` has the same effect. JSON mode writes exactly one newline-terminated object to stdout. Human-readable output goes to stdout on success and stderr on failure. Commands never prompt.

## Commands, subcommands and help

Commands live in `src/cli/registry.ts` as `CommandSpec`s: name, summary, one-line `usage`, `group`, `description`, `examples`,
`options` (each with `value` and `default` for help) and optional `subcommands`. `audio`, `assets`, `capture` and `skill` are
parents; each subcommand has its own options and `run`. A subcommand must directly follow its parent
(`vid2 audio beats x.wav`). `src/cli/tree.ts` resolves argv to the deepest spec and applies these rules:

- A parent with no positional word runs its `defaultSubcommand` (`skill` → `list`) or fails `E_INPUT "<parent> needs a subcommand"`
  with `details.subcommands`.
- An unknown word fails `E_INPUT unknown subcommand` (or `unknown command` at the top) with `details.suggestion` when a name is within
  edit distance 2. A subcommand word after an option (`vid2 audio --json beats`) fails with "beats must directly follow vid2 audio".
- Options are strict per command: a subcommand accepts its own options, its parent's options and the global `--json` and `-h/--help`.
  `-v/--version` is accepted only before a command word.
- Positional arguments are counted: extra words fail `E_INPUT` instead of being ignored, and so do extra words after
  `vid2 help <command> [subcommand]`. The command word must come before `--`.

`-h`/`--help` anywhere, and `vid2 help <command> [subcommand]`, answer with help for the deepest spec before options are parsed, so
help never runs a command and never fails on a bad flag. Text help shows the synopsis, description, subcommands, options with value
names and defaults, inherited and global options, and examples; the root help groups commands and lists the environment variables.

JSON help (`--json`): `vid2 help` returns `data.usage` (the root text), `data.commands[]` (`name`, `summary`, `usage`, `options`, plus
`path`, `group`, `description`, `examples`, `subcommands[]` of the same shape, `defaultSubcommand`), `data.globalOptions` and
`data.environment`. Help for a command or subcommand returns `data.command` (the path, e.g. `"audio beats"`), `data.options` (own and
inherited), `data.synopsis` (the one-line usage), `data.summary`, `data.examples`, `data.subcommands`, `data.globalOptions`,
`data.commands` (that one spec) and `data.usage`. Since 0.5.0 `data.usage` holds the full help text; read `data.synopsis` for the
one-line form. A failure envelope's `command` is the resolved path (`"audio beats"`); success `command` values are unchanged.

Success shape:

```json
{"ok":true,"command":"version","data":{"version":"0.1.0"},"artifacts":[],"warnings":[],"meta":{"vid2":"0.1.0"}}
```

Failure shape:

```json
{"ok":false,"command":"validate","error":{"code":"E_SCHEMA","message":"timeline schema validation failed","fix":null,"details":{"issues":[]},"retryable":false},"meta":{"vid2":"0.1.0"}}
```

`data` is command-specific. `doctor` returns a capability report and warnings; `schema` returns the authored-input timeline JSON Schema; `validate` returns issues and a scene/duration summary; `resolve` returns the full resolved timeline. Schema and validation failures include issue paths in `error.details.issues`. Missing or unsuitable ffmpeg returns an actionable fix.

| Exit | Meaning | Codes |
|---:|---|---|
| 0 | Success | — |
| 1 | Unexpected internal failure | `E_INTERNAL` |
| 2 | Input or schema failure | `E_INPUT`, `E_SCHEMA`, `E_NOT_FOUND` |
| 3 | Missing capability | `E_CAPABILITY`, `E_FFMPEG_MISSING` |
| 4 | Access or provider failure | `E_ACCESS`, `E_PROVIDER` |
| 5 | Render failure | `E_RENDER` |
| 6 | QA failure | `E_QA` |
| 7 | Interrupted or timed out | `E_INTERRUPTED`, `E_TIMEOUT` |

The contract is specified in `devlog/_fin/260927_vid2_roadmap/010_foundations.md` and implemented in `src/cli/output.ts`, `src/cli/main.ts`, and `src/shared/errors.ts`.

`analyze <video> [--timeline t.json] [--bpm N] [--out dir]` returns an AnalyzeReport v1 with shots, cuts, summary, measured audio, artifact paths and warnings. `review <video> [--timeline t.json] [--bpm N] [--out dir] [--base-url URL] [--model ID] [--listen] [--listen-excerpt S]` returns ReviewReport v1: status, model, evidence path, seven rubric scores (0–4 or `cannotDetermine`), sourced findings, listener result, limitations and usage. `REVIEWED` and `SKIPPED` exit 0 even if QA evidence contains failures or findings are critical. Image model errors use exits 4 or 7. Listener failure does not change the exit code. See [QA and review](qa.md) for endpoint, environment and trust rules.
