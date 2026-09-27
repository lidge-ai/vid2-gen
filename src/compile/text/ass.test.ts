import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runChecked } from "../../shared/index.ts";
import { GraphBuilder } from "../graph.ts";
import type { BuildContext, LayerOf } from "../ir.ts";
import { buildTextRuns } from "../layers/text.ts";
import { TimelineSchema, resolveTimeline } from "../../timeline/index.ts";
import { requireFfmpeg, tempDir } from "../../../tests/helpers.ts";
import { assColor } from "./ass.ts";
import { cjkFontWarning } from "./fonts.ts";
import { packageRoot, Vid2Error } from "../../shared/index.ts";
import { requireTextCapability } from "../layers/text.ts";
import type { FfmpegInfo } from "../../probe/index.ts";

function context(workDir: string, scale = 1): BuildContext {
  return { graph: new GraphBuilder(), inputs: { add: () => "0:v", list: () => [] }, width: Math.round(320 * scale), height: Math.round(180 * scale),
    scale, fps: { num: 15, den: 1 }, rate: 1, frames: 30, renderFrames: 30, background: "#000000", oversample: 1,
    profile: "final", sceneId: "one", sources: {}, fonts: {}, workDir, pngDir: join(workDir, "png") };
}

function layer(extra: Record<string, unknown> = {}): LayerOf<"text"> {
  const t = TimelineSchema.parse({ version: 1, output: { width: 320, height: 180, fps: 15 }, scenes: [{ id: "one", duration: "2s",
    layers: [{ type: "text", text: "Hi {A}\nB", size: 40, color: "#112233", animation: "fade", animationDuration: "0.4s",
      start: "0.5s", end: "1.5s", ...extra }] }] });
  const r = resolveTimeline(t, { baseDir: process.cwd() });
  return r.scenes[0]!.layers[0] as LayerOf<"text">;
}

test("ASS content matches the checked-in snapshot", () => {
  const result = buildTextRuns([layer()], context(tempDir("vid2-ass-")), 0);
  const snapshot = readFileSync(fileURLToPath(new URL("./ass.snapshot.ass", import.meta.url)), "utf8");
  assert.equal(result.ass.content, snapshot);
  assert.match(result.filter, /^ass=filename=.*:fontsdir=/);
  assert.equal(result.fontFiles.length, 1);
  assert.ok(result.fontFiles[0]?.endsWith("Geist-Bold.ttf"));
});

test("styles, colors, escaping, and run indices remain stable", () => {
  assert.equal(assColor("#112233"), "&H00332211&");
  assert.equal(assColor("#11223399"), "&H66332211&");
  const ctx = context(tempDir("vid2-ass-"), 0.5);
  const first = buildTextRuns([layer({ animation: "none", box: { color: "#AA0000CC", padding: 10 },
    shadow: { color: "#00000099", blur: 4, y: 2 } })], ctx, 0);
  const second = buildTextRuns([layer({ text: "Second", animation: "none" })], ctx, 1);
  assert.notEqual(first.ass.path, second.ass.path);
  assert.match(first.ass.content, /PlayResX: 160/);
  assert.match(first.ass.content, /,20,&H00332211&/);
  assert.match(first.ass.content, /&H330000AA&/);
  assert.match(first.ass.content, /\\pos\(80,45\)/);
  assert.match(first.ass.content, /Hi \\{A\\}\\NB/);
});

test("CJK with a bundled Latin font produces an actionable warning", () => {
  assert.match(cjkFontWarning("안녕하세요", "sans") ?? "", /custom font/);
  assert.equal(cjkFontWarning("Hello", "sans"), undefined);
  assert.equal(cjkFontWarning("안녕하세요", "custom"), undefined);
});

test("all animation presets emit their promised ASS override", () => {
  const expected: Record<string, RegExp> = {
    none: /\\pos\(160,90\)/, fade: /\\fad\(400,120\)/, rise: /\\move\(160,114,160,90,0,400\)/,
    slam: /\\fscx145.*\\t\(0,400,0\.5,/, pop: /\\fscx80.*\\fscx108/, type: /\\2a&HFF&.*\{\\k\d+\}H/,
    wipe: /\\clip\(.*\\t\(0,400,\\clip/, blur: /\\blur18.*\\t\(0,400,\\blur0/,
  };
  for (const [animation, pattern] of Object.entries(expected)) {
    const result = buildTextRuns([layer({ animation })], context(tempDir("vid2-ass-")), 0);
    assert.match(result.ass.content, pattern, animation);
  }
});

test("custom path font is copied into the plan directory", () => {
  const ctx = context(tempDir("vid2-font-"));
  ctx.fonts.custom = { path: join(packageRoot(), "assets/fonts/Geist-Regular.ttf") };
  const result = buildTextRuns([layer({ text: "Custom", font: "custom" })], ctx, 0);
  assert.ok(result.fontFiles[0]?.startsWith(join(ctx.workDir, "fonts")));
  assert.ok(result.fontFiles[0]?.endsWith("custom-Geist-Regular.ttf"));
});

test("missing libass reports E_CAPABILITY", () => {
  const info = { filters: new Set<string>(), libs: { ass: false } } as unknown as FfmpegInfo;
  assert.throws(() => requireTextCapability(info), (error: unknown) => error instanceof Vid2Error && error.code === "E_CAPABILITY");
});

async function regionLuma(file: string, at: number): Promise<number> {
  const result = await runChecked("ffmpeg", ["-hide_banner", "-loglevel", "info", "-ss", String(at), "-i", file,
    "-frames:v", "1", "-vf", "crop=180:100:70:40,signalstats,metadata=print", "-f", "null", "-"]);
  const match = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(result.stderr);
  assert.ok(match, "signalstats must report crop luma");
  return Number(match[1]);
}

test("live ASS render is dark before entrance and visibly bright after", async t => {
  if (!requireFfmpeg(t)) return;
  const ctx = context(tempDir("vid2-ass-live-"));
  const text = buildTextRuns([layer({ text: "VISIBLE", size: 52, color: "#FFFFFF", animation: "none" })], ctx, 0);
  writeFileSync(text.ass.path, text.ass.content);
  const output = join(ctx.workDir, "text.mp4");
  await runChecked("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=320x180:r=15:d=2",
    "-vf", text.filter, "-frames:v", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", output]);
  const probe = await runChecked("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
    "stream=nb_read_frames", "-of", "default=noprint_wrappers=1:nokey=1", output]);
  assert.equal(Number(probe.stdout.toString().trim()), 30);
  const before = await regionLuma(output, 0.2);
  const after = await regionLuma(output, 0.9);
  assert.ok(after > before + 8, `text must visibly brighten its crop (${before} -> ${after})`);
});
