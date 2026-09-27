import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { run, runChecked, Vid2Error } from "../shared/index.ts";
import { escapeValue, num, quoteExpr } from "../compile/escape.ts";
import type { RenderPlan, SegmentPlan } from "../compile/ir.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { renderPlan } from "./runner.ts";
import { verifyVideo } from "./verify.ts";

const SIZE = 64;
const FPS = { num: 15, den: 1 };

function segment(index: number, color: string, frames: number): SegmentPlan {
  return { id: `s${index}`, sceneId: `s${index}`, index, frames: 15, renderFrames: frames,
    width: SIZE, height: SIZE, fps: FPS, inputs: [{ id: "color", kind: "lavfi", lavfi: color,
      args: ["-f", "lavfi", "-i", `color=c=${escapeValue(color)}:s=${num(SIZE)}x${num(SIZE)}:` +
        `r=${num(FPS.num)}:d=${num(frames / FPS.num)}`] }],
    graph: "[0:v]format=yuv420p[vout]", outLabel: "vout", assFiles: [], fontFiles: [], textBackend: "ass" as const, internalRate: 1, hash: color };
}

function plan(root: string): RenderPlan {
  const graph = `[0:v]fps=${num(FPS.num)},settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p,setsar=1,` +
    `scale=out_range=tv,trim=end_frame=${num(15)},setpts=PTS-STARTPTS[a];` +
    `[1:v]fps=${num(FPS.num)},settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p,setsar=1,` +
    `scale=out_range=tv,trim=end_frame=${num(15)},setpts=PTS-STARTPTS[b];` +
    `[a][b]xfade=transition=fade:duration=${num(8 / 15)}:offset=${num(7 / 15)},` +
    `trim=end_frame=${num(22)}[vjoin]`;
  return { planVersion: 1, timelineHash: "hand-written", profile: "final",
    output: { width: SIZE, height: SIZE, fps: FPS, background: "#000000", container: "mp4",
      videoCodec: "h264", quality: "high" }, totalFrames: 22,
    segments: [segment(0, "red", 17), segment(1, "blue", 15)],
    join: { segments: [{ id: "s0", frames: 15, renderFrames: 17 }, { id: "s1", frames: 15, renderFrames: 15 }],
      steps: [{ kind: "xfade", transition: "fade", frames: 8, offsetFrames: 7 }], totalFrames: 22, graph },
    post: { overlays: [], effects: [], inputs: [], graph: null }, audio: null, workDir: join(root, "work"),
    tool: { ffmpeg: "ffmpeg", ffprobe: "ffprobe", version: "8.0.1", major: 8, minor: 0 } };
}

async function luma(path: string, frame: number): Promise<number> {
  const filter = `select=${quoteExpr(`eq(n,${num(frame)})`)},format=gray`;
  const result = await runChecked("ffmpeg", ["-v", "error", "-i", path, "-vf", filter,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"]);
  assert.equal(result.stdout.length, SIZE * SIZE);
  return result.stdout.reduce((sum, value) => sum + value, 0) / result.stdout.length;
}

test("real two-segment xfade is visible, cached, and verified", async (t) => {
  if (!requireFfmpeg(t)) return;
  const root = mkdtempSync(join(tmpdir(), "vid2-render-"));
  const previous = process.env["VID2_HOME"];
  process.env["VID2_HOME"] = join(root, "home");
  try {
    const render = plan(root);
    render.segments[0]!.assFiles = [
      { path: join(root, "work", "first.ass"), content: "first run", fontsDir: join(root, "work", "fonts") },
      { path: join(root, "work", "second.ass"), content: "second run", fontsDir: join(root, "work", "fonts") },
    ];
    const out = join(root, "movie.mp4");
    const first = await renderPlan(render, { out, jobs: 2 });
    assert.deepEqual(first.segments.map((value) => value.cached), [false, false]);
    assert.equal(readFileSync(render.segments[0]!.assFiles[0]!.path, "utf8"), "first run");
    assert.equal(readFileSync(render.segments[0]!.assFiles[1]!.path, "utf8"), "second run");
    assert.equal((await verifyVideo(out, "ffprobe", { width: SIZE, height: SIZE, frames: 22,
      pixFmt: "yuv420p", range: "tv", faststart: true })).frames, 22);
    const [red, blend, blue] = await Promise.all([luma(out, 0), luma(out, 11), luma(out, 21)]);
    assert.ok(red > blue + 15, `expected distinct scene colours: ${red}, ${blue}`);
    assert.ok(blend < red - 5 && blend > blue + 5, `expected a visible blend: ${red}, ${blend}, ${blue}`);
    const second = await renderPlan(render, { out, jobs: 2 });
    assert.deepEqual(second.segments.map((value) => value.cached), [true, true]);
    assert.equal((JSON.parse(readFileSync(second.manifest, "utf8")) as { segments: { cached: boolean }[] }).segments[0]?.cached, true);
    await assert.rejects(verifyVideo(out, "ffprobe", { width: SIZE, height: SIZE, frames: 30 }),
      (error: unknown) => error instanceof Vid2Error && error.code === "E_RENDER");
  } finally {
    if (previous === undefined) delete process.env["VID2_HOME"];
    else process.env["VID2_HOME"] = previous;
  }
});

async function hasLegacyScriptOption(): Promise<boolean> {
  const help = await run("ffmpeg", ["-hide_banner", "-h", "full"]);
  return help.stdout.toString("utf8").includes("filter_complex_script");
}

test("legacy graph transport renders and invalid xfade is rejected", async (t) => {
  if (!requireFfmpeg(t)) return;
  // ffmpeg 8+/9 builds may drop -filter_complex_script; the legacy path only matters for ffmpeg < 7.1.
  if (!(await hasLegacyScriptOption())) { t.skip("this ffmpeg has no -filter_complex_script"); return; }
  const root = mkdtempSync(join(tmpdir(), "vid2-render-legacy-"));
  const render = plan(root);
  render.tool.version = "6.1";
  render.tool.major = 6;
  render.tool.minor = 1;
  const out = join(root, "legacy.mp4");
  await renderPlan(render, { out, noCache: true, jobs: 1 });
  assert.equal((await verifyVideo(out, "ffprobe", { width: SIZE, height: SIZE, frames: 22 })).frames, 22);
  render.join.steps[0]!.offsetFrames = 14;
  await assert.rejects(renderPlan(render, { out }), (error: unknown) =>
    error instanceof Vid2Error && error.code === "E_RENDER" && /xfade/.test(error.message));
});
