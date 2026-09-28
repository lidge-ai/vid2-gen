# 040 — WP5: generated clips (G10)

Decisions D5.1–D5.2 (006).

## File change map

| File | Change |
|---|---|
| src/assets/ima2.ts, src/assets/resolve.ts, src/assets/provider.ts | MODIFY: runtime VideoOptions guard (durationS int 1–15, resolution 480p/720p/1080p, 1080p only without references, aspectRatio enum, readable seedImage, referenceImages 1–7 exclusive with seedImage → repeated \`--ref\` + \`--as-reference\`, 720p cap); errors E_INPUT at \`sources.<id>.options.<key>\`; capability probe of the installed ima2 CLI flags. |
| src/assets/resolve.ts, src/render/runner.ts, src/cli/commands/render.ts | MODIFY: keep sourceId → probed duration; \`W_GENERATED_CLIP_HOLD <sourceId> <sceneId>\` when a read outlasts the clip. |
| examples/generated-video/ | NEW: timeline + README (generated media not committed). |
| structure/assets.md, README.md | SoT sync. |

## Accept criteria

1. Invalid options (durationS 20, 8 references, 1080p with references) fail before any provider call (spy counts zero).
2. A 5 s generated clip on a 7 s layer produces exactly one W_GENERATED_CLIP_HOLD with 2 s held; a 4 s layer produces none.
3. Live receipt: \`vid2 assets resolve\` generates one Grok clip through ima2 (model, request id, probed duration recorded), \`vid2 render\` + \`vid2 qa\` + \`vid2 analyze\` succeed on the example.
4. typecheck, lint, tests pass.

## Amendments from reflection (006 G-13–G-14)

- G-13: file map adds src/cli/commands/assets.ts (direct `assets gen` path uses the same guard) and src/assets/manifest.ts (provider readiness before a paid miss). Unknown video option keys are rejected. Accept 1b: an ima2 CLI whose `video --help` lacks `--as-reference` makes a referenceImages request fail with E_CAPABILITY and zero sends. An offline file-provider fixture drives CI.
- G-14: the effective read is `out − in` when `out` is set, else `span × speed`; an intentional shorter trim never warns. The warning reaches `<out>.render.json`; plan-shared.ts joins the file map. If the live Grok lane is unavailable, WP5 is reported "not fully verified" and the offline fixture does not substitute.
- Tests: src/assets/ima2.test.ts, resolve.test.ts, manifest.test.ts, cli.test.ts, tests/e2e/assets-ima2.test.ts.

## Amendments from audit round 1 (blockers 1, 2)

- B1: `referenceImages` chain: src/assets/provider.ts `VideoOptions.referenceImages?: string[]`; src/assets/resolve.ts `requestFor` resolves each path relative to the timeline and reads bytes; src/assets/manifest.ts `normalizeAssetOptions` replaces paths with an ordered `referenceImagesSha: string[]` and `requestHash` includes it (seedImage and referenceImages mutually exclusive → E_INPUT); src/assets/ima2.ts passes one `--ref` per image in order and adds `--as-reference` only when exactly one reference is given (2–7 refs already select reference mode in the installed CLI); src/cli/commands/assets.ts `assets gen` gains a repeatable `--ref <path>` option mapped to referenceImages. Tests: same prompt with refs [A,B] vs [B,A] → different hashes; editing A's bytes → cache miss; identical request → cache hit; direct CLI with two `--ref` → two `--ref` flags on the ima2 command line (spy).
- B2: hold math: `requested = out !== undefined ? min(span·speed, out − in) : span·speed`, `available = max(0, probedDuration − in)`, held output seconds = `max(0, requested − available) / speed`. Warnings are computed in planFromTimeline after materialization (where the generated source's probed duration is known), stored in a new serialized `RenderPlan.warnings: string[]`, and copied by the runner into `<out>.render.json`; a `.plan.json` replay therefore keeps them. Tests: 5 s clip with in 4 s and span 2 s → warns 1 s held; speed 2 case; out-trim shorter than available → no warning; cache-hit materialization still warns; plan replay keeps the warning.

## Amendments from audit round 2 (R2-1, R2-5)

- R2-1: `referenceImages` paths stay in provider options (ima2.ts needs them for `--ref`). Bytes are hashed in `requestFor` and `generateOne` (mirroring seedImage), `AssetRequestKey`/`GenerateRequest` gain `referenceImagesSha?: string[]`, `requestHash` deletes `referenceImages` and includes the ordered SHA list, the manifest entry records `referenceImagesSha` next to `seedImageSha`, and `status` mode reports a missing reference like `seedMissing`.
- R2-5: plan-shared.ts reads `warnings: raw.warnings ?? []` for 0.2 plans (test replays a 0.2 plan without the field); render.ts de-duplicates hold warnings so a warning appears once in JSON output and `.render.json`.

## Amendments from wp5 reflection (041, supersede conflicting text above)

- V-1 no local tests: workers run typecheck and eslint only; CI (no ima2, no network) runs every test with the fake ima2 or the file provider. One PR, one budgeted CI fix round.
- V-2 shared contracts by main (workers never edit): src/assets/video-options.ts (VIDEO_RESOLUTIONS, VIDEO_ASPECTS, VIDEO_OPTION_KEYS, checkIma2VideoOptions signature and rules), src/assets/hold.ts (holdWarnings signature and text), VideoOptions.referenceImages, GenerateRequest/AssetRequestKey.referenceImagesSha, MaterializeResult.generatedVideos, RenderPlan.warnings (optional).
- V-3 guard: runs only for provider ima2 + kind video inside requestFor before hashing and cache lookup; the file provider keeps loose options. Aspect ratios are the fixed ima2 3.23.1 list. Any referenceImages caps resolution at 720p; seedImage may use 1080p. References 1..7 on a grok/ model lane, else 1..3.
- V-4 hash stability: a request without references hashes byte-identically to 0.2; a test pins one known hash.
- V-5 hold warning text `W_GENERATED_CLIP_HOLD <sourceId> <sceneId> held <h>s (<n> frames): clip <c>s, read <r>s from <in>s`, toFixed(2), sceneId "overlays" for root overlays, only when ≥ 1 output frame is held, de-duplicated. plan-shared sets plan.warnings (not PlanLoad.warnings); the runner prepends plan.warnings into <out>.render.json; render and compile de-duplicate. A 0.2 plan replays with [].
- V-6 clip duration on a cache hit: manifest durationS; old entries probe the cached file; still unknown → null (no warning). Placeholder mode adds nothing.
- V-7 capability probe: run the ima2 executable directly with `video --help` (plain stdout, exit 0; bypass call(), which forces --json); asReference = /--as-reference\b/. Memoized per provider instance in process. Probed only when referenceImages are present, after the cache lookup, so a cache hit needs no ima2. Missing flag → E_CAPABILITY before any generate. For 2–7 references the probe only proves a CLI new enough for reference mode (ima2 ignores the flag there).
- V-8 fake ima2 (tests/fixtures/bin/fake-ima2.mjs): `video --help` branch, FAKE_IMA2_MODE=no-as-reference, argv log file for --ref order and zero-generate assertions.
- V-9 limits documented in structure/assets.md: ima2 defaults to 480p while vid2 passes 720p; Windows absolute paths in --ref may parse as file:tag (untested, CI has no ima2); the live receipt is macOS only.
- Worker split:

| Worker | Owns |
|---|---|
| W1 guard + adapter | video-options.ts body, provider.ts (referenceImages only), ima2.ts, manifest.ts, resolve.ts (requestFor, generatedVideos), src/cli/commands/assets.ts, tests/fixtures/bin/fake-ima2.mjs, src/assets/{ima2,manifest,resolve,cli}.test.ts, tests/e2e/assets-ima2.test.ts |
| W2 hold warning | hold.ts body + hold.test.ts, src/cli/commands/{plan-shared,render,compile}.ts, src/render/runner.ts (render.json warnings only), tests/e2e/generated-hold.test.ts |
| W3 example + docs | examples/generated-video/{timeline.json,timeline.offline.json,README.md}, structure/{assets,render}.md, README.md, skills/vid2-timeline/references/schema.md, skills/vid2-cli/SKILL.md, CHANGELOG Unreleased, one case in tests/e2e/examples.test.ts |


## Amendments from wp5 audit round 1 (V-10..V-13)

- V-10 a scene `background` naming a generated video counts as a read (in 0, speed 1, whole scene length, that scene's id) in holdWarnings; hold.test.ts covers it.
- V-11 path order: requestFor resolves seedImage and referenceImages against the timeline folder, assets gen resolves --ref against cwd, then the guard runs, then file existence is checked (status-mode "missing" like seedMissing).
- V-12 the capability probe reuses the ima2.ts launch prefix (ctx.bin, or [process.execPath, script] for .mjs) with [...prefix.slice(1), "video", "--help"] and no --json, through ctx.runner, so the fake works on Windows and tests can intercept it.
- V-13 offline example media: examples/generated-video/timeline.offline.json uses the file provider with a clip the test generates (ffmpeg lavfi testsrc2, 5 s, 320×180) into a temp dir; nothing is committed. W3's case in tests/e2e/examples.test.ts renders at proxy with that clip on a 7 s layer and expects exactly one W_GENERATED_CLIP_HOLD.

