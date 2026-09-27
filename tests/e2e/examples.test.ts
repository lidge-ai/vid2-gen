import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { run } from "../../src/shared/exec.ts";
import { requireFfmpeg, requirePlaywright, tempDir } from "../helpers.ts";

const root = resolve(import.meta.dirname, "../..");
const example = join(root, "examples/vid2-launch");
const cli = join(root, "src/cli/index.ts");

async function vid2(cwd: string, args: string[]) {
  const r = await run(process.execPath, [cli, ...args, "--json"], { cwd });
  return JSON.parse(r.stdout.toString("utf8")) as { ok: boolean; data: Record<string, unknown>; warnings?: string[] };
}

/** Animated WebP: count ANMF chunks and sum their 24-bit frame durations (ffprobe cannot decode animation). */
export function webpAnimation(buf: Buffer): { frames: number; durationMs: number; width: number; height: number } {
  assert.equal(buf.toString("ascii", 0, 4), "RIFF");
  let offset = 12, frames = 0, durationMs = 0, width = 0, height = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "VP8X") { width = buf.readUIntLE(body + 4, 3) + 1; height = buf.readUIntLE(body + 7, 3) + 1; }
    if (id === "ANMF") { frames++; durationMs += buf.readUIntLE(body + 12, 3); }
    offset = body + size + (size % 2);
  }
  return { frames, durationMs, width, height };
}

void test("vid2-launch example validates and its README assets meet the budget", async (t) => {
  if (!requireFfmpeg(t)) return;
  const v = await vid2(example, ["validate", "timeline.stills.json"]);
  assert.equal(v.ok, true);
  assert.equal((v.data["summary"] as { totalFrames: number }).totalFrames, 900);
  const poster = await run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(root, "assets/readme/poster.png")]);
  assert.equal(poster.stdout.toString("utf8").trim(), "1280,720");
  const webp = join(root, "assets/readme/preview.webp");
  assert.ok(statSync(webp).size < 5 * 1024 * 1024);
  const anim = webpAnimation(readFileSync(webp));
  assert.deepEqual([anim.width, anim.height], [1280, 720]);
  assert.ok(anim.frames > 30, `frames ${anim.frames}`);
  assert.ok(Math.abs(anim.durationMs - 10000) <= 500, `duration ${anim.durationMs}`);
});

void test("the app capture reproduces a labelled Publish click with a visible change", async (t) => {
  if (!requireFfmpeg(t) || !(await requirePlaywright(t))) return;
  const dir = tempDir("vid2-example-app-");
  const cap = await vid2(dir, ["capture", "web", "--serve", join(root, "templates/feature-demo/site"), "--steps", join(example, "app.steps.json"),
    "--size", "640x360", "--scale", "1", "--fps", "30", "--out", "app"]);
  assert.equal(cap.ok, true, JSON.stringify(cap));
  const click = (cap.data["actions"] as { label?: string; frame: number }[]).find((a) => a.label === "publish");
  assert.ok(click, "publish click recorded");
  const frame = async (n: number) => (await run("ffmpeg", ["-v", "error", "-i", join(dir, "app.vid2cap/footage.mp4"), "-vf", `select=eq(n\\,${n})`,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"])).stdout;
  const before = await frame(Math.max(0, click.frame - 1));
  const after = await frame(click.frame + 6);
  let diff = 0;
  for (let i = 0; i < before.length; i++) diff += Math.abs(before[i]! - (after[i] ?? 0));
  assert.ok(diff / before.length > 0.2, `visible change after the click (${(diff / before.length).toFixed(3)})`);
});

void test("two-pass handoff: pass-1 QA stills replace the placeholders and pass 2 needs none", { timeout: 600_000 }, async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = join(tempDir("vid2-example-2pass-"), "vid2-launch");
  cpSync(example, dir, { recursive: true, filter: (src) => !src.includes(".work") && !/[\\/](raw|seq)([\\/]|$)/.test(src) });
  for (const f of ["qa-contact.png", "qa-seam-a.png", "qa-seam-b.png"]) rmSync(join(dir, "media", f));
  const pass1 = await vid2(dir, ["render", "timeline.stills.json", "--profile", "proxy", "--placeholders", "-o", "pass1.mp4"]);
  assert.equal(pass1.ok, true, JSON.stringify(pass1));
  assert.equal((pass1.warnings ?? []).filter((w) => w.startsWith("W_PLACEHOLDER")).length, 3);
  const qa = await vid2(dir, ["qa", "pass1.mp4", "--timeline", "timeline.stills.json", "--out", "pass1.qa"]);
  assert.equal(qa.ok, true, JSON.stringify(qa).slice(0, 400));
  cpSync(join(dir, "pass1.qa/contact.png"), join(dir, "media/qa-contact.png"));
  cpSync(join(dir, "pass1.qa/keyframes/compile-seam-before.png"), join(dir, "media/qa-seam-a.png"));
  cpSync(join(dir, "pass1.qa/keyframes/compile-seam-after.png"), join(dir, "media/qa-seam-b.png"));
  const pass2 = await vid2(dir, ["render", "timeline.stills.json", "--profile", "proxy", "-o", "pass2.mp4"]);
  assert.equal(pass2.ok, true, JSON.stringify(pass2));
  assert.equal((pass2.warnings ?? []).some((w) => w.startsWith("W_PLACEHOLDER")), false);
  assert.equal(pass2.data["frames"], 900);
});
