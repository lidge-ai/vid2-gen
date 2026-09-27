# 050 — wp6 Assets (provider port, files, ima2-gen adapter, manifest/cache)

Consumes 010/020 (Source kind "generate", resolver), 040 (AudioProvider shares the provenance/cache shape). Research: 002 (ima2 contract). ARCH-08.

## wp6 architect consultation

Architect Gibbs W6-01..W6-06 (2026-09-28), with a read-only check of the local ima2 3.23.1 server: `ping` ok; `capabilities --require-server`
reports `source:"server"`, lane `oauth` ready (3 image models: gpt-6-luna/sol/astra), `grok` disconnected ("Grok login required"),
`grok-api` key-missing; both Grok video models are listed but not usable. Dispositions:

- W6-01 accept: main writes `src/assets/provider.ts` (port above + `RequestKey`) and `index.ts` first. `planFromTimeline` replaces each
  `generate` source with `{type: "image"|"video", path}` from the manifest before resolve (authored timeline untouched); `render --generate`
  materializes first; a saved `.plan.json` already holds resolved paths.
- W6-02 accept: two lanes (table below); the fake ima2 is invoked through an injected runner as `process.execPath fake-ima2.mjs …` (no shim),
  with modes for exit 0/3/4/5/6/8, tiny valid PNG/MP4 output for ffprobe, and an invocation counter file.
- W6-03 accept, amending the manifest location: `cacheDir("assets")/manifest.json` keyed by `requestHash = hashJson({provider, kind, prompt,
  options, seedImageSha})`, same atomic write and existence check as the audio manifest; files at `cacheDir("assets")/<hash16>.<ext>`. No
  project mutation on resolve. (Section "Manifest + cache" below is superseded.)
- W6-04/05 accept: readiness requires `source:"server"` **and** the selected lane `status:"ready"`; `executable:true` is not readiness. c-7 is
  met by a live image generation on the ready OAuth lane plus the recorded Grok gap (lane reason), without calling Grok. `video extend` stays out.
- W6-06 accept: fake-binary integration tests (render without manifest → exit 2 before ffmpeg; `--generate` calls once; next render reuses) for
  image and video sources, with audio untouched; live tests opt-in (`VID2_IMA2_LIVE=1`).

| Lane | Owner | Exclusive write scope |
|---|---|---|
| 0 (first) | main | `src/assets/{provider,index}.ts` |
| ima2 adapter | sol | `src/assets/ima2.ts` + tests, `tests/fixtures/bin/fake-ima2.mjs`, `tests/e2e/assets-ima2.test.ts` (opt-in live) |
| Local assets | sol | `src/assets/{manifest,resolve,registry,file}.ts` + tests, `src/cli/commands/assets.ts` |
| Integration (last) | main | `src/cli/commands/{plan-shared,render,validate,resolve}.ts`, `src/timeline/validate.ts` (+ `validate.test.ts`: referenced and unreferenced audio-generate sources), registry, `structure/assets.md`, README, `tests/e2e/assets.test.ts` |

## Scope

IN: asset provider port; file provider (default); ima2-gen adapter (image generation incl. transparent/chroma backgrounds, Grok video
text/image-to-video, continuation, first/last-frame analysis) through ima2's JSON CLI; asset manifest + cache (`cacheDir("assets")/manifest.json`, W6-03);
`vid2 assets resolve <timeline>`, `vid2 assets gen <provider> <kind> "<prompt>" [...]`, `vid2 assets providers --json`; compile-time
materialization of `generate` sources (`vid2 render` refuses to call providers unless `--generate` or the asset is cached, so renders stay deterministic).
`--generate` (audit blocker 4): MODIFY src/cli/commands/render.ts adds boolean option `generate`; when set, render calls
`materializeSources(timeline, baseDir, {mode: "generate"})` (src/assets/resolve.ts) before compile; without it compile reads the manifest only and a
missing generated asset raises E_INPUT (exit 2) with fix "run vid2 assets resolve <timeline> or pass --generate". Tests with the fake ima2 binary:
render without the flag and an empty manifest → exit 2; with the flag → provider invoked once and manifest written; a second render without the
flag uses the cache and does not invoke the provider (the fake counts invocations in a temp file).
OUT: `ima2 video extend` (CLI/route contract mismatch documented in 002 — excluded until ima2 fixes it); other generators (Runway, Veo,
Higgsfield) beyond the generic port; image editing.

## Port (src/assets/provider.ts)

```ts
export type AssetKind = "image" | "video"; // wp6 scope (audit round 1); audio generation lives in 040
export interface ProviderCapabilities { provider: string; available: boolean; reason?: string;
  kinds: { image?: KindStatus & { sizes?: string[]; backgrounds?: ("opaque"|"transparent"|"chroma-green")[] };
    video?: KindStatus & { maxSeconds: number; resolutions: ("480p"|"720p"|"1080p")[]; fromImage: boolean; continue: boolean }; analyze?: boolean } }
// Per-kind readiness (reflection wp6): the provider can be reachable while one kind is not (ima2: image ready, Grok video disconnected).
export interface KindStatus { available: boolean; status: string; lane?: string; model?: string; reason?: string }
export interface GenerateRequest { kind: AssetKind; prompt: string; options: Record<string, unknown>; seedImage?: string }
export interface MaterializedAsset { path: string; kind: AssetKind; width?: number; height?: number; durationS?: number;
  sha256: string; provenance: { provider: string; requestId?: string; model?: string; revisedPrompt?: string; params: Record<string, unknown>; createdAt: string } }
export interface AssetProvider { id: string; capabilities(): Promise<ProviderCapabilities>;
  generate(req: GenerateRequest, outDir: string, signal?: AbortSignal): Promise<MaterializedAsset>;
  analyze?(videoPath: string): Promise<{ text: string; method: string }> }
```
Registry: `providers = { file, ima2 }`; unknown provider → E_INPUT listing known ids.

## ima2 adapter (src/assets/ima2.ts)

Binary: `IMA2_BIN` or `ima2` on PATH, else `npx --no-install ima2-gen` is NOT attempted (no surprise installs) → capability
`available:false, reason:"ima2 CLI not found (npm i -g ima2-gen)"`. Server: `--server` from `IMA2_SERVER` when set, else ima2's own discovery.
capabilities(): `ima2 ping --json` (ok, base, version) → `ima2 capabilities --json --require-server` → `ima2 models --kind image --json` and
`--kind video --json`; image available when a selected image lane has status "ready"; video when a video lane is ready; statuses
disconnected/key-missing/locked → that *kind's* `available:false` with ima2's reason, while the reachable provider stays available. Exit-code mapping from ima2 (002 §b): 3 → E_PROVIDER "server not
running (ima2 serve)" retryable; 4 → E_ACCESS "sign in via ima2"; 5 → E_INPUT; 6 → E_PROVIDER retryable; 8 → E_TIMEOUT; other → E_PROVIDER.
generate(image): `ima2 gen "<prompt>" --size WxH --quality high|medium|low [--bg transparent|chroma-green] [--model lane/model] -o <out>.png --json`
→ parse `images[0].path`; probe with ffprobe; actual size recorded (ima2 may return a smaller size than requested — never assume).
generate(video): `ima2 video "<prompt>" --duration S --resolution 480p|720p|1080p --aspect-ratio 16:9 [--ref <image>] -o <out>.mp4 --json`
(timeout from options, default 600 s) → path/revisedPrompt. continue: `ima2 video continue "<prompt>" --video <generated.mp4> --duration S -o … --json`.
analyze: `ima2 video analyze <file> --json` → `{analysis, method: "first-last-frame"}` (documented as two-frame inference).
All ima2 calls: `run()` with `--json`, parse the single JSON object from stdout, stderr kept for error details; never modify ima2 config.

## Manifest + cache (src/assets/manifest.ts)

Per W6-03: `cacheDir("assets")/manifest.json` maps requestHash → `MaterializedAsset`; files at `cacheDir("assets")/<hash16>.<ext>`. `vid2 assets
resolve <timeline>` fills missing entries (calls providers) and reports reused/generated/failed; compile reads only the manifest (missing →
E_INPUT with fix "run vid2 assets resolve <timeline> or pass --generate").

### Audit wp6 round 1 folds

- Entry paths (blocker 1): `materializeSources(timeline, baseDir, {mode: "generate" | "require" | "status"})` in `src/assets/resolve.ts`:
  `generate` calls providers for misses, `require` throws E_INPUT on a miss without provider calls, `status` never throws or calls providers
  and returns `{sourceId, status: "cached"|"missing", path?}[]` plus the timeline with cached sources replaced (round 2). It is called by
  `planFromTimeline` (compile, render), by `resolve` (manifest-only; each generate source shows `{status: "cached"|"missing", path?}` in
  `data.assets` and resolved paths when cached) and by `validate` (authored validation only; missing assets are reported as warnings, not issues,
  because validation does not need pixels). A saved `.plan.json` whose input file is gone fails with E_NOT_FOUND naming the file and the fix
  "re-run vid2 compile" (render already hashes inputs; the check is explicit before ffmpeg). Tests cover compile, render, render --generate,
  resolve, validate and a saved plan with a deleted asset.
- Kinds and availability (blocker 2): wp6 generates **image and video only**. MODIFY `src/timeline/validate.ts`: every authored `generate`
  source with `kind: "audio"` (referenced or not) is a validation **issue** `E_INPUT` "use timeline.audio (vid2 audio generate)"; because
  validate, resolve and compile all run relational validation first, all three reject it before any `status` lookup (round 3). Missing image/video
  assets stay nonfatal warnings in `validate`. Tests: referenced and unreferenced audio-generate sources fail in validate, resolve and compile. Top-level `available` means the provider CLI/server is reachable; per-kind `KindStatus.available`
  means that kind can generate now. Test: the observed ima2 state (reachable, image ready, video disconnected) through the fake.
- Canonical request (blocker 3): `generate` options are normalized by the adapter before hashing — image `{size (default "1024x1024"),
  quality (default "high"), background ("opaque"|"transparent"|"chroma-green", default "opaque"), model (default "oauth/gpt-image-2" — a vid2 default *sentinel*, a fixed documented id, never "first ready", so the hash is
  computable offline; the adapter maps it to ima2's current default and records the actual model in provenance)}`;
  video `{durationS (default 5), resolution (default "720p"), aspectRatio (default "16:9"), model (default "grok/grok-imagine-video-1.5"),
  seedImage?}` (round 2: defaults are constants; test: offline cache reuse after the fake catalog reorders and changes readiness) where `seedImage` is an
  authored path option resolved against the timeline directory; the hash uses `sha256(seed file bytes)`, never its path. Tests: same bytes at two
  paths reuse; changed bytes regenerate; `{}` and explicit defaults share a hash.
- Typed ima2 failures (blocker 4): on any nonzero exit the adapter first parses a JSON `{ok:false, code, message, status?, requestId?}` from stdout
  (or the last JSON line of stderr) and maps `code`/`status` (AUTH_*/401/403 → E_ACCESS, TIMEOUT/408/504 → E_TIMEOUT, SERVER_UNREACHABLE →
  E_PROVIDER retryable, VALIDATION/4xx → E_INPUT, other → E_PROVIDER), keeping `requestId` in details; only without JSON does it fall back to the
  exit-code table. Tests: exit 1 with an auth payload → E_ACCESS; exit 1 with a timeout payload → E_TIMEOUT.
- Live verifier (blocker 5): `VID2_IMA2_LIVE=1 node --test tests/e2e/assets-ima2.test.ts`.

## File map

NEW src/assets/{provider,registry,file,ima2,manifest,resolve}.ts, src/assets/index.ts, src/cli/commands/assets.ts; tests: ima2 adapter against a
fake ima2 (`tests/fixtures/bin/fake-ima2.mjs` run as `process.execPath fake-ima2.mjs` through the injected runner; exit codes 0/3/4/5/6/8), manifest hashing and
reuse, compile refusing unresolved generate sources; tests/e2e/assets-ima2.test.ts opt-in `VID2_IMA2_LIVE=1` (real server) generating one
512x512 image and, when the Grok lane is ready, one 5 s 480p clip (otherwise it records the lane reason). MODIFY src/cli/commands/{plan-shared,render}.ts ("require"/"generate" mode, `--generate`), src/timeline/validate.ts (audio-generate rejection; src/timeline/validate.test.ts cases "referenced audio generate" and "unreferenced audio
generate"), src/cli/commands/{validate,resolve}.ts
("status" mode → warnings / `data.assets`; tested with an empty manifest), README (Assets + ima2 section),
structure/assets.md NEW.

## Verification (C for wp6)

`npm test` (fake-ima2 contract tests incl. every exit code); live on this Mac with the user's ima2 3333 server: `VID2_IMA2_LIVE=1 node --test
tests/e2e/assets-ima2.test.ts` → image path exists with probed dims, video duration ≈ 5 s; or, if Grok is not signed in, the test records
the capability gap (available:false + reason) and criterion c-7 is met by the honest gap per the goal text.

