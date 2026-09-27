# vid2-gen agent guide

vid2-gen is a local ffmpeg-powered video CLI for coding agents. The 0.1 foundations own schema validation, timeline resolution, capability probing, and a stable JSON/exit contract. Later phases add rendering and capture.

## Where code belongs

| Area | Owner |
|---|---|
| `src/shared/` | Errors, subprocesses, time, paths, hashing, logging |
| `src/timeline/` | Authored schema, frame resolution, relational validation |
| `src/probe/` | ffmpeg and optional-tool discovery |
| `src/cli/` | Command registry, parsing, JSON and text output |
| `bin/` | Installed executable |
| `scripts/`, `tests/` | Build helpers and end-to-end contracts |
| `structure/` | Current architecture and public behavior |
| `devlog/_plan/`, `devlog/_fin/` | Active and finished implementation plans |

Read the owning document in [structure/INDEX.md](structure/INDEX.md) before changing an area. Keep `structure/` synchronized with implementation.

## Work rules

- Node 22.18+, ESM TypeScript with `.ts` relative imports; use syntax Node can strip and `tsc` can rewrite.
- Keep files under 500 lines and functions under 50 lines. Use zod 4 `strictObject` for authored objects.
- The `--json` envelope and exit codes are public contracts. Keep stdout to one JSON object in JSON mode; write progress to stderr.
- Runtime dependencies need a decision record in `structure/overview.md` before they are added.
- Keep personal paths, email addresses, credentials, and client data out of committed files. Never commit generated media except small test fixtures under 200 KB.
- Record exact verification commands and outcomes in the relevant devlog plan when closing work.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run privacy:scan
```

Run focused `node --test <file>` while iterating. The test runner creates an isolated `VID2_HOME`; CI requires ffmpeg and runs the package-install smoke test separately.
