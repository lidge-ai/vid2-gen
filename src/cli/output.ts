import { Vid2Error } from "../shared/errors.ts";
import { packageVersion } from "../shared/paths.ts";

export interface CommandResult {
  command: string;
  data: Record<string, unknown>;
  artifacts?: string[];
  warnings?: string[];
  /** Human-readable form for text mode (e.g. a bare path for cd "$(...)"); JSON mode ignores it. */
  text?: string;
}

export function renderSuccess(result: CommandResult, json: boolean): string {
  if (json) return JSON.stringify({
    ok: true,
    command: result.command,
    data: result.data,
    artifacts: result.artifacts ?? [],
    warnings: result.warnings ?? [],
    meta: { vid2: packageVersion() },
  });
  if (result.command === "version") return `vid2 ${String(result.data["version"])}`;
  if (result.command === "help") return typeof result.data["usage"] === "string" ? result.data["usage"] : "";
  if (result.text !== undefined) return result.text;
  return JSON.stringify(result.data, null, 2);
}

export function renderFailure(error: unknown, json: boolean, command = "unknown"): { text: string; exit: number } {
  const e = error instanceof Vid2Error ? error : new Vid2Error("E_INTERNAL", "unexpected internal error", {
    ...(error instanceof Error ? { details: { cause: error.message } } : {}),
  });
  if (!json) return { text: `vid2: ${e.message}${e.fix ? `\nFix: ${e.fix}` : ""}`, exit: e.exit };
  return {
    text: JSON.stringify({
      ok: false,
      command,
      error: { code: e.code, message: e.message, fix: e.fix ?? null, details: e.details ?? {}, retryable: e.retryable },
      meta: { vid2: packageVersion() },
    }),
    exit: e.exit,
  };
}
