/** Shared test helpers: tool requirements honour VID2_REQUIRE_* (skip when unset, fail when set). */
import type { TestContext } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function onPath(bin: string): boolean {
  const exts = process.platform === "win32" ? [".exe", ".cmd", ""] : [""];
  for (const dir of (process.env["PATH"] ?? "").split(delimiter)) {
    for (const ext of exts) if (dir && existsSync(join(dir, bin + ext))) return true;
  }
  return false;
}

function requireTool(t: TestContext, present: boolean, name: string, envVar: string): boolean {
  if (present) return true;
  if (process.env[envVar] === "1") throw new Error(`${name} is required (${envVar}=1) but was not found`);
  t.skip(`${name} not available (set ${envVar}=1 to make this a failure)`);
  return false;
}

export function requireFfmpeg(t: TestContext): boolean {
  const ok = Boolean(process.env["VID2_FFMPEG"]) || (onPath("ffmpeg") && onPath("ffprobe"));
  return requireTool(t, ok, "ffmpeg", "VID2_REQUIRE_FFMPEG");
}

/** libass-backed ffmpeg (ass filter). Homebrew ffmpeg 9 ships without it; vid2 then uses raster text. */
export function requireLibass(t: TestContext): boolean {
  if (!requireFfmpeg(t)) return false;
  const bin = process.env["VID2_FFMPEG"] ?? "ffmpeg";
  const out = spawnSync(bin, ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout ?? "";
  const ok = /^\s*[T.][S.][C.]?\s+ass\s/m.test(out);
  return requireTool(t, ok, "ffmpeg with libass", "VID2_REQUIRE_LIBASS");
}

export async function requirePlaywright(t: TestContext): Promise<boolean> {
  let ok = false;
  try {
    const pw = (await import("playwright-core")) as { chromium: { executablePath(): string } };
    ok = existsSync(pw.chromium.executablePath());
  } catch {
    ok = false;
  }
  return requireTool(t, ok, "playwright chromium", "VID2_REQUIRE_PLAYWRIGHT");
}

export function tempDir(prefix = "vid2-t-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

