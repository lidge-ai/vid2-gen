# 010 — wp2 Foundations (scaffold, CLI core, probe/doctor, timeline schema)

Consumes: 000 decisions ARCH-01/02/03/05/10, 001 conventions. Produces the contracts every later phase builds on.

## wp2 architect consultation

Architect Gibbs (01a0e327-89a3-7dd1-82df-f4bfaab3a280) proposal W2-01..W2-06 (2026-09-27). Dispositions: W2-01 accept (src/index.ts added,
main writes shared/ and package config first); W2-02 accept (no strip flag; bin fallback error; packed-install test outside the checkout);
W2-03 accept and verified locally (schema generated with io: input); W2-04 accept (lanes table below; projectService for typed lint);
W2-05 accept (runner rules, skip policy, zero-test failure); W2-06 accept (canary in a child process, platform-neutral assertions). Reflection: MISALIGNED on one contradiction (schema-json
instruction lacked `io: "input"`), fixed; all six decisions otherwise mapped.
Local proof before B: a scratch package on Node 24.17 ran a `.ts` test through `node --test`, built with tsc 5.9 rewriting `.ts` imports to
`.js`, and zod 4.6.5 strictObject rejected unknown keys with `additionalProperties: false` in the generated schema.

## Scope

IN: repository scaffold and governance files; npm package wiring; CLI dispatcher with the JSON/exit contract;
shared utilities; ffmpeg/ffprobe discovery and capability probing; known-bug canaries; `vid2 doctor`,
`vid2 schema`, `vid2 version`, `vid2 help`; timeline schema v1 (zod) + committed JSON Schema + time
resolver + relational validation (`vid2 validate`); test runner; ESLint; CI (3 OS); structure docs.
OUT: compiling/rendering (020), capture (030), audio (040), providers (050), skill/qa/init (060).

## File map (all NEW)

```text
.editorconfig  .gitattributes  .gitignore  LICENSE  README.md  AGENTS.md  CONTRIBUTING.md  SECURITY.md  CHANGELOG.md
package.json  package-lock.json  tsconfig.json  tsconfig.build.json  eslint.config.js
bin/vid2.js
scripts/test.mjs  scripts/schema-json.mjs  scripts/privacy-scan.mjs
schema/timeline.v1.json                     (generated, committed; drift-tested)
src/index.ts  (package root export: timeline schema/types, resolveTimeline, validateTimeline, Vid2Error, EXIT — W2-01)
src/cli/main.ts  src/cli/args.ts  src/cli/output.ts  src/cli/registry.ts  src/cli/index.ts
src/cli/commands/{doctor,schema,validate,resolve,version,help}.ts
src/shared/{errors,exec,time,hash,json,paths,log}.ts  src/shared/index.ts
src/probe/{ffmpeg,media,bugs,requirements,tools}.ts  src/probe/index.ts
src/timeline/{schema,types,resolve,validate}.ts  src/timeline/index.ts
colocated tests: src/shared/time.test.ts, src/shared/errors.test.ts, src/cli/output.test.ts, src/cli/main.test.ts,
  src/probe/ffmpeg.test.ts, src/probe/bugs.test.ts, src/probe/tools.test.ts, src/timeline/schema.test.ts, src/timeline/resolve.test.ts,
  src/timeline/validate.test.ts, src/timeline/json-schema-drift.test.ts
tests/helpers.ts  tests/e2e/cli.test.ts  tests/e2e/pack.test.ts  tests/e2e/bin.test.ts  tests/e2e/runner.test.ts
tests/fixtures/timelines/{minimal,beats,markers,invalid-*}.json  tests/fixtures/probe/{filters,encoders,devices,version-5.1,version-8.0}.txt
tests/fixtures/bin/fake-ffmpeg.mjs (prints a configurable `ffmpeg version X` banner and fixture outputs; invoked through the injectable runner, below)
structure/INDEX.md  structure/overview.md  structure/cli-contract.md  structure/timeline.md  structure/probe.md
.github/workflows/ci.yml  .github/pull_request_template.md  .github/dependabot.yml
devlog/README.md  devlog/_fin/.gitkeep
```

## Package wiring

package.json (complete):

```json
{
  "name": "vid2-gen",
  "version": "0.1.0",
  "description": "The video CLI for coding agents: capture your real app, generate assets, cut to the beat. Powered by ffmpeg.",
  "type": "module",
  "license": "MIT",
  "author": "lidge-ai",
  "homepage": "https://github.com/lidge-ai/vid2-gen#readme",
  "repository": { "type": "git", "url": "git+https://github.com/lidge-ai/vid2-gen.git" },
  "bugs": { "url": "https://github.com/lidge-ai/vid2-gen/issues" },
  "keywords": ["video", "ffmpeg", "cli", "agents", "codex", "claude-code", "screen-recording", "motion-graphics", "timeline"],
  "bin": { "vid2": "bin/vid2.js" },
  "exports": { ".": "./dist/index.js", "./schema/timeline.v1.json": "./schema/timeline.v1.json", "./package.json": "./package.json" },
  "types": "./dist/index.d.ts",
  "files": ["bin", "dist", "schema", "skills", "templates", "assets/fonts", "README.md", "LICENSE", "CHANGELOG.md"],
  "engines": { "node": ">=22.18" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint .",
    "test": "node scripts/test.mjs",
    "test:unit": "node scripts/test.mjs --unit",
    "schema:json": "node scripts/schema-json.mjs",
    "privacy:scan": "node scripts/privacy-scan.mjs",
    "prepack": "npm run build",
    "vid2": "node src/cli/index.ts"
  },
  "dependencies": { "zod": "^4.6.5" },
  "optionalDependencies": { "uiohook-napi": "^1.5.5" },
  "peerDependencies": { "playwright-core": ">=1.50" },
  "peerDependenciesMeta": { "playwright-core": { "optional": true } },
  "devDependencies": {
    "@eslint/js": "10.0.1", "@types/node": "^22.20.1", "eslint": "10.11.0", "globals": "17.12.0",
    "playwright-core": "1.63.0", "typescript": "^5.9.3", "typescript-eslint": "8.70.1"
  }
}
```

Note: `uiohook-napi` is added to optionalDependencies in 030 (not in this phase) so wp2 CI never compiles native code;
the block above shows the final 0.1 shape. In wp2 omit optionalDependencies and peerDependencies.

tsconfig.json: `{"compilerOptions":{"target":"ES2023","module":"NodeNext","moduleResolution":"NodeNext","strict":true,
"noUncheckedIndexedAccess":true,"exactOptionalPropertyTypes":true,"noImplicitOverride":true,"erasableSyntaxOnly":true,
"verbatimModuleSyntax":true,"allowImportingTsExtensions":true,"rewriteRelativeImportExtensions":true,"resolveJsonModule":true,
"skipLibCheck":true,"types":["node"],"noEmit":true},"include":["src","scripts","tests","eslint.config.js"]}`
tsconfig.build.json: extends tsconfig.json with `{"noEmit":false,"outDir":"dist","rootDir":"src","declaration":true,
"sourceMap":true}`, include `["src"]`, exclude `["src/**/*.test.ts"]`.
eslint.config.js (flat config): `@eslint/js` recommended for all; `typescript-eslint` recommendedTypeChecked scoped to `**/*.ts` with
`languageOptions.parserOptions.projectService: true` and `tsconfigRootDir: import.meta.dirname` (W2-04); `*.mjs`/`*.js` files get plain
recommended + globals.node; ignores dist, node_modules, schema, coverage; rules: no-floating-promises error, consistent-type-imports error.
bin/vid2.js: `#!/usr/bin/env node` → `import('../dist/cli/index.js')`; if dist is missing and a src/ tree exists
(repo checkout), fall back to `import('../src/cli/index.ts')` (Node >= 22.18 strips types) — this lets `npm link` work before build; if
neither exists it prints "vid2: build output missing (run npm run build)" to stderr and exits 1 (W2-02).
scripts/test.mjs: enumerates test files with `fs.readdirSync(…, {recursive: true})` (no shell globs): `src/**/*.test.ts` plus
`tests/e2e/*.test.ts` unless `--unit` (and `--e2e` for only e2e) under `--root <dir>` (default: the repository root, used by runner.test.ts);
fails with exit 1 when zero files are found; sets `VID2_HOME` to a fresh
`fs.mkdtempSync(os.tmpdir()/vid2-test-)`; spawns `node --test --test-concurrency=4 <files>` without a shell and exits with the child's status
(W2-05). Skip policy: helpers `requireFfmpeg(t)`/`requirePlaywright(t)` in tests/helpers.ts call `t.skip(reason)` only when the matching
`VID2_REQUIRE_*` variable is unset; when set, a missing tool fails the test.
scripts/schema-json.mjs: imports src/timeline/schema.ts, writes `z.toJSONSchema(TimelineSchema, {target:"draft-2020-12", io:"input"})`
with `$id: "https://raw.githubusercontent.com/lidge-ai/vid2-gen/main/schema/timeline.v1.json"` to schema/timeline.v1.json (2-space JSON + newline).
The published schema describes **authored input** (W2-03): `z.toJSONSchema(TimelineSchema, {target: "draft-2020-12", io: "input"})` so defaulted
fields are optional (verified locally: `io: "input"` drops defaulted keys from `required`, output mode keeps them). Refinements JSON Schema
cannot express (font needs path or family) stay runtime-only and are listed in structure/timeline.md; schema.test.ts asserts defaulted fields
are not required, unknown keys are rejected by both zod and the JSON Schema (`additionalProperties: false`), and fixtures behave identically.

## CLI contract (src/cli, src/shared/errors.ts)

```ts
// src/shared/errors.ts
export const EXIT = { OK: 0, INTERNAL: 1, INPUT: 2, CAPABILITY: 3, ACCESS: 4, RENDER: 5, QA: 6, INTERRUPTED: 7 } as const;
export type ErrorCode = "E_INPUT" | "E_SCHEMA" | "E_NOT_FOUND" | "E_CAPABILITY" | "E_FFMPEG_MISSING" | "E_ACCESS"
  | "E_PROVIDER" | "E_RENDER" | "E_QA" | "E_TIMEOUT" | "E_INTERRUPTED" | "E_INTERNAL";
export function exitFor(code: ErrorCode): number; // E_INPUT/E_SCHEMA/E_NOT_FOUND→2, E_CAPABILITY/E_FFMPEG_MISSING→3,
                                                   // E_ACCESS/E_PROVIDER→4, E_RENDER→5, E_QA→6, E_TIMEOUT/E_INTERRUPTED→7, else 1
export class Vid2Error extends Error {
  readonly code: ErrorCode; readonly details: Record<string, unknown> | undefined; readonly retryable: boolean; readonly fix: string | undefined;
  constructor(code: ErrorCode, message: string, opts?: { details?: Record<string, unknown>; retryable?: boolean; fix?: string; cause?: unknown });
}
// src/cli/output.ts
export interface CommandResult { command: string; data: Record<string, unknown>; artifacts?: string[]; warnings?: string[] }
export function renderSuccess(r: CommandResult, json: boolean): string;
  // json: {"ok":true,"command":"…","data":{…},"artifacts":[…],"warnings":[…],"meta":{"vid2":"0.1.0"}}
export function renderFailure(e: unknown, json: boolean): { text: string; exit: number };
  // json: {"ok":false,"command":"…","error":{"code","message","fix","details","retryable"},"meta":{"vid2":"0.1.0"}}
// src/cli/registry.ts
export interface CommandSpec { name: string; summary: string; usage: string;
  options: Record<string, { type: "string" | "boolean"; short?: string; multiple?: boolean; description: string }>;
  run(ctx: { args: string[]; values: Record<string, unknown>; json: boolean; cwd: string; stderr: NodeJS.WritableStream }): Promise<CommandResult>; }
export const commands: Map<string, CommandSpec>; export function register(spec: CommandSpec): void;
// src/cli/main.ts
export async function main(argv: string[], io?: { stdout; stderr; cwd }): Promise<number>; // returns exit code, never throws
```

Rules: stdout carries exactly one JSON object when `--json` (global flag, also `VID2_JSON=1`); logs/progress go to stderr;
unknown command → E_INPUT with the command list in details; `--help` per command prints usage; SIGINT → E_INTERRUPTED (exit 7).
`vid2 help --json` lists every command with options (agents' discovery surface).

## Shared utilities

- exec.ts: `run(cmd: string, args: string[], opts?: {cwd?; timeoutMs?; input?: Buffer|string; onStderrLine?: (l: string)=>void; env?})
  : Promise<{code: number|null; signal: NodeJS.Signals|null; stdout: Buffer; stderr: string; ms: number}>` using spawn without shell;
  timeout kills with SIGKILL and yields signal. `runChecked` throws Vid2Error(E_RENDER, message incl. last 20 stderr lines).
- time.ts: `type Fps = {num: number; den: number}`; `parseFps(v: number|string): Fps` ("30", 30, "30000/1001", "29.97"→30000/1001);
  `fpsValue(f)`; `secondsToFrames(s, f) = Math.round(s * f.num / f.den)`; `framesToSeconds(n, f)`;
  `parseTimeLiteral(v: number|string): {unit: "s"|"f"|"b"; value: number}` (number → seconds; "1.5s","1500ms","45f","2b");
  `toFrames(lit: TimeLiteralValue, ctx: {fps: Fps; beat?: BeatGrid}, kind: "position"|"duration"): number` with
  `BeatGrid = {bpm: number; offsetFrames: number; meter: number}` — beats: position = `offsetFrames + round(value*60/bpm * fps)`, duration =
  `round(value*60/bpm * fps)`; `fps` multiplication uses `num/den`
  only for absolute positions; durations in beats use `round(value*60/bpm*fps)` without offset (function takes `kind: "position"|"duration"`).
  Invalid literal → Vid2Error E_SCHEMA.
- json.ts: `stableStringify(v)` (sorted keys, no whitespace). hash.ts: `sha256(data: string|Buffer)`, `hashJson(v)`, `hashFile(path)` (stream).
- paths.ts: `vid2Home()` = `VID2_HOME` ?? `~/.vid2`; `cacheDir(kind)`; `packageRoot()` via `import.meta.url` walking up to package.json name vid2-gen.
- log.ts: `createLogger(stderr, level from VID2_LOG=debug|info|warn|silent)`.

## Probe (src/probe)

- Test seam (audit wp2 round 2 blocker 1): probe functions take an optional `runner: (cmd, args) => ReturnType<typeof run>` defaulting to
  shared/exec `run`; tests pass a runner that executes `process.execPath` with `tests/fixtures/bin/fake-ffmpeg.mjs <args>` and env
  `FAKE_FFMPEG_VERSION=5.1|7.0|8.0`, so no `.cmd` shim or shell is needed on Windows. The CLI e2e doctor test sets `VID2_FFMPEG` only for the
  missing-path case (a path that does not exist); version cases are covered at the probe level plus one e2e through the hidden test hook
  `VID2_TEST_FFMPEG_RUNNER=node-fake` (read only when `NODE_ENV=test`, documented as internal).
- ffmpeg.ts: `locateTools(): {ffmpeg: string; ffprobe: string}` from `VID2_FFMPEG`/`VID2_FFPROBE` or PATH (`where` on win32 via
  PATH scan, no shell); missing → E_FFMPEG_MISSING with install hints per OS (brew, winget/choco, apt).
  `probeFfmpeg(opts?: {refresh?: boolean}): Promise<FfmpegInfo>` where
  `FfmpegInfo = {path; version: string; major: number; minor: number; buildFlags: string[]; filters: Set<string>; encoders: Set<string>;
  decoders: Set<string>; devices: {demuxers: string[]}; hwaccels: string[]; libs: {ass: boolean; freetype: boolean; harfbuzz: boolean; vmaf: boolean; placebo: boolean}}`
  parsed from `ffmpeg -hide_banner -version | -filters | -encoders | -decoders | -devices | -hwaccels | -buildconf`.
  Cached in `cacheDir("probe")/ffmpeg-<sha of path+mtime+size>.json` (Sets serialized as arrays).
- media.ts: `probeMedia(path): Promise<MediaInfo>` via `ffprobe -v error -print_format json -show_format -show_streams`:
  `{path; kind: "image"|"video"|"audio"; width?; height?; fps?: Fps; frames?: number; duration?: number; pixFmt?; colorRange?; hasAudio: boolean; sampleRate?; channels?}`
  (image = single frame + image2/png/mjpeg codec; frames from nb_frames or duration*fps).
- bugs.ts: `KNOWN_BUGS: {id; summary; affects(info): boolean; canary(info, tools): Promise<"present"|"absent"|"skipped">; workaround: string}[]`
  with `drawtext-animated-fontsize-segv` (canary: 1-frame color source with drawtext fontsize expression; present if signal SIGSEGV or code>128)
  and `xfade-short-first-input` (documentation-only; canary skipped).
- requirements.ts: `requireFeatures(info, {filters?: string[]; encoders?: string[]; libs?: (keyof FfmpegInfo["libs"])[]}, context: string)`
  → throws E_CAPABILITY with missing list.

`vid2 doctor [--deep] [--json]`: reports node version, platform/arch, tool paths, ffmpeg version, lib flags, counts and the presence of
every filter in the effects allowlist (from 020 — in wp2 a static list in probe/index.ts: xfade, perspective, zoompan, overlay, alphamerge, ass,
subtitles, drawtext, lut3d, curves, eq, tmix, minterpolate, chromakey, despill, perspective, gblur, vignette, noise, rgbashift, colorkey,
loudnorm, ebur128, aevalsrc, amix, acompressor, alimiter, sidechaincompress, showspectrumpic, showwavespic, blackdetect, tile),
capture devices (avfoundation/gdigrab/ddagrab/x11grab/kmsgrab), hw encoders (h264_videotoolbox, h264_nvenc, h264_qsv, h264_amf, h264_vaapi),
optional deps (playwright-core, uiohook-napi) via dynamic import resolution, external tools `tools: {vhs, agg, asciinema}` (absolute path or null,
from src/probe/tools.ts `locateOptionalTools()` scanning PATH without a shell; unit test builds a temp PATH with fake executables present/absent and
asserts both outputs — this is the producer of 070's fallback signal), fonts bundled, and with `--deep` runs bug canaries.
Exit 0 when ffmpeg+ffprobe exist and ffmpeg ≥ 6.1 (warnings list missing optional features and versions < 7.1); exit 3 when either tool is
missing or ffmpeg < 6.1 (fix: per-OS install hint).

## Timeline schema v1 (src/timeline/schema.ts) — the public contract

```ts
export const TimeLiteral = z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?(s|ms|f|b)$/)]);
export const EventRef = z.strictObject({ event: z.string().min(1), source: z.string().optional(), offset: z.string().regex(/^-?\d+(\.\d+)?(s|ms|f|b)$/).optional() });
export const MarkerRef = z.strictObject({ marker: z.string().min(1), offset: z.string().regex(/^-?\d+(\.\d+)?(s|ms|f|b)$/).optional() });
export const BarRef = z.strictObject({ bar: z.number().int().min(1), beat: z.number().min(1).default(1) }); // 1-based, needs a beat grid
export const Time = z.union([TimeLiteral, EventRef, MarkerRef, BarRef]);
export const Color = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
export const Output = z.strictObject({ width: z.number().int().min(16).max(7680).default(1920), height: z.number().int().min(16).max(4320).default(1080),
  fps: z.union([z.number().positive(), z.string()]).default(30), background: Color.default("#000000"),
  container: z.enum(["mp4","mov","webm"]).default("mp4"), videoCodec: z.enum(["h264","hevc","prores","vp9"]).default("h264"),
  quality: z.enum(["proxy","standard","high"]).default("high") });
export const Beat = z.union([ z.strictObject({ bpm: z.number().min(20).max(300), offset: TimeLiteral.default(0), meter: z.number().int().min(1).max(12).default(4) }),
  z.strictObject({ map: z.string() }) ]);
export const Source = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("image"), path: z.string() }),
  z.strictObject({ type: z.literal("video"), path: z.string(), muted: z.boolean().default(false) }),
  z.strictObject({ type: z.literal("audio"), path: z.string() }),
  z.strictObject({ type: z.literal("capture"), session: z.string() }),
  z.strictObject({ type: z.literal("generate"), provider: z.string(), kind: z.enum(["image","video","audio"]), prompt: z.string(), options: z.record(z.string(), z.unknown()).default({}) }),
  z.strictObject({ type: z.literal("color"), color: Color }) ]);
export const Font = z.strictObject({ path: z.string().optional(), family: z.string().optional() }).refine(f => f.path || f.family);
export const TRANSITIONS = ["cut","fade","fadeblack","fadewhite","dissolve","slideleft","slideright","slideup","slidedown","wipeleft","wiperight",
  "wipeup","wipedown","circleopen","circleclose","radial","smoothleft","smoothright","smoothup","smoothdown","pixelize","zoomin","diagtl","diagtr",
  "diagbl","diagbr","hlslice","hrslice","vuslice","vdslice","squeezeh","squeezev","distance","hblur"] as const;
export const Transition = z.strictObject({ type: z.enum(TRANSITIONS), duration: TimeLiteral.default("0.3s") });
export const Ease = z.enum(["linear","in","out","inout","punch"]);
export const CameraKey = z.strictObject({ at: TimeLiteral, zoom: z.number().min(0.2).max(8).default(1), x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5), ease: Ease.default("inout") });
export const Camera = z.union([ z.array(CameraKey).min(1), z.strictObject({ auto: z.literal("events"), zoom: z.number().default(1.6), hold: TimeLiteral.default("0.8s") }) ]);
export const Window = z.strictObject({ x: z.number().int(), y: z.number().int(), width: z.number().int().positive(), height: z.number().int().positive(),
  radius: z.number().int().min(0).default(18), shadow: z.boolean().default(true), border: z.boolean().default(true),
  perspective: z.strictObject({ rx: z.number().min(-45).max(45).default(0), ry: z.number().min(-45).max(45).default(0) }).optional() });
const Span = { start: TimeLiteral.default(0), end: TimeLiteral.optional() };
export const MediaLayer = z.strictObject({ type: z.literal("media"), source: z.string(), fit: z.enum(["cover","contain","blurfill"]).default("cover"),
  in: Time.optional(), out: Time.optional(), speed: z.number().positive().default(1), camera: Camera.optional(), window: Window.optional(),
  motion: z.enum(["none","kenburns","punch","drift"]).default("none"), opacity: z.number().min(0).max(1).default(1),
  chroma: z.strictObject({ color: Color, similarity: z.number().default(0.2), blend: z.number().default(0.05) }).optional(),
  volume: z.number().min(0).max(4).default(0), ...Span });
export const TextLayer = z.strictObject({ type: z.literal("text"), text: z.string().min(1), font: z.string().default("sans"),
  weight: z.enum(["regular","semibold","bold","black","italic"]).default("bold"), size: z.number().positive().default(72), color: Color.default("#F5F5F2"),
  x: z.union([z.number(), z.literal("center")]).default("center"), y: z.union([z.number(), z.literal("center")]).default("center"),
  align: z.enum(["left","center","right"]).default("center"), maxWidth: z.number().positive().optional(),
  animation: z.enum(["none","fade","rise","slam","pop","type","wipe","blur"]).default("rise"), animationDuration: TimeLiteral.default("0.35s"),
  box: z.strictObject({ color: Color, padding: z.number().default(24) }).optional(),
  shadow: z.strictObject({ color: Color.default("#00000099"), blur: z.number().default(8), y: z.number().default(3) }).optional(), ...Span });
export const ShapeLayer = z.strictObject({ type: z.literal("shape"), shape: z.literal("rect"), x: z.number(), y: z.number(), width: z.number(), height: z.number(),
  color: Color, radius: z.number().default(0), ...Span });
export const OverlayLayer = z.strictObject({ type: z.literal("overlay"), source: z.string(), blend: z.enum(["screen","add","normal"]).default("screen"),
  opacity: z.number().min(0).max(1).default(0.9), motion: z.enum(["none","sweep"]).default("none"), ...Span });
export const Layer = z.discriminatedUnion("type", [MediaLayer, TextLayer, ShapeLayer, OverlayLayer]);
export const Effect = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("grade"), lut: z.string().optional(), brightness: z.number().default(0), contrast: z.number().default(1),
    saturation: z.number().default(1), temperature: z.number().int().min(1000).max(40000).optional() }),
  z.strictObject({ type: z.literal("motionblur"), frames: z.number().int().min(2).max(8).default(3) }),
  z.strictObject({ type: z.literal("vignette"), strength: z.number().min(0).max(1).default(0.3) }),
  z.strictObject({ type: z.literal("grain"), strength: z.number().min(0).max(30).default(3) }),
  z.strictObject({ type: z.literal("flash"), at: TimeLiteral, strength: z.number().default(0.5), decay: z.number().default(12) }),
  z.strictObject({ type: z.literal("rgbsplit"), at: TimeLiteral, frames: z.number().int().default(3), px: z.number().int().default(12) }) ]);
export const Scene = z.strictObject({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/), duration: TimeLiteral, background: z.union([Color, z.string()]).optional(),
  layers: z.array(Layer).default([]), effects: z.array(Effect).default([]), transition: Transition.optional(), notes: z.string().optional() });
export const SynthSpec = z.strictObject({ preset: z.string().default("launch"), key: z.string().default("Am"), progression: z.array(z.string()).optional(),
  sections: z.array(z.strictObject({ at: TimeLiteral, energy: z.enum(["intro","build","drop","break","outro"]) })).optional() });
export const Cue = z.strictObject({ at: Time, sfx: z.string(), volume: z.number().min(0).max(4).default(1) });
export const Audio = z.strictObject({ music: z.union([ z.strictObject({ source: z.string(), volume: z.number().default(1), fadeOut: TimeLiteral.default("1s") }),
  z.strictObject({ synth: SynthSpec, volume: z.number().default(1) }) ]).optional(), cues: z.array(Cue).default([]),
  voice: z.array(z.strictObject({ source: z.string(), at: Time, volume: z.number().default(1) })).default([]),
  duckMusicUnderVoice: z.boolean().default(true), loudness: z.strictObject({ target: z.number().default(-14), truePeak: z.number().default(-1) }).default({ target: -14, truePeak: -1 }) });
export const TimelineSchema = z.strictObject({ $schema: z.string().optional(), version: z.literal(1), output: Output.default({}),
  beat: Beat.optional(), sources: z.record(z.string(), Source).default({}), fonts: z.record(z.string(), Font).default({}),
  markers: z.record(z.string(), z.union([TimeLiteral, BarRef])).default({}),
  scenes: z.array(Scene).min(1), overlays: z.array(OverlayLayer).default([]), effects: z.array(Effect).default([]), audio: Audio.optional() });
export type Timeline = z.infer<typeof TimelineSchema>;
```

Schema change protocol (audit blocker 3, applies to every later phase): all schema objects are built with `z.strictObject` so unknown keys
fail with E_SCHEMA and a path (an agent typo is never silently stripped); an additive field ships in one commit with (1) schema.ts, (2) the
regenerated schema/timeline.v1.json (drift test), (3) its resolved form in resolve.ts types, (4) the named consumer, (5) tests for parse,
unknown-key rejection, drift and resolve round-trip. Schema v1 may only grow optional fields; renames/removals need `version: 2` + an upgrade
function.

types.ts (wp2 boundary for wp4, audit wp2 blocker 1): `export interface EventResolver { resolve(ref: {event: string; source?: string}):
{frame: number; sourceId: string} }` — frame is on the **timeline** clock (the capture layer's placement is applied by the resolver owner in
030). wp2 ships no implementation; tests use an in-memory fake `{resolve: (r) => ({frame: table[r.event], sourceId: "cap"})}`.
Offsets: every `offset` literal (EventRef, MarkerRef) is a signed duration parsed by `parseSignedLiteral` and added in frames after the
base reference resolves (`base + toFrames(|off|, ctx, "duration") * sign`), result clamped to ≥ 0.
resolve.ts: `resolveTimeline(t: Timeline, opts: {baseDir: string; events?: EventResolver}): ResolvedTimeline` where
`ResolvedTimeline = {fps: Fps; width; height; totalFrames; scenes: ResolvedScene[]; ...}`,
`ResolvedScene = {id; index; startFrame; frames; transitionIn: {type; frames} | null; transitionOut: {...} | null; layers: ResolvedLayer[]; effects}`.
Scene placement: `start[0]=0`; `start[i]=start[i-1]+frames[i-1]-transOut[i-1].frames` (a transition overlaps both scenes; "cut" = 0 frames);
`totalFrames = start[last]+frames[last]`. Layer spans resolve to scene-relative frames and are clamped to [0, frames].
Paths resolve against baseDir. EventRef without a resolver → Vid2Error E_INPUT "event references need a capture session (030)".
MarkerRef resolves through `markers` (literals or bar refs, never other markers, so no cycles); BarRef →
`offset + ((bar-1)*meter + (beat-1)) * 60/bpm` seconds → frames (position). `vid2 resolve <timeline> [--json]` prints the full
ResolvedTimeline (every scene, layer and cue with absolute frames and seconds) so agents can inspect what symbolic times became.
validate.ts (relational): unique scene ids; every `source`/`font` id exists (built-in fonts: sans, mono, serif); `transition.frames < min(frames[i], frames[i+1])`;
text start < end; overlay/media source kinds compatible (overlay needs image/video); beat required when any "b" literal is used;
sum rules produce `ValidationIssue{path; code; message}` list; `vid2 validate <timeline.json> [--json]` prints issues and resolved
summary (scenes with start/frames, total seconds); exit 2 when issues exist.

## Implementation lanes (W2-04, disjoint write scopes)

| Lane | Owner | Exclusive write scope |
|---|---|---|
| 0 (first, sequential) | main | package.json, package-lock.json, tsconfig*.json, `src/shared/**`, `src/index.ts` stub, `tests/helpers.ts`, `devlog/_fin/.gitkeep` |
| Tooling | sol executor | eslint.config.js, .editorconfig, .gitattributes, .gitignore, LICENSE, README.md, AGENTS.md, CONTRIBUTING.md, SECURITY.md, CHANGELOG.md, `bin/**`, `scripts/test.mjs`, `scripts/privacy-scan.mjs` (+ `scripts/privacy-scan.test.mjs`), `.github/**`, `tests/e2e/{pack,bin,runner}.test.ts`, `structure/INDEX.md`, `structure/overview.md`, devlog/README.md |
| Timeline | sol executor | `src/timeline/**`, `schema/**`, `scripts/schema-json.mjs`, `tests/fixtures/timelines/**`, `structure/timeline.md` |
| Probe | sol executor | `src/probe/**`, `tests/fixtures/probe/**`, `tests/fixtures/bin/**`, `structure/probe.md` |
| CLI | sol executor | `src/cli/**`, `tests/e2e/cli.test.ts`, `structure/cli-contract.md` |

Lanes code against the boundary exports named in this doc (`src/timeline/index.ts`, `src/probe/index.ts`); package.json changes requested by
a lane go through main. After all lanes stop, main integrates (src/index.ts exports, command registration), then runs the full gate.

## Tests (must exist and pass)

- time.test.ts: parseFps cases (30, "30000/1001", "29.97", invalid→throws); literal parsing; beats 120 bpm "2b" at 30 fps = 30 frames duration; position with offset.
- errors/output tests: exit mapping table; JSON success/failure shapes; stdout single line JSON.
- main.test.ts: unknown command → exit 2 + JSON code E_INPUT; `help --json` lists doctor/schema/validate/version.
- ffmpeg.test.ts: parser unit tests on captured fixture text of `-filters`/`-encoders` output; live probe test (skip w/o ffmpeg) asserting xfade present.
- bugs.test.ts: canary returns one of present/absent/skipped; affects() true for 8.0.x.
- schema.test.ts: minimal fixture parses with defaults; invalid fixtures fail with paths; json-schema-drift.test.ts: regenerated JSON Schema deep-equals committed file.
- resolve.test.ts: 3 scenes 2s/2s/2s with 0.5s fade transitions → starts 0,45,90, total 150 frames @30; cut transitions → 0,60,120.
- validate.test.ts: missing source id, transition longer than scene, beats without bpm.
- e2e cli.test.ts: spawn `node bin/vid2.js` doctor/schema/validate/resolve with --json; pack.test.ts (CI only via VID2_PACK_TEST=1): `npm pack` then
  install the tarball into a temp prefix and run `vid2 version --json` from outside the checkout.
- Conditional-path activation tests (audit wp2 blocker 2):
  - bin.test.ts: copy `bin/vid2.js` into temp layouts — (a) with `dist/cli/index.js` stub → uses dist; (b) only `src/cli/index.ts` stub → uses
    source; (c) neither → exit 1 and stderr "build output missing".
  - runner.test.ts: run scripts/test.mjs with `--root <tmp>` over (a) an empty tree → exit 1 "no test files"; (b) a tree with one test calling
    `requireFfmpeg(t)` and `PATH` without ffmpeg → skip when `VID2_REQUIRE_FFMPEG` unset, failure when set to 1; (c) a tree with one test calling
    `requirePlaywright(t)` and the child process started with `PLAYWRIGHT_BROWSERS_PATH` (Playwright's own variable) set to an empty temp dir
    before playwright-core is imported, so `chromium.executablePath()` points at a missing file and the helper sees no browser → skip when `VID2_REQUIRE_PLAYWRIGHT` unset, failure when set to 1.
  - doctor tests in src/probe/ffmpeg.test.ts + tests/e2e/cli.test.ts: `VID2_FFMPEG`/`VID2_FFPROBE` pointing to a missing path → exit 3
    E_FFMPEG_MISSING; to fake-ffmpeg reporting `version 5.1` → exit 3 with the upgrade fix; reporting `7.0` → exit 0 with a < 7.1 warning;
    reporting `8.0` → exit 0. The e2e variant spawns `node bin/vid2.js doctor --json` with env `NODE_ENV=test`,
    `VID2_TEST_FFMPEG_RUNNER=node-fake` and `FAKE_FFMPEG_VERSION=<v>` (the hook is ignored without NODE_ENV=test; a test asserts that too).
  - tools.test.ts: temp PATH with/without fake `vhs`/`agg`/`asciinema` → paths vs null.
  - resolve.test.ts additions: EventRef via the fake resolver; EventRef without resolver → E_INPUT; MarkerRef with offset "-0.5s" and a BarRef
    marker at 120 bpm (bar 3 beat 1 = 4 s = 120 frames @30); negative result clamps to 0.

## CI (.github/workflows/ci.yml)

Triggers: push to main, pull_request, workflow_dispatch. Concurrency per ref. Jobs:
1. `checks` (ubuntu-latest, node 22): npm ci, typecheck, lint, build, schema drift (`npm run schema:json && git diff --exit-code schema`),
   `npm run privacy:scan` (scripts/privacy-scan.mjs: tracked files at HEAD, or `--range A..B` blobs, checked for absolute home paths, personal emails
   and token patterns as specified in 080 step 1; unit-tested with planted positives in a temp repo).
2. `test` matrix os [ubuntu-latest, macos-latest, windows-latest] × node [22, 24]: install ffmpeg (ubuntu: `sudo apt-get install -y ffmpeg`;
   macos: `brew install ffmpeg`; windows: `choco install ffmpeg -y --no-progress`), `VID2_REQUIRE_FFMPEG=1 npm test`.
3. `pack` (ubuntu, node 22): `VID2_PACK_TEST=1 node --test tests/e2e/pack.test.ts`.
4. `ci` aggregate: needs all, fails if any failed/cancelled.
Permissions: contents: read.

## Docs

README (install-first; badges npm/license/node; 30-second example; command table; agent skill section placeholder filled in 060;
FAQ: why ffmpeg-first). AGENTS.md: product one-liner, layout map, commands (`npm test`, `npm run typecheck`, `npm run lint`,
`npm run build`), rules (read structure/ doc for the area you touch; JSON/exit contract is public; no new runtime deps without an ADR
line in structure/overview.md; record exact verification in devlog; never commit generated media except fixtures < 200 KB),
devlog convention. CONTRIBUTING.md: setup, tests, commit style (conventional commits), PR checklist. SECURITY.md: private reporting via
GitHub advisories. structure/: INDEX.md (ordered list), overview.md (pipeline diagram + module map + dependency policy),
cli-contract.md (exit codes, JSON shapes), timeline.md (schema v1 explained, timing math, examples), probe.md.
LICENSE MIT © 2026 lidge-ai. .gitignore: node_modules, dist, .vid2, coverage, *.log, .DS_Store, out/, .tmp/.

## Verification (C for wp2)

`npm ci && npm run typecheck && npm run lint && npm run build && npm test` (exit 0, test count > 0, no skipped ffmpeg tests locally);
`node bin/vid2.js doctor --deep --json` on this Mac shows libs.ass true and reports the drawtext canary result (expected "present" on 8.0.1);
`node bin/vid2.js validate tests/fixtures/timelines/minimal.json --json` ok; `VID2_PACK_TEST=1 node --test tests/e2e/pack.test.ts` passes.
Each command reads the change target: the test runner globs `src/**/*.test.ts` (scripts/test.mjs) and lint uses `eslint .`.
