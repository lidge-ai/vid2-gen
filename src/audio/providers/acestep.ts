/** ACE-Step 1.5 local REST music adapter. */
import { Vid2Error } from "../../shared/index.ts";
import { normalizeAudioBytes } from "./file.ts";
import type { AudioAsset, AudioProvider, Fetch, MusicRequest } from "./port.ts";

export interface AceStepOptions { baseUrl?: string; fetch?: Fetch; pollMs?: number; timeoutMs?: number }
type ResponseLike = Awaited<ReturnType<Fetch>>;

function networkError(error: unknown): Vid2Error {
  if (error instanceof Vid2Error) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError") return new Vid2Error("E_TIMEOUT", "ACE-Step request timed out", { retryable: true, cause: error });
  return new Vid2Error("E_PROVIDER", "could not connect to ACE-Step", { retryable: true, cause: error });
}

async function checked(response: ResponseLike): Promise<ResponseLike> {
  if (response.ok) return response;
  if (response.status === 401 || response.status === 403) throw new Vid2Error("E_ACCESS", `ACE-Step access denied (${response.status})`);
  throw new Vid2Error("E_PROVIDER", `ACE-Step request failed (${response.status})`, { retryable: response.status >= 500 });
}

async function json(response: ResponseLike): Promise<unknown> {
  try { return JSON.parse(await response.text()) as unknown; }
  catch (cause) { throw new Vid2Error("E_PROVIDER", "ACE-Step returned malformed JSON", { cause }); }
}

function taskId(value: unknown): string {
  const body = value as { task_id?: unknown; data?: { task_id?: unknown } };
  const id = body?.task_id ?? body?.data?.task_id;
  if (typeof id !== "string" || !id) throw new Vid2Error("E_PROVIDER", "ACE-Step release_task returned no task id");
  return id;
}

function taskResult(value: unknown): { status: number; result?: unknown } {
  const root = value as { data?: unknown; status?: unknown; result?: unknown };
  const candidate: unknown = Array.isArray(root?.data) ? (root.data as unknown[])[0] : root?.data ?? root;
  const task = candidate as { status?: unknown; result?: unknown };
  if (!task || typeof task.status !== "number") throw new Vid2Error("E_PROVIDER", "ACE-Step query_result is malformed");
  return { status: task.status, ...(task.result === undefined ? {} : { result: task.result }) };
}

function audioPath(raw: unknown): string {
  let result = raw;
  if (typeof result === "string") {
    try { result = JSON.parse(result) as unknown; }
    catch { return raw as string; }
  }
  const first: unknown = Array.isArray(result) ? (result as unknown[])[0] : result;
  const value = first as { path?: unknown; file?: unknown; audio_path?: unknown };
  const path = value?.path ?? value?.file ?? value?.audio_path;
  if (typeof path !== "string" || !path) throw new Vid2Error("E_PROVIDER", "ACE-Step task result has no audio path");
  return path;
}

function downloadPath(path: string, base: string): string {
  if (path.startsWith("/v1/audio?")) return path;
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    if (url.origin !== new URL(base).origin || url.pathname !== "/v1/audio") {
      throw new Vid2Error("E_PROVIDER", "ACE-Step returned an unexpected audio URL");
    }
    return `${url.pathname}${url.search}`;
  }
  return `/v1/audio?path=${encodeURIComponent(path)}`;
}

export function createAceStep(opts: AceStepOptions = {}): AudioProvider {
  const base = (opts.baseUrl ?? process.env["ACESTEP_URL"] ?? "http://127.0.0.1:8001").replace(/\/+$/, "");
  const fetcher: Fetch = opts.fetch ?? globalThis.fetch;
  const pollMs = Math.max(0, opts.pollMs ?? 500);
  const timeoutMs = Math.max(1, opts.timeoutMs ?? 120_000);
  async function request(path: string, init: Parameters<Fetch>[1] = {}, remaining = timeoutMs): Promise<ResponseLike> {
    if (!base) throw new Vid2Error("E_CAPABILITY", "ACE-Step URL is not configured", { fix: "Set ACESTEP_URL." });
    try { return await checked(await fetcher(`${base}${path}`, { ...init, signal: AbortSignal.timeout(Math.max(1, remaining)) })); }
    catch (error) { throw networkError(error); }
  }
  async function post(path: string, body: Record<string, unknown>, remaining?: number): Promise<unknown> {
    const response = await request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, remaining);
    return json(response);
  }
  async function waitForTask(id: string, deadline: number): Promise<string> {
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Vid2Error("E_TIMEOUT", "ACE-Step task timed out", { retryable: true });
      const state = taskResult(await post("/query_result", { task_id_list: [id] }, remaining));
      if (state.status === 1) return audioPath(state.result);
      if (state.status === 2) throw new Vid2Error("E_PROVIDER", "ACE-Step task failed");
      if (pollMs) await new Promise<void>(resolve => setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
    }
  }
  return { id: "acestep",
    async capabilities() {
      if (!base) return { music: false, reason: "Set ACESTEP_URL to the local ACE-Step server." };
      try { await request("/health", {}, Math.min(timeoutMs, 3000)); return { music: true }; }
      catch { return { music: false, reason: "ACE-Step is not responding at its configured URL." }; }
    },
    async music(req: MusicRequest): Promise<AudioAsset> {
      const plan = req.plan && typeof req.plan === "object" ? req.plan as { key?: string } : undefined;
      const body = { prompt: req.prompt ?? "", lyrics: "[instrumental]", bpm: req.bpm ?? 120, key_scale: plan?.key ?? "C",
        time_signature: "4", audio_duration: req.durationMs / 1000, inference_steps: 8, batch_size: 1,
        audio_format: "wav", seed: req.seed ?? -1 };
      const deadline = Date.now() + timeoutMs;
      const id = taskId(await post("/release_task", body, timeoutMs));
      const path = await waitForTask(id, deadline);
      const response = await request(downloadPath(path, base), {}, deadline - Date.now());
      const normalized = await normalizeAudioBytes(Buffer.from(await response.arrayBuffer()), ".wav");
      return { ...normalized, provenance: { provider: "acestep", requestId: id, model: "acestep-1.5",
        params: { prompt: req.prompt ?? "", durationS: req.durationMs / 1000, bpm: req.bpm ?? 120, seed: req.seed ?? -1 },
        createdAt: new Date().toISOString() } };
    } };
}
