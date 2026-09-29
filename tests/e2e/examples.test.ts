import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { run } from "../../src/shared/exec.ts";
import { requireFfmpeg, requirePlaywright, tempDir } from "../helpers.ts";

const root = resolve(import.meta.dirname, "../..");
const example = join(root, "examples/vid2-launch");
const cli = join(root, "src/cli/index.ts");
/** The developer's example workspaces (examples/README.md); the test runner's isolated VID2_HOME does not contain them. */
const workspaces = process.env["VID2_EXAMPLE_WORKSPACES"] ?? join(homedir(), ".vid2", "examples");

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

void test("README assets meet the budget", async (t) => {
  if (!requireFfmpeg(t)) return;
  const poster = await run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(root, "assets/readme/poster.png")]);
  assert.equal(poster.stdout.toString("utf8").trim(), "1280,720");
  const webp = join(root, "assets/readme/preview.webp");
  assert.ok(statSync(webp).size < 5 * 1024 * 1024);
  const anim = webpAnimation(readFileSync(webp));
  assert.deepEqual([anim.width, anim.height], [1280, 720]);
  assert.ok(anim.frames > 30, `frames ${anim.frames}`);
  assert.ok(Math.abs(anim.durationMs - 10000) <= 500, `duration ${anim.durationMs}`);
});

void test("committed example timelines match the schema", async () => {
  const { TimelineSchema } = await import("../../src/timeline/schema.ts");
  const parse = (path: string) => TimelineSchema.parse(JSON.parse(readFileSync(join(root, "examples", path), "utf8")));
  assert.equal(parse("ima2-launch/timeline.json").scenes.length, 14);
  for (const path of ["vid2-launch/timeline.stills.json", "generated-video/timeline.json", "generated-video/timeline.offline.json", "hello.json"]) {
    assert.ok(parse(path).scenes.length > 0, path);
  }
});

void test("examples keep media, captures and renders out of git", async () => {
  const listed = await run("git", ["ls-files", "examples"], { cwd: root });
  if (listed.code !== 0) return; // a source tarball without git history has nothing to check
  const media = /\.(mp4|mov|mkv|webm|png|jpe?g|webp|gif|wav|mp3|m4a|aac|flac|ttf|otf)$|(^|\/)(media|out|\.work)\/|\.vid2cap\//;
  const offenders = listed.stdout.toString("utf8").split("\n").filter((path) => media.test(path));
  assert.deepEqual(offenders, []);
  const ignore = readFileSync(join(root, ".gitignore"), "utf8");
  for (const line of ["examples/*/media/", "examples/*/out/", "examples/*/.work/", "examples/*/*.vid2cap/"]) assert.ok(ignore.includes(line), line);
});

void test("workspace.mjs copies sources, keeps workspace media and rejects unknown names", async () => {
  const home = tempDir("vid2-example-ws-");
  const env = { ...process.env, VID2_HOME: home };
  const media = join(home, "examples/vid2-launch/media/hero.jpg");
  mkdirSync(join(home, "examples/vid2-launch/media"), { recursive: true });
  writeFileSync(media, "kept");
  writeFileSync(join(home, "examples/vid2-launch/README.md"), "stale");
  const synced = await run(process.execPath, [join(root, "examples/workspace.mjs"), "vid2-launch"], { env });
  assert.equal(synced.code, 0, synced.stderr);
  assert.equal(synced.stdout.toString("utf8").trim(), join(home, "examples/vid2-launch"));
  assert.equal(readFileSync(media, "utf8"), "kept");
  assert.equal(readFileSync(join(home, "examples/vid2-launch/README.md"), "utf8"), readFileSync(join(example, "README.md"), "utf8"));
  assert.ok(existsSync(join(home, "examples/vid2-launch/timeline.stills.json")));
  const unknown = await run(process.execPath, [join(root, "examples/workspace.mjs"), "no-such-example"], { env });
  assert.notEqual(unknown.code, 0);
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

// Needs the vid2-launch workspace (captures, stills) and two full 30 s proxy renders, so it runs locally and in release receipts (VID2_EXAMPLE_TEST=1).
void test("two-pass handoff: pass-1 QA stills replace the placeholders and pass 2 needs none", { timeout: 900_000 }, async (t) => {
  if (process.env["VID2_EXAMPLE_TEST"] !== "1") { t.skip("set VID2_EXAMPLE_TEST=1 to run the full two-pass example render"); return; }
  if (!requireFfmpeg(t)) return;
  const dir = join(tempDir("vid2-example-2pass-"), "vid2-launch");
  cpSync(join(workspaces, "vid2-launch"), dir, { recursive: true, filter: (src) => !src.includes(".work") && !/[\\/](raw|seq)([\\/]|$)/.test(src) });
  cpSync(example, dir, { recursive: true });
  const validated = await vid2(dir, ["validate", "timeline.stills.json"]);
  assert.equal(validated.ok, true, JSON.stringify(validated));
  assert.equal((validated.data["summary"] as { totalFrames: number }).totalFrames, 900);
  for (const f of ["qa-seams.png", "qa-waveform.png", "qa-spectrogram.png"]) rmSync(join(dir, "media", f));
  const pass1 = await vid2(dir, ["render", "timeline.stills.json", "--profile", "proxy", "--placeholders", "-o", "pass1.mp4"]);
  assert.equal(pass1.ok, true, JSON.stringify(pass1));
  assert.equal((pass1.warnings ?? []).filter((w) => w.startsWith("W_PLACEHOLDER")).length, 3);
  const qa = await vid2(dir, ["qa", "pass1.mp4", "--timeline", "timeline.stills.json", "--out", "pass1.qa"]);
  assert.equal(qa.ok, true, JSON.stringify(qa).slice(0, 400));
  const made = await run(process.execPath, [join(dir, "make-qa-media.mjs"), join(dir, "pass1.qa"), join(dir, "media")]);
  assert.equal(made.code, 0, made.stderr);
  const pass2 = await vid2(dir, ["render", "timeline.stills.json", "--profile", "proxy", "-o", "pass2.mp4"]);
  assert.equal(pass2.ok, true, JSON.stringify(pass2));
  assert.equal((pass2.warnings ?? []).some((w) => w.startsWith("W_PLACEHOLDER")), false);
  assert.equal(pass2.data["frames"], 900);
});

void test("generated-video offline example holds a five-second clip once across a seven-second layer", { timeout: 60_000 }, async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-generated-example-");
  const input = join(dir, "generated-clip.mp4");
  cpSync(join(root, "examples/generated-video/timeline.offline.json"), join(dir, "timeline.offline.json"));
  const clip = await run(process.env["VID2_FFMPEG"] ?? "ffmpeg", ["-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i",
    "testsrc2=size=320x180:rate=15:duration=5", "-frames:v", "75", "-an", "-c:v", "mpeg4", "-q:v", "4", input], { timeoutMs: 10_000 });
  assert.equal(clip.code, 0, clip.stderr);
  const rendered = await run(process.execPath, [cli, "render", "timeline.offline.json", "--generate", "--profile", "proxy",
    "-o", "offline.mp4", "--json"], { cwd: dir, env: { ...process.env, VID2_HOME: join(dir, "home") }, timeoutMs: 50_000 });
  assert.equal(rendered.code, 0, rendered.stderr || rendered.stdout.toString("utf8"));
  const body = JSON.parse(rendered.stdout.toString("utf8")) as { ok: boolean; warnings?: string[] };
  assert.equal(body.ok, true);
  const holds = (body.warnings ?? []).filter((w) => w.startsWith("W_GENERATED_CLIP_HOLD"));
  assert.equal(holds.length, 1, JSON.stringify(body.warnings));
  assert.match(holds[0]!, /^W_GENERATED_CLIP_HOLD grok_clip boat_hold held 2\.00s \(30 frames\): clip 5\.00s, read 7\.00s from 0\.00s$/);
  const manifest = JSON.parse(readFileSync(join(dir, "offline.mp4.render.json"), "utf8")) as { warnings: string[] };
  assert.deepEqual(manifest.warnings.filter((w) => w.startsWith("W_GENERATED_CLIP_HOLD")), holds);
});
