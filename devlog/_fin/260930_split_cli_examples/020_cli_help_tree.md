# 020 wp3: a help tree for vid2

Design consultation: architect "Feynman" (agent 01a0ee08-9a4a-7d51-abec-58c863fd7268) proposal D1-D13, 2026-09-30. Dispositions are
listed at the end of this doc and in 030.

## Target behaviour

```text
$ vid2 --help                      grouped commands, global options, environment, examples
$ vid2 render --help               usage, description, options with <values> and defaults, global options, examples
$ vid2 audio --help                usage, subcommands with one line each and "(vid2 audio <sub> --help)", examples
$ vid2 audio beats --help          the beats spec only: its arguments, its own options, global options, examples
$ vid2 help audio beats            identical text to the line above
$ vid2 audio beats --bogus --help  still prints help (help is answered before strict option parsing)
$ vid2 -v | vid2 --version         vid2 0.5.0
$ vid2 audio beats --preset x      E_INPUT: unknown option (subcommands no longer share one option bag)
```

`--help` never calls `run`. JSON help keeps every field it has today.

## Files

| Path | Change |
|---|---|
| `src/cli/registry.ts` | MODIFY types (below); registration loop unchanged; `commands` stays top-level only |
| `src/cli/globals.ts` | NEW: `GLOBAL_OPTIONS` (json, help/-h), `TOP_OPTIONS` (+ version/-v), `ENVIRONMENT` table, `GROUPS` order/titles |
| `src/cli/tree.ts` | NEW: `resolveCommand(argv, registry)`, `optionsFor(node)`, `suggest(name, names)` |
| `src/cli/args.ts` | MODIFY: `parseCommand` uses `resolveCommand`; help detected before strict parse; strict parse over `optionsFor` |
| `src/cli/main.ts` | MODIFY: failure envelope reports `path.join(" ")`; help and version short-circuits |
| `src/cli/help/model.ts` | NEW: JSON help data for the root, a command or a subcommand |
| `src/cli/help/text.ts` | NEW: text renderer (ima2-style sections) |
| `src/cli/commands/help.ts` | MODIFY: thin wrapper over `resolveCommand` + `help/model.ts` + `help/text.ts` |
| `src/cli/commands/{audio,assets,capture,skill}.ts` | MODIFY: switch statements replaced by `subcommands` specs; implementation functions unchanged |
| every other `src/cli/commands/*.ts` | MODIFY: add `group`, `description`, `examples`, option `value`/`default` |
| `src/cli/commands/capabilities.ts` | MODIFY: commands gain `subcommands` (name, summary, usage) |
| `scripts/skills-lint.mjs` | MODIFY: `vid2 X Y` with X having subcommands requires Y to be one of them |
| `src/cli/help.test.ts` | NEW tests (below) |
| `src/cli/main.test.ts` | keep existing four tests unchanged; they must still pass |
| `structure/cli-contract.md` | MODIFY: help, subcommands, `-v`, failure `command` path |

## Types (registry.ts)

```ts
export interface CommandOption {
  type: "string" | "boolean";
  short?: string;
  multiple?: boolean;
  description: string;
  value?: string;      // "<file>", "<proxy|final>" shown after the flag
  default?: string;    // shown as "Default: ..."
}
export interface CommandSpec {
  name: string;                       // word typed on the command line ("render", "beats")
  summary: string;                    // one line
  usage: string;                      // synopsis line, e.g. "vid2 audio beats <file> [--json]"
  group?: CommandGroup;               // top-level commands only
  description?: string;               // paragraph(s) shown under the usage line
  examples?: string[];                // "vid2 render t.json -o out.mp4" lines
  options: Record<string, CommandOption>;   // own options; on a parent these are shared by every subcommand
  subcommands?: CommandSpec[];
  defaultSubcommand?: string;         // "list" for skill: bare "vid2 skill" keeps working
  run?(ctx: RunContext): Promise<CommandResult>;
}
export type CommandGroup = "author" | "render" | "media" | "review" | "agent";
```

A parent without `run` and without `defaultSubcommand` answers a bare call with
`E_INPUT "<name> needs a subcommand"`, `details.subcommands`, `fix: "run vid2 <name> --help"`.

## Resolution (tree.ts)

```ts
export interface Resolved { spec: CommandSpec; path: string[]; parents: CommandSpec[]; rest: string[]; help: boolean; version: boolean }
export function resolveCommand(argv: string[], registry: Map<string, CommandSpec>): Resolved
```

1. Scan `argv` with `parseArgs({strict:false, tokens:true})`. `help` = any `-h`/`--help` token. `version` = `-v`/`--version`
   token when no positional exists.
2. The first positional is the command; none → `help` (or `version`). Unknown → `E_INPUT unknown command` with
   `details.commands` (unchanged) and `details.suggestion` from a Levenshtein ≤ 2 match.
3. Descend while the argv element right after the current command word is a subcommand name of the current spec. A subcommand
   must directly follow its parent (`vid2 audio beats x.wav`), so a file named `beats` elsewhere in argv is never taken as one.
4. With no matched subcommand and a `defaultSubcommand`, descend into it without consuming argv.
5. `rest` = argv minus the consumed command words.

`optionsFor(resolved)` = `GLOBAL_OPTIONS ∪ each parent's options ∪ spec.options`; a duplicate key between levels throws at
registration (tested) so a subcommand cannot silently shadow a parent option.

`vid2 help a b` calls `resolveCommand(["a","b"])`; an unknown word after a valid parent reports
`E_INPUT unknown subcommand` with `details.subcommands` of the deepest valid parent.

## main.ts

```ts
const resolved = resolveCommand(argv, commands);
command = resolved.path.join(" ") || "help";
if (resolved.version) → version result
if (resolved.help) → { command: "help", data: helpData(resolved) }       // no strict parse, no run
const values/positionals = strict parse of resolved.rest over optionsFor(resolved)
if (!resolved.spec.run) → E_INPUT needs a subcommand
run(...)
```

The failure envelope `command` becomes the resolved path (`"audio beats"`), matching the success values those commands
already return (`audio.ts:28,74`, `capture.ts:141`). Success `command` strings do not change (`skill` keeps `"skill"`).

## JSON help (help/model.ts)

- `vid2 help --json`: `data.usage` (the full root text), `data.commands[]` = every top-level command
  `{name, summary, usage, options, group, description, examples, subcommands[]}` where `subcommands[]` has the same shape plus
  `path`; `data.globalOptions`, `data.environment`.
- `vid2 <path> --help --json` and `vid2 help <path> --json`: `data.usage` (full help text), `data.command` (path string),
  `data.options` (own + inherited parent options), `data.summary`, `data.synopsis` (the one-line usage),
  `data.description`, `data.examples`, `data.subcommands`, `data.globalOptions`, plus `data.commands` = `[that spec]` so the
  old `vid2 help <cmd>` shape still holds.
- Text mode keeps printing `data.usage` (`output.ts:21`, unchanged).

## Text layout (help/text.ts)

Root, modelled on `ima2 --help`:

```text
  vid2 <version> — the video CLI for coding agents, powered by ffmpeg

  Usage: vid2 <command> [options]

  Author:
    init <template> [dir]   Copy a ready-to-edit video timeline template
    example <sub>           List and copy the example films     (vid2 example --help)
    ...
  Render: / Media: / Review: / Agent and setup:
    ...
  Global options:
        --json              One JSON object on stdout (same as VID2_JSON=1)
    -h, --help              Help for vid2 or any command, e.g. vid2 audio beats --help
    -v, --version           Print the version
  Environment:
    VID2_HOME  ...
  Examples:
    ...
  Run 'vid2 <command> --help' for options, and 'vid2 help <command> <sub>' for a subcommand.
```

Command: synopsis line, description, `Subcommands:` (if any, with "(vid2 <path> <sub> --help)"), `Options:` with
`-o, --out <file>` columns and `Default: x` suffix, `Inherited options:` (parent options, if any), `Global options:`,
`Examples:`. Column width is computed per section; lines are not wrapped (terminals wrap).

## Groups and metadata per command

| Group | Commands |
|---|---|
| author | init, example (030), schema, validate, resolve, compile |
| render | render, preview |
| media | capture, audio, assets, probe |
| review | qa, analyze, review |
| agent | doctor, capabilities, skill, version, help |

Subcommand splits (options move from the parent bag to the subcommand that reads them; B re-reads each implementation's
`values[...]` reads before assigning):

| Parent | Subcommands and their options |
|---|---|
| audio | `beats <file>`; `snap <seconds>` (bpm, offset); `synth` (preset, bpm, duration, key, out); `sfx <preset>` (out); `generate <timeline>`; `providers` |
| assets | `resolve <timeline>`; `gen <provider> <image\|video> <prompt>` (size, quality, background, model, duration, resolution, aspect-ratio, seed-image, ref, out); `providers` |
| capture | `web` (steps, script, url, serve, size, scale, fps, out, record-text, headed, browser); `electron` (steps, script, app, fps, out, record-text); `native` (display, window, region, duration, stop-file, events, cursor, fps, out); `terminal` (tape, cast, out); `devices`; `inspect <session>`; `mark <session> <label>` |
| skill | `list` (default); `path [name]`; `install` (dir, tmp, agent, link) |

Every command and subcommand gets at least one example line; every string option gets a `value`.

## Tests (src/cli/help.test.ts)

1. Walk every top-level spec and every subcommand: text help contains its synopsis; JSON help parses as one object with
   `data.command` = path. (activation: loop over `commands`)
2. `--help` never runs: register a throwaway spec whose `run` throws, call `main([name,"--help"])` → exit 0.
3. `main(["help","audio","beats"])` stdout === `main(["audio","beats","--help"])` stdout.
4. `main(["audio","beats","--bogus","--help"])` → exit 0 and prints the beats synopsis.
5. `main(["-v"])` and `main(["--version"])` → `vid2 <packageVersion()>`.
6. `main(["audio","beats","--preset","x","--json"])` → exit 2, `command` = `"audio beats"`.
7. `main(["audio","--json"])` → exit 2, `details.subcommands` includes `beats`; `main(["skill","--json"])` → exit 0 (default list).
8. `main(["rendr","--json"])` → `details.suggestion` = `"render"`.
9. Root help text lists all five group titles and every top-level command exactly once.
10. Option key collision between a parent and a subcommand throws from `optionsFor`.

Existing `src/cli/main.test.ts` tests 1-4 and `tests/e2e/*` stay green unchanged, apart from any e2e that asserted the old
merged-bag parsing (re-checked in B with `rg -n '"(audio|assets|capture|skill)"' tests`).

## Verifiers

`node --test src/cli/help.test.ts src/cli/main.test.ts` (reads the new modules by import); `npm run skills:check` (imports
`src/cli/registry.ts`, `scripts/skills-lint.mjs:5`); `npm run typecheck`, `npm run lint`, `npm test` (`scripts/test.mjs` runs
`src/**/*.test.ts` and `tests/e2e`).

## Architect dispositions (A-side decisions)

D1 accepted. D2 accepted: parent `options` are the shared set. D3 accepted, with subcommands required to directly follow the
parent. D4 accepted for failures; success strings unchanged. D5 accepted, plus `data.synopsis`. D6 amended: the help renderer
splits into `help/model.ts` and `help/text.ts`, but subcommand specs stay in the existing command files (audio 88, assets 141,
capture 151, skill 40 lines today; each stays under 500 lines with the specs) instead of new folders. D7 accepted. D8 accepted
as tests 1-10.

## Reflection folds (Feynman: ALIGNED with gaps, 2026-09-30)

These rules supersede the sections above where they differ.

- R1 (gap 1). `resolveCommand` does not descend into `defaultSubcommand` when `help` is true, and `vid2 help <path>` resolves
  with help semantics. `vid2 skill --help` therefore shows the skill parent (`data.command` = `"skill"`), while a bare
  `vid2 skill` still runs `list`.
- R2 (gap 2). Duplicate option keys throw from `optionsFor`. Test 1 calls `optionsFor` for every spec path, so a collision fails
  the suite rather than a user's command. `vid2 audio --json beats` does not descend (step 3) and answers "audio needs a
  subcommand"; `structure/cli-contract.md` states that a subcommand directly follows its parent.
- R3 (gap 3). Test 2 adds its throwaway spec to `commands` and deletes it in `finally`; tests 1 and 9 build their expectations
  from `commands` at call time, and node:test runs a file's tests sequentially.
- The help renderer reads the version through `packageVersion()`; root text starts with `vid2 <version>`.

## Audit folds (Goodall round 1, 2026-09-30) — supersede the sections above

- A1 (High; amends D1). `run` stays required on every `CommandSpec`. A parent's `run` is `dispatchSubcommand(parent)` from
  `tree.ts`: it takes `args[0]`, finds the subcommand (or the default when `args` is empty), and calls its `run` with the
  remaining args and the same values. Unknown words raise R-A2's error. Direct calls in tests keep working unchanged:
  `tests/e2e/template-check.ts:47`, `tests/e2e/templates.test.ts:14`, `src/qa/preview-cli.test.ts:20`, `src/qa/run.test.ts:71`,
  `src/skill/install.test.ts:30` (`skill.run({args:["list"|"path"|"install"]})`), `src/assets/cli.test.ts:20`
  (`assets.run({args:["gen"|"resolve",...]})`). `main()` still resolves the deepest spec itself so strict option parsing uses
  that subcommand's options; the dispatcher only serves direct callers. Type change is limited to adding optional fields.
- A2. `defaultSubcommand` is used only when no positional follows the parent (`vid2 skill`, `vid2 skill --json`). A positional
  that is not a subcommand raises `E_INPUT unknown subcommand: <word>` with `details.subcommands` and `details.suggestion`
  (Levenshtein ≤ 2), in `main` and in the dispatcher. Tests: `vid2 skill instal --json` → exit 2, suggestion `install`;
  `vid2 audio beatz x.wav --json` → exit 2, suggestion `beats`.
- A3. `capture terminal` options are `tape, cast, fps, out`.
- A12. `resolveCommand(argv, registry, opts?: { help?: boolean })`; `vid2 help <path>` passes `{ help: true }`. The helper is
  `optionsFor(resolved: Resolved)` everywhere. JSON help serializes `defaultSubcommand` when set, and capabilities'
  `subcommands[]` carry `path`, like help's. `data.usage` in per-command help changes meaning from the one-line synopsis to the
  full help text (the synopsis moves to `data.synopsis`); `structure/cli-contract.md` and the 0.5.0 CHANGELOG say so.
- A1a (architect recheck, ALIGNED). `main` calls `resolved.spec.run` (the deepest spec) with `rest`, which no longer holds the
  command words; it never calls a parent's dispatcher. The main.ts line "`if (!resolved.spec.run)` → needs a subcommand" is
  replaced by: the resolved spec has `subcommands` and no default applied → `E_INPUT "<name> needs a subcommand"` with
  `details.subcommands` and `fix`. `dispatchSubcommand` passes `values` through unchecked (direct callers such as
  `src/assets/cli.test.ts:20` rely on that); with empty `args` and no default it raises the same needs-a-subcommand error that
  `audio.ts:85` and `capture.ts:148` raise today. Test: `main(["audio","beats","x.wav"])` reaches beats with `args = ["x.wav"]`
  (a spy spec, removed in `finally`).
- A13 (round 2 Low 3). Subcommand argument checks drop the action word: `skill list` takes no args, `skill path` 0-1,
  `skill install` 0; `audio beats` exactly 1, `audio snap` exactly 1, `audio sfx` 1, `audio generate` 0-1, `synth` and
  `providers` 0; `assets resolve` 1, `assets gen` 3, `assets providers` 0; `capture inspect` 1, `capture mark` 2, the four
  recorders and `devices` 0. Extra args raise `E_INPUT`. Test: `vid2 skill path a b --json` → exit 2.
- A14 (round 2 Low 4). When no descent happens and a later positional matches a subcommand name, the error is
  `E_INPUT "<sub> must directly follow <parent>"` with `fix: "vid2 <parent> <sub> ..."` (covers `vid2 audio --json beats` and
  `vid2 skill --agent codex install`); otherwise a first positional that is not a subcommand gets A2's unknown-subcommand error,
  and no positional at all gets needs-a-subcommand. This supersedes R2's answer for `vid2 audio --json beats`.
