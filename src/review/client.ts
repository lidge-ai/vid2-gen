import { readFile } from "node:fs/promises";
import { Vid2Error } from "../shared/errors.ts";
import type { AnalyzeReport } from "../analyze/types.ts";
import type { ReviewImage, ReviewReport } from "./types.ts";
import { parseReview } from "./report.ts";

export function endpoint(base: string, route: "chat/completions" | "responses"): string {
  let url: URL;
  try { url = new URL(base); } catch { throw new Vid2Error("E_INPUT", "review base URL must be an HTTP(S) host"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || !["", "/", "/v1", "/v1/"].includes(url.pathname)) {
    throw new Vid2Error("E_INPUT", "review base URL must be a bare HTTP(S) host, optionally ending in /v1");
  }
  return `${url.origin}/v1/${route}`;
}

function completionText(body: unknown): { text: string; usage: { promptTokens?: number; completionTokens?: number } } | null {
  if (body === null || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const choices = value.choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  if (typeof content !== "string") return null;
  const usage = value.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  return { text: content, usage: { ...(typeof usage?.prompt_tokens === "number" ? { promptTokens: usage.prompt_tokens } : {}),
    ...(typeof usage?.completion_tokens === "number" ? { completionTokens: usage.completion_tokens } : {}) } };
}

async function imageParts(images: ReviewImage[]): Promise<{ parts: { type: "image_url"; image_url: { url: string } }[]; bytes: number }> {
  if (images.length > 24) throw new Vid2Error("E_INPUT", "review image cap is 24");
  const parts: { type: "image_url"; image_url: { url: string } }[] = [];
  let total = 0;
  for (const image of images) {
    const bytes = await readFile(image.path);
    total += bytes.length;
    if (total > 6 * 1024 * 1024) throw new Vid2Error("E_INPUT", "review image bytes exceed 6 MB");
    const mime = image.path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    parts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${bytes.toString("base64")}` } });
  }
  return { parts, bytes: total };
}

export async function reviewWithModel(input: { baseUrl: string; model: string; prompt: string; repairPrompt: string;
  images: ReviewImage[]; analyze: AnalyzeReport; apiKey?: string }): Promise<Pick<ReviewReport, "scores" | "findings" | "limitations" | "usage">> {
  const url = endpoint(input.baseUrl, "chat/completions");
  const images = await imageParts(input.images);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = { model: input.model, messages: [{ role: "user", content: [
        { type: "text", text: attempt === 0 ? input.prompt : input.repairPrompt }, ...images.parts,
      ] }], response_format: { type: "json_object" } };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (input.apiKey) headers.Authorization = `Bearer ${input.apiKey}`;
      const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) throw new Vid2Error(response.status === 401 || response.status === 403 ? "E_ACCESS" : "E_PROVIDER",
        `review provider returned HTTP ${response.status}`);
      let json: unknown;
      try { json = await response.json() as unknown; } catch { json = null; }
      const completion = completionText(json);
      const parsed = completion ? parseReview(completion.text, input.analyze, input.apiKey) : null;
      if (parsed) return { ...parsed, usage: { ...completion?.usage, images: input.images.length,
        imageBytes: images.bytes } };
    }
    throw new Vid2Error("E_PROVIDER", "review provider returned invalid review JSON after repair retry");
  } catch (error) {
    if (error instanceof Vid2Error) throw error;
    if (controller.signal.aborted) throw new Vid2Error("E_TIMEOUT", "review provider timed out");
    throw new Vid2Error("E_PROVIDER", "review provider request failed");
  } finally { clearTimeout(timer); }
}
