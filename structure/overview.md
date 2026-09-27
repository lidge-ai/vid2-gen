# Architecture overview

vid2-gen is a single ESM TypeScript package. The installed `vid2` executable loads compiled JavaScript; a source checkout can run `.ts` directly on Node 22.18+. The foundations pipeline is:

```text
timeline.json → strict schema → relational validation → frame resolution
                                         ↓
                                   CLI JSON result
ffmpeg/ffprobe → capability probe → doctor report

resolved timeline → compile (RenderPlan) → render: segments → join → post → verified mp4
```

Capture, audio, asset materialization, and QA extend this pipeline in later phases.

| Module | Responsibility | Boundary |
|---|---|---|
| `src/shared` | Errors, process execution, time and path utilities | No feature ownership |
| `src/timeline` | Schema, time resolution, relational validation | Imports shared; no CLI output |
| `src/probe` | Tool location and capability inspection | Imports shared; no timeline mutation |
| `src/compile` | Timeline → RenderPlan (filtergraphs, ASS text, joins) | Imports timeline, probe, shared; never render |
| `src/render` | Runs a RenderPlan with ffmpeg; cache, progress, verification | Imports compile types only |
| `src/cli` | Parsing, command registration, output contract | Calls timeline and probe public indexes |
| `src/index.ts` | Package API | Exposes supported public types/functions |
| `bin/vid2.js` | npm executable | Loads `dist/cli/index.js`, with checkout source fallback |

`structure/INDEX.md` points to the contract for each area. Feature folders expose boundary exports through their `index.ts`; commands consume those boundaries.

## Dependency policy

Runtime dependencies: `zod` (schema) and `opentype.js` (see ADR-1). ffmpeg/ffprobe are external executables. Playwright and native input support belong to later phases and remain optional. A new runtime dependency requires a short architecture decision here: the need, alternatives considered, package size and platform impact, and validation plan.

**ADR-1 opentype.js (2026-09-27).** Need: Homebrew's ffmpeg 9 (and so a default macOS setup and the macOS CI runner) ships without
libass and freetype, so neither `ass` nor `drawtext` exists and text could not render. Alternatives: require a custom ffmpeg (bad first
run), download static ffmpeg builds (large, per-OS, licensing), render text in a browser (Playwright is optional and heavy). Choice:
opentype.js 2.0.0 (MIT, no dependencies, pure JS) parses the bundled fonts; vid2 lays out and rasterizes glyphs to PNG and animates them with
basic overlay filters (the raster text backend, structure/text.md). libass stays the default when present. Validation: raster and ASS
bounding boxes are compared in tests, and macOS CI runs every text test through the raster backend.

## Testing and packaging

`scripts/test.mjs` discovers colocated unit tests and end-to-end tests without shell globs, creates an isolated `VID2_HOME`, and runs Node's test runner. CI checks TypeScript, lint, schema drift, privacy, tests across three operating systems and two Node versions, then installs the npm tarball outside the checkout.
