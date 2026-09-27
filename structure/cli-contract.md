# CLI contract

The executable is `vid2`. Every command accepts `--json`; `VID2_JSON=1` has the same effect. JSON mode writes exactly one newline-terminated object to stdout. Human-readable output goes to stdout on success and stderr on failure. Commands never prompt.

Available in the foundations phase: `doctor [--deep]`, `schema`, `validate <timeline.json>`, `resolve <timeline.json>`, `version`, and `help [command]`. `--help` on a command prints its usage. `help --json` returns every command's name, summary, usage, and options for agent discovery.

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
