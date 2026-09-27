import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runChecked } from "../shared/index.ts";
import type { Fps } from "../shared/index.ts";
import { locateTools } from "../probe/index.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { num, quoteExpr } from "./escape.ts";
import { planJoin } from "./joins.ts";

const rate: Fps = { num: 30, den: 1 };
const segments = (count: number, frames = 60) => Array.from({ length: count }, (_, i) =>
  ({ id: `s${i}`, frames, renderFrames: frames + (i === count - 1 ? 0 : 2) }));

void test("3x60f with 15f fades offsets at 1.5s and 3s; total 150", () => {
  const plan = planJoin(segments(3), [{ type: "fade", frames: 15 }, { type: "fade", frames: 15 }, null], rate);
  assert.equal(plan.totalFrames, 150);
  assert.deepEqual(plan.steps.map((step) => step.offsetFrames), [45, 90]);
  assert.match(plan.graph ?? "", /xfade=transition=fade:duration=0\.5:offset=1\.5/);
  assert.match(plan.graph ?? "", /xfade=transition=fade:duration=0\.5:offset=3\[/);
  assert.match(plan.graph ?? "", /settb=AVTB/);
  assert.match(plan.graph ?? "", /trim=end_frame=150,setpts=PTS-STARTPTS\[vjoin\]/);
});

void test("rational fps uses AVTB and seconds from frame numerator/denominator", () => {
  const fps = { num: 30000, den: 1001 };
  const plan = planJoin(segments(3), [{ type: "fade", frames: 15 }, { type: "fade", frames: 15 }], fps);
  assert.equal(plan.totalFrames, 150);
  assert.match(plan.graph ?? "", /fps=30000\/1001,settb=AVTB/);
  assert.match(plan.graph ?? "", /duration=0\.5005:offset=1\.5015/);
  assert.match(plan.graph ?? "", /duration=0\.5005:offset=3\.003/);
  assert.doesNotMatch(plan.graph ?? "", /settb=1\/30000/);
});

void test("fade then cut then fade trims accumulated spare frames", () => {
  const plan = planJoin(segments(4), [{ type: "fade", frames: 15 }, null, { type: "fade", frames: 15 }], rate);
  assert.equal(plan.totalFrames, 210);
  assert.deepEqual(plan.steps.map((step) => step.kind), ["xfade", "concat", "xfade"]);
  assert.match(plan.graph ?? "", /trim=end_frame=105,setpts=PTS-STARTPTS\[vleft2\]/);
  assert.match(plan.graph ?? "", /trim=end_frame=165,setpts=PTS-STARTPTS\[vleft3\]/);
  assert.match(plan.graph ?? "", /concat=n=2:v=1:a=0/);
});

void test("single segment is a copy plan; invalid transitions reject", () => {
  assert.deepEqual(planJoin(segments(1), [], rate), { segments: segments(1), steps: [], totalFrames: 60, graph: null });
  assert.throws(() => planJoin(segments(2), [{ type: "fade", frames: 60 }], rate), { code: "E_INPUT" });
  assert.throws(() => planJoin(segments(2), [{ type: "unknown", frames: 15 }], rate), { code: "E_INPUT" });
  assert.throws(() => planJoin([{ id: "a", frames: 60, renderFrames: 60 }, { id: "b", frames: 60, renderFrames: 60 }], [null], rate), { code: "E_INPUT" });
});

async function colorClip(ffmpeg: string, path: string, color: string, fps: Fps, frames: number): Promise<void> {
  await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    `color=c=${color}:s=80x80:r=${num(fps.num)}/${num(fps.den)}`, "-frames:v", num(frames), "-c:v", "ffv1", "-y", path]);
}

async function countFrames(ffprobe: string, path: string): Promise<number> {
  const result = await runChecked(ffprobe, ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
    "stream=nb_read_frames", "-of", "csv=p=0", path]);
  return Number(result.stdout.toString("utf8").trim());
}

async function pixel(ffmpeg: string, path: string, frame: number): Promise<[number, number, number]> {
  const select = `select=${quoteExpr(`eq(n,${num(frame)})`)}`;
  const crop = `crop=${num(1)}:${num(1)}:${num(40)}:${num(40)}`;
  const result = await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", path,
    "-vf", `${select},format=rgb24,${crop}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  assert.equal(result.stdout.length, 3);
  return [result.stdout[0]!, result.stdout[1]!, result.stdout[2]!];
}

function near(actual: [number, number, number], expected: [number, number, number]): void {
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(actual[i]! - expected[i]!) < 15,
    `pixel ${actual.join(",")} differs from ${expected.join(",")}`);
}

void test("live fade-cut-fade has exact frames and visible boundary colours", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg, ffprobe } = locateTools();
  const dir = mkdtempSync(join(tmpdir(), "vid2-join-"));
  try {
    const clips = ["red", "blue", "green", "yellow"].map((_, i) => join(dir, `s${i}.mkv`));
    for (let i = 0; i < clips.length; i++) await colorClip(ffmpeg, clips[i]!, ["red", "blue", "green", "yellow"][i]!, rate, i === 3 ? 60 : 62);
    const plan = planJoin(segments(4), [{ type: "fade", frames: 15 }, null, { type: "fade", frames: 15 }], rate);
    const output = join(dir, "joined.mkv");
    const args = clips.flatMap((clip) => ["-i", clip]);
    await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", ...args, "-filter_complex", plan.graph!,
      "-map", "[vjoin]", "-c:v", "ffv1", "-y", output]);
    assert.equal(await countFrames(ffprobe, output), 210);
    const firstFade = await pixel(ffmpeg, output, 52);
    assert.ok(firstFade[0] > 40 && firstFade[0] < 220 && firstFade[2] > 40 && firstFade[2] < 220,
      `first fade did not blend red and blue: ${firstFade.join(",")}`);
    const secondFade = await pixel(ffmpeg, output, 157);
    assert.ok(secondFade[0] > 40 && secondFade[1] > 100,
      `second fade did not blend green and yellow: ${secondFade.join(",")}`);
    for (const [frame, color] of [[0, [255, 0, 0]], [44, [255, 0, 0]], [60, [0, 0, 255]], [104, [0, 0, 255]],
      [105, [0, 128, 0]], [149, [0, 128, 0]], [165, [255, 255, 0]], [209, [255, 255, 0]]] as const) {
      near(await pixel(ffmpeg, output, frame), [...color]);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

void test("live 30000/1001 join keeps its rational frame count", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg, ffprobe } = locateTools();
  const fps = { num: 30000, den: 1001 };
  const dir = mkdtempSync(join(tmpdir(), "vid2-join-ntsc-"));
  try {
    const a = join(dir, "a.mkv"); const b = join(dir, "b.mkv"); const output = join(dir, "joined.mkv");
    await colorClip(ffmpeg, a, "red", fps, 62);
    await colorClip(ffmpeg, b, "blue", fps, 60);
    const plan = planJoin(segments(2), [{ type: "fade", frames: 15 }], fps);
    await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", a, "-i", b,
      "-filter_complex", plan.graph!, "-map", "[vjoin]", "-c:v", "ffv1", "-y", output]);
    assert.equal(await countFrames(ffprobe, output), 105);
    near(await pixel(ffmpeg, output, 0), [255, 0, 0]);
    near(await pixel(ffmpeg, output, 104), [0, 0, 255]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
