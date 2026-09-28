/** Optional ima2 JSON-CLI adapter. No config mutation and no implicit installation. */
import { existsSync } from "node:fs";
import { hashFile, run, Vid2Error } from "../shared/index.ts";
import type { Runner, RunResult } from "../shared/index.ts";
import { findExecutable, probeMedia } from "../probe/index.ts";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "./provider.ts";
import type { AssetProvider, GenerateRequest, ImageOptions, KindStatus, MaterializedAsset, ProviderCapabilities, VideoOptions } from "./provider.ts";
import { checkIma2VideoOptions } from "./video-options.ts";

export interface Ima2Context { runner?: Runner; env?: NodeJS.ProcessEnv; bin?: string[] }
interface Ima2Json { ok?: boolean; code?: string; message?: string; error?: string; status?: number; requestId?: string;
  base?: string; version?: string; source?: string; lanes?: Record<string, { status?: string; reason?: string }>;
  defaults?: { oauth?: { model?: string } }; valid?: { videoModels?: { resolutions?: string[]; durationRange?: number[] } };
  kinds?: { image?: ModelRow[]; video?: ModelRow[] }; images?: { path?: string; actualSize?: string }[];
  path?: string; video?: { path?: string; model?: string; revisedPrompt?: string } | string;
  model?: string; revisedPrompt?: string; analysis?: string; method?: string }
interface ModelRow { lane?: string; id?: string; status?: string; executable?: boolean; lockReason?: string }
type TimedVideoOptions = VideoOptions & { timeoutS?: number };

function objectFrom(text: string): Ima2Json | undefined {
  const lines = [text.trim(), ...text.split(/\r?\n/).reverse()];
  for (const line of lines) {
    try {
      const value = JSON.parse(line) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch { /* probe the next JSON line */ }
  }
  return undefined;
}

function typedFailure(payload: Ima2Json | undefined, result: RunResult): Vid2Error {
  const code = payload?.code?.toUpperCase() ?? "";
  const status = payload?.status;
  const details = { ...(payload?.requestId ? { requestId: payload.requestId } : {}),
    ...(code ? { providerCode: code } : {}), ...(status === undefined ? {} : { status }),
    exitCode: result.code, stderrTail: result.stderr.slice(-500) };
  const message = payload?.message ?? payload?.error ?? "ima2 CLI failed";
  if (code.startsWith("AUTH_") || status === 401 || status === 403) return new Vid2Error("E_ACCESS", message, { details });
  if (code.includes("TIMEOUT") || status === 408 || status === 504) return new Vid2Error("E_TIMEOUT", message, { details, retryable: true });
  if (code === "SERVER_UNREACHABLE") return new Vid2Error("E_PROVIDER", message, { details, retryable: true,
    fix: "Start ima2 with: ima2 serve" });
  if (code.includes("VALIDATION") || status !== undefined && status >= 400 && status < 500) {
    return new Vid2Error("E_INPUT", message, { details });
  }
  if (payload) return new Vid2Error("E_PROVIDER", message, { details, retryable: status !== undefined && status >= 500 });
  if (result.code === 3) return new Vid2Error("E_PROVIDER", "ima2 server not running", { details, retryable: true,
    fix: "Start ima2 with: ima2 serve" });
  if (result.code === 4) return new Vid2Error("E_ACCESS", "ima2 sign-in required", { details, fix: "Sign in via ima2." });
  if (result.code === 5) return new Vid2Error("E_INPUT", "ima2 rejected the request", { details });
  if (result.code === 6) return new Vid2Error("E_PROVIDER", "ima2 network failure", { details, retryable: true });
  if (result.code === 8 || result.signal === "SIGKILL") return new Vid2Error("E_TIMEOUT", "ima2 request timed out", { details, retryable: true });
  return new Vid2Error("E_PROVIDER", "ima2 CLI failed", { details });
}

function imageOptions(raw: Record<string, unknown>): ImageOptions {
  const value = { size: raw["size"] ?? "1024x1024", quality: raw["quality"] ?? "high",
    background: raw["background"] ?? "opaque", model: raw["model"] ?? DEFAULT_IMAGE_MODEL };
  if (typeof value.size !== "string" || !/^\d+x\d+$/.test(value.size) || typeof value.model !== "string" ||
    typeof value.quality !== "string" || !["high", "medium", "low"].includes(value.quality) ||
    typeof value.background !== "string" || !["opaque", "transparent", "chroma-green"].includes(value.background)) {
    throw new Vid2Error("E_INPUT", "invalid ima2 image options");
  }
  return value as ImageOptions;
}

function kindStatus(models: ModelRow[], lanes: Ima2Json["lanes"], selectedLane: string, model: string): KindStatus {
  const matches = models.filter(row => row.lane === selectedLane);
  const lane = lanes?.[selectedLane];
  const ready = lane?.status === "ready" && matches.some(row => row.status === "ready" && row.executable !== false);
  return { available: ready, status: lane?.status ?? "unknown", lane: selectedLane, model,
    ...(ready ? {} : { reason: lane?.reason ?? matches.find(row => row.lockReason)?.lockReason ??
      (matches.length ? "Selected ima2 model lane is not ready" : "Selected ima2 model lane has no models") }) };
}

/** `ima2 video --help` is plain text on stdout (exit 0), so it bypasses call(), which adds --json and needs JSON (041 V-7, V-12). */
async function probeAsReference(runner: Runner, executable: string | null, prefix: string[], env: NodeJS.ProcessEnv): Promise<boolean> {
  if (!executable) throw new Vid2Error("E_CAPABILITY", "ima2 CLI not found", { fix: "npm i -g ima2-gen" });
  let result: RunResult;
  try { result = await runner(executable, [...prefix.slice(1), "video", "--help"], { env, timeoutMs: 30_000 }); }
  catch (cause) { throw new Vid2Error("E_PROVIDER", "cannot start ima2 CLI", { cause, retryable: true }); }
  return result.code === 0 && /--as-reference\b/.test(result.stdout.toString("utf8"));
}

export function createIma2Provider(ctx: Ima2Context = {}): AssetProvider {
  const env = ctx.env ?? process.env;
  const configured = env["IMA2_BIN"];
  // A .mjs/.js IMA2_BIN runs through this Node (cross-platform, used by tests and source checkouts).
  const prefix = ctx.bin ?? (configured && /\.(mjs|js)$/.test(configured) ? [process.execPath, configured] : [configured ?? "ima2"]);
  const runner = ctx.runner ?? run;
  const executable = prefix[0] ? findExecutable(prefix[0], env["PATH"] ?? process.env["PATH"] ?? "") : null;
  const server = env["IMA2_SERVER"];
  let latestDefaultModel: string | undefined;
  let referenceSupport: Promise<boolean> | undefined;
  function supportsReferences(): Promise<boolean> {
    referenceSupport ??= probeAsReference(runner, executable, prefix, env)
      .catch((cause: unknown) => { referenceSupport = undefined; throw cause; });
    return referenceSupport;
  }
  async function call(args: string[], timeoutMs = 30_000, signal?: AbortSignal, allowMissingOk = false): Promise<Ima2Json> {
    if (signal?.aborted) throw new Vid2Error("E_INTERRUPTED", "ima2 request was cancelled");
    if (!executable || !prefix[0]) throw new Vid2Error("E_CAPABILITY", "ima2 CLI not found", { fix: "npm i -g ima2-gen" });
    const argv = [...prefix.slice(1), ...args, ...(server ? ["--server", server] : []), "--json"];
    let result: RunResult;
    try { result = await runner(executable, argv, { env, timeoutMs }); }
    catch (cause) { throw new Vid2Error("E_PROVIDER", "cannot start ima2 CLI", { cause, retryable: true }); }
    if (signal?.aborted) throw new Vid2Error("E_INTERRUPTED", "ima2 request was cancelled");
    const payload = objectFrom(result.stdout.toString("utf8"));
    if (result.code !== 0 || payload?.ok === false) throw typedFailure(payload?.ok === false ? payload :
      objectFrom(result.stderr) ?? payload, result);
    if (!payload || !allowMissingOk && payload.ok !== true) throw new Vid2Error("E_PROVIDER", "ima2 returned malformed JSON");
    return payload;
  }
  return { id: "ima2",
    normalize(kind, options) { return kind === "image" ? imageOptions(options) : checkIma2VideoOptions(options, "--flag"); },
    async capabilities(): Promise<ProviderCapabilities> {
      const missing: ProviderCapabilities = { provider: "ima2", available: false,
        reason: "ima2 CLI not found (npm i -g ima2-gen)", kinds: {} };
      if (!executable) return missing;
      let ping: Ima2Json, caps: Ima2Json, images: Ima2Json, videos: Ima2Json;
      try {
        ping = await call(["ping"]);
        caps = await call(["capabilities", "--require-server"]);
        images = await call(["models", "--kind", "image"]);
        videos = await call(["models", "--kind", "video"]);
      } catch (error) {
        return { provider: "ima2", available: false, reason: error instanceof Error ? error.message : "ima2 unavailable", kinds: {} };
      }
      if (caps.source !== "server") return { provider: "ima2", available: false,
        reason: "ima2 capabilities were not sourced from the server", kinds: {} };
      latestDefaultModel = caps.defaults?.oauth?.model;
      const image = kindStatus(images.kinds?.image ?? [], caps.lanes, "oauth", latestDefaultModel ?? DEFAULT_IMAGE_MODEL);
      const video = kindStatus(videos.kinds?.video ?? [], caps.lanes, "grok", DEFAULT_VIDEO_MODEL);
      const resolutions = (caps.valid?.videoModels?.resolutions ?? ["480p", "720p", "1080p"])
        .filter((value): value is "480p" | "720p" | "1080p" => ["480p", "720p", "1080p"].includes(value));
      return { provider: "ima2", available: true, ...(ping.version ? { version: ping.version } : {}),
        kinds: { image: { ...image, sizes: ["1024x1024", "1536x1024", "1024x1536"],
          backgrounds: ["opaque", "transparent", "chroma-green"] },
        video: { ...video, maxSeconds: caps.valid?.videoModels?.durationRange?.[1] ?? 15, resolutions,
          fromImage: true, continue: true }, analyze: true } };
    },
    async generate(req: GenerateRequest, outPath: string, signal?: AbortSignal): Promise<MaterializedAsset> {
      const options = req.kind === "image" ? imageOptions(req.options as unknown as Record<string, unknown>)
        : checkIma2VideoOptions(req.options as unknown as Record<string, unknown>, "--flag");
      if (req.kind === "video" && (options as VideoOptions).referenceImages && !await supportsReferences())
        throw new Vid2Error("E_CAPABILITY", "installed ima2 CLI does not support video reference images (--as-reference)", {
          details: { provider: "ima2", kind: "video" }, fix: "Update ima2-gen: npm i -g ima2-gen@latest" });
      const args = req.kind === "image" ? ["gen", req.prompt, "--size", (options as ImageOptions).size,
        "--quality", (options as ImageOptions).quality,
        ...((options as ImageOptions).background === "opaque" ? [] : ["--bg", (options as ImageOptions).background]),
        ...((options as ImageOptions).model === DEFAULT_IMAGE_MODEL ? [] : ["--model", (options as ImageOptions).model])]
        : ["video", req.prompt, "--duration", String((options as VideoOptions).durationS), "--resolution", (options as VideoOptions).resolution,
          "--aspect-ratio", (options as VideoOptions).aspectRatio, "--model", (options as VideoOptions).model,
          ...((options as VideoOptions).seedImage ? ["--ref", (options as VideoOptions).seedImage!] : []),
          ...((options as VideoOptions).referenceImages ?? []).flatMap(path => ["--ref", path]),
          ...((options as VideoOptions).referenceImages?.length === 1 ? ["--as-reference"] : [])];
      const timeout = (req.kind === "video" ? (options as TimedVideoOptions).timeoutS ?? 600 : 180) * 1000;
      const payload = await call([...args, "-o", outPath], timeout, signal);
      const reported = req.kind === "image" ? payload.images?.[0]?.path : payload.path ??
        (typeof payload.video === "string" ? payload.video : payload.video?.path);
      if (!reported || !existsSync(reported)) throw new Vid2Error("E_PROVIDER", "ima2 did not write its reported asset", {
        details: { requestId: payload.requestId, path: reported } });
      const media = await probeMedia(reported);
      if (media.kind !== req.kind || !media.width || !media.height) throw new Vid2Error("E_PROVIDER", "ima2 asset has wrong media kind or geometry", {
        details: { requestId: payload.requestId, path: reported, kind: media.kind } });
      const revised = payload.revisedPrompt ?? (typeof payload.video === "object" ? payload.video.revisedPrompt : undefined);
      if (req.kind === "image" && options.model === DEFAULT_IMAGE_MODEL && !payload.model && !latestDefaultModel) {
        try { latestDefaultModel = (await call(["capabilities", "--require-server"])).defaults?.oauth?.model; }
        catch { /* preserve the generated result even when model metadata is unavailable */ }
      }
      const model = payload.model ?? (typeof payload.video === "object" ? payload.video.model : undefined) ??
        (req.kind === "image" && options.model === DEFAULT_IMAGE_MODEL ? latestDefaultModel : options.model);
      return { path: reported, kind: req.kind, width: media.width, height: media.height,
        ...(media.duration === undefined ? {} : { durationS: media.duration }), sha256: await hashFile(reported),
        provenance: { provider: "ima2", params: { prompt: req.prompt, options,
          ...(req.seedImageSha ? { seedImageSha: req.seedImageSha } : {}),
          ...(req.referenceImagesSha ? { referenceImagesSha: req.referenceImagesSha } : {}) }, createdAt: new Date().toISOString(),
          ...(payload.requestId ? { requestId: payload.requestId } : {}), ...(model ? { model } : {}),
          ...(revised ? { revisedPrompt: revised } : {}) } };
    },
    async analyze(videoPath: string) {
      const payload = await call(["video", "analyze", videoPath], 180_000, undefined, true);
      if (typeof payload.analysis !== "string") throw new Vid2Error("E_PROVIDER", "ima2 analyze response has no analysis");
      return { text: payload.analysis, method: payload.method ?? "first-last-frame" };
    } };
}
