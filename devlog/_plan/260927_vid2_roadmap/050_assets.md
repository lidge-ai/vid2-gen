# 050 — wp6 Assets (provider port, files, ima2-gen adapter, manifest/cache)

Consumes 010/020 (Source kind "generate", resolver), 040 (AudioProvider shares the provenance/cache shape). Research: 002 (ima2 contract). ARCH-08.

## Scope

IN: asset provider port; file provider (default); ima2-gen adapter (image generation incl. transparent/chroma backgrounds, Grok video
text/image-to-video, continuation, first/last-frame analysis) through ima2's JSON CLI; asset manifest + cache (`<project>/.vid2/assets.json`);
`vid2 assets resolve <timeline>`, `vid2 assets gen <provider> <kind> "<prompt>" [...]`, `vid2 assets providers --json`; compile-time
materialization of `generate` sources (`vid2 render` refuses to call providers unless `--generate` or the asset is cached, so renders stay deterministic).
`--generate` (audit blocker 4): MODIFY src/cli/commands/render.ts adds boolean option `generate`; when set, render calls
`resolveAssets(timeline, {baseDir, allowGenerate: true})` (src/assets/resolve.ts) before compile; without it compile reads the manifest only and a
missing generated asset raises E_NOT_FOUND with fix "run vid2 assets resolve <timeline> or pass --generate". Tests with the fake ima2 binary:
render without the flag and an empty manifest → exit 2; with the flag → provider invoked once and manifest written; a second render without the
flag uses the cache and does not invoke the provider (the fake counts invocations in a temp file).
OUT: `ima2 video extend` (CLI/route contract mismatch documented in 002 — excluded until ima2 fixes it); other generators (Runway, Veo,
Higgsfield) beyond the generic port; image editing.

## Port (src/assets/provider.ts)

```ts
export type AssetKind = "image" | "video" | "audio";
export interface ProviderCapabilities { provider: string; available: boolean; reason?: string;
  kinds: { image?: { sizes?: string[]; backgrounds?: ("opaque"|"transparent"|"chroma-green")[] }; video?: { maxSeconds: number; resolutions: ("480p"|"720p"|"1080p")[]; fromImage: boolean; continue: boolean }; analyze?: boolean } }
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
disconnected/key-missing/locked → available:false with ima2's reason. Exit-code mapping from ima2 (002 §b): 3 → E_PROVIDER "server not
running (ima2 serve)" retryable; 4 → E_ACCESS "sign in via ima2"; 5 → E_INPUT; 6 → E_PROVIDER retryable; 8 → E_TIMEOUT; other → E_PROVIDER.
generate(image): `ima2 gen "<prompt>" --size WxH --quality high|medium|low [--bg transparent|chroma-green] [--model lane/model] -o <out>.png --json`
→ parse `images[0].path`; probe with ffprobe; actual size recorded (ima2 may return a smaller size than requested — never assume).
generate(video): `ima2 video "<prompt>" --duration S --resolution 480p|720p|1080p --aspect-ratio 16:9 [--ref <image>] -o <out>.mp4 --json`
(timeout from options, default 600 s) → path/revisedPrompt. continue: `ima2 video continue "<prompt>" --video <generated.mp4> --duration S -o … --json`.
analyze: `ima2 video analyze <file> --json` → `{analysis, method: "first-last-frame"}` (documented as two-frame inference).
All ima2 calls: `run()` with `--json`, parse the single JSON object from stdout, stderr kept for error details; never modify ima2 config.

## Manifest + cache (src/assets/manifest.ts)

`assets.json`: `{version:1, entries: {<sourceId>: {requestHash, asset: MaterializedAsset}}}` next to the timeline in `.vid2/`; requestHash =
hashJson({provider, kind, prompt, options, seedImageSha}). Files stored in `.vid2/assets/<sourceId>-<hash8>.<ext>`. `vid2 assets resolve` fills
missing entries (calls providers) and reports reused/generated/failed; compile reads only the manifest (missing → E_INPUT with fix
"run vid2 assets resolve <timeline>").

## File map

NEW src/assets/{provider,registry,file,ima2,manifest,resolve}.ts, src/assets/index.ts, src/cli/commands/assets.ts; tests: ima2 adapter against a
fake `ima2` executable (tests/fixtures/bin/ima2 — a node script emitting recorded JSON shapes and exit codes 0/3/4/8), manifest hashing and
reuse, compile refusing unresolved generate sources; tests/e2e/assets-ima2.test.ts opt-in `VID2_IMA2_LIVE=1` (real server) generating one
512x512 image and one 5 s 480p Grok clip. MODIFY src/compile/plan.ts (generate sources via manifest), README (Assets + ima2 section),
structure/assets.md NEW.

## Verification (C for wp6)

`npm test` (fake-ima2 contract tests incl. every exit code); live on this Mac with the user's ima2 3333 server: `VID2_IMA2_LIVE=1 npm test --
tests/e2e/assets-ima2.test.ts` → image path exists with probed dims, video duration ≈ 5 s; or, if Grok is not signed in, the test records
the capability gap (available:false + reason) and criterion c-7 is met by the honest gap per the goal text.

