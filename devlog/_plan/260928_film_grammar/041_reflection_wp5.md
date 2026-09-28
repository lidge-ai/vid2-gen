# WP5 reflection (architect of 006), main b7c072a8, installed ima2 3.23.1. Workers run typecheck and eslint only; CI has no ima2 and no network.

## 1. Split: three workers, disjoint write scopes (after main writes section 2)
- **W1: request guard and ima2 adapter.**
  - Code: src/assets/video-options.ts (fill main's stub), provider.ts (add `referenceImages` only), ima2.ts (guard, `--ref`/`--as-reference`, flag probe), manifest.ts (`normalizeAssetOptions`, `requestHash` with `referenceImagesSha`), resolve.ts (`requestFor` and the `generatedVideos` field in section 2), src/cli/commands/assets.ts (`--ref` repeatable, guard).
  - Tests: tests/fixtures/bin/fake-ima2.mjs, ima2.test.ts, manifest.test.ts, resolve.test.ts, cli.test.ts, tests/e2e/assets-ima2.test.ts.
- **W2: hold warning.** src/assets/hold.ts + hold.test.ts (new, pure), src/cli/commands/{plan-shared,render,compile}.ts, src/render/runner.ts, tests/e2e/generated-hold.test.ts (file provider plus a lavfi clip made at test time, nothing committed).
- **W3: example and docs.** examples/generated-video/{timeline.json, timeline.offline.json, README.md}; structure/{assets,render}.md; README; skills/vid2-timeline/references/schema.md; skills/vid2-cli/SKILL.md; plus one case in tests/e2e/examples.test.ts that validates timeline.offline.json.

## 2. Contracts a worker would otherwise guess: main commits these before dispatch
```ts
// src/assets/video-options.ts (new; W1 implements the body)
export const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const VIDEO_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "auto"] as const; // ima2 3.23.1 help
export const VIDEO_OPTION_KEYS = ["durationS", "resolution", "aspectRatio", "model", "seedImage", "referenceImages", "timeoutS"] as const;
/** Pure and offline. Throws Vid2Error("E_INPUT", msg, { details: { path: `${prefix}.${key}` } }). prefix is "sources.<id>.options" or "--flag" for assets gen. */
export declare function checkIma2VideoOptions(raw: Record<string, unknown>, prefix: string): VideoOptions;
// provider.ts VideoOptions: durationS int 1..15; resolution (typeof VIDEO_RESOLUTIONS)[number]; aspectRatio (typeof VIDEO_ASPECTS)[number];
//   model; seedImage?: string; referenceImages?: string[] (absolute paths, 1..7; 1..3 when the model lane is not "grok/"); timeoutS?: number
// GenerateRequest and AssetRequestKey add referenceImagesSha?: string[]; MaterializeResult adds
//   generatedVideos: Record<string, { durationS: number | null }>   // sourceId → clip seconds
// src/compile/ir.ts RenderPlan adds  warnings?: string[]   // optional: existing RenderPlan literals in tests stay valid
// src/assets/hold.ts (W2)
export declare function holdWarnings(t: ResolvedTimeline, generated: Record<string, { durationS: number | null }>): string[];
```
- **Guard rules.**
  - Unknown keys are rejected. `seedImage` and `referenceImages` are mutually exclusive.
  - Any `referenceImages` caps resolution at 720p. `seedImage` (one-ref I2V) may use 1080p.
  - The guard runs only for provider `ima2` + kind `video`, inside `requestFor` **before hashing and cache lookup**. Today `requestFor` uses provider-agnostic `normalizeAssetOptions` (src/assets/resolve.ts:28) and ima2's check runs only at generate (ima2.ts:139). The file provider keeps its loose options.
- **Hash stability (missing from the plan).** `requestHash` for a request without references must stay byte-identical to today's (manifest.ts:28-34). Otherwise every user's cached Grok clip misses and is paid for again. Add a test that pins one known hash value.
- **Warning text:** `W_GENERATED_CLIP_HOLD <sourceId> <sceneId> held <h>s (<n> frames): clip <c>s, read <r>s from <in>s`.
  - Values use `toFixed(2)`. `sceneId` is `"overlays"` for a root overlay.
  - Emit only when `n` is at least one output frame, so probe rounding (5.005 s) never warns.
  - Scope: scene `media` layers and root `overlay` layers whose source id is in `generatedVideos`. The source loses its generated origin after materialization (resolve.ts:48-50), so key by id.
  - Deduplicate by exact string.
- **Warning flow.** plan-shared sets `plan.warnings = holdWarnings(...)` and keeps them **out of** `PlanLoad.warnings`. runner.ts prepends `plan.warnings ?? []` into the `warnings` it writes to `<out>.render.json` (runner.ts:244-251). render.ts and compile.ts deduplicate the concatenation with a Set (compile.ts:18 also surfaces them). Replay of a 0.2 plan reads the missing field as [].
- **Probed duration on a cache hit.** Use `hit.durationS` from the manifest; ima2.ts:167 and file.ts:21 store the probed duration of the copied bytes. If an old entry lacks it, `probeMedia(hit.path).duration`; if that is still missing, null (no warning, plus a debug note). Placeholder mode puts nothing in `generatedVideos`.
- **Capability probe.** `ima2 video --help` prints plain text to **stdout** and exits 0, even with `--json` (checked). It must bypass `call()`, which appends `--json` and requires JSON (ima2.ts:99-110).
  - Run `runner(executable, [...prefix.slice(1), "video", "--help"])` and set `asReference = /--as-reference\b/.test(stdout)`.
  - Memoize one promise per provider instance (in process only, no disk cache).
  - Probe only when `referenceImages` is present, **after** the cache lookup and `capabilities()` (a cache hit needs no ima2). Missing flag → `E_CAPABILITY` before the generate call.
- **Fake ima2.** tests/fixtures/bin/fake-ima2.mjs currently treats any `video` command as a generate (:55). Add a `video --help` branch, plus a mode env (e.g. `FAKE_IMA2_MODE=no-as-reference`) that omits the flag. Record argv to a file so tests can assert `--ref` order and zero generate calls.

## 3. Drift against ima2 3.23.1 `video --help`
- **Aspect ratios.** Only 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3 and auto are valid. The plan's "valid aspect ratio for the selected model" has no source in the CLI; use the fixed list above.
- **Resolution with references.** Help says "2-7 refs → max 720p" and is silent on one ref plus `--as-reference`. The plan's "1080p only without references" works if it means `referenceImages` (any count) ≤720p and `seedImage` unrestricted. State that.
- **Reference maximum by lane.** "Repeatable: Grok max 7, MCP max 3." The plan caps at 7 for all lanes. Cap at 3 when the model lane is not `grok/`, or reject references off the Grok lane.
- **Default resolution.** ima2 defaults to 480p and vid2 to 720p (manifest.ts:22). Harmless, since vid2 always passes `--resolution`. Document the difference.
- **Ref parsing.** `--ref <file|@last|file:tag>`: a Windows absolute path (`C:\x.png`) contains ":" and may parse as file:tag. Untested (CI has no ima2). Record it as a Windows limitation in structure/assets.md; the live receipt is macOS only.
- **`--as-reference` with 0 or 2+ refs is ignored** by ima2, which matches B1 (flag only for exactly one ref). The probe gates any `referenceImages` request; 2–7 refs need the flag only as a proxy for a CLI new enough to support reference mode. Say so.
- **`--duration` limits.** 1..15 matches; edit and extend use 2..10, which is out of scope.

REFLECTION: CHANGES
