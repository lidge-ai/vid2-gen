import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runChecked } from "../../shared/exec.ts";
import { TimelineSchema } from "../../timeline/schema.ts";
import { resolveTimeline } from "../../timeline/resolve.ts";
import { compileSegment } from "../segment.ts";
import { inputRegistry } from "../segment.ts";
import type { BuildContext } from "../ir.ts";
import { GraphBuilder } from "../graph.ts";
import { sourceInput } from "./media.ts";
import { requireFfmpeg, tempDir } from "../../../tests/helpers.ts";

const ffmpeg = process.env["VID2_FFMPEG"] ?? "ffmpeg";
const root = resolve(import.meta.dirname, "../../..");

function timeline(path: string, count: number, out = true): unknown {
  return { version: 1, output: { width: 32, height: 32, fps: 10 },
    sources: { clip: { type: "video", path } },
    scenes: [{ id: "one", duration: "3s", background: "#000000", layers: Array.from({ length: count }, (_, i) =>
      ({ type: "media", source: "clip", in: `${i + 1}s`, ...(out ? { out: `${i + 2}s` } : {}) })) }] };
}

function segment(path: string, count: number) {
  const parsed = TimelineSchema.parse(timeline(path, count, false));
  const resolved = resolveTimeline(parsed, { baseDir: "/" });
  return compileSegment(resolved.scenes[0]!, { width: 32, height: 32, scale: 1, oversample: 1,
    profile: "final", fps: resolved.fps, background: "#000000", sources: resolved.sources,
    fonts: resolved.fonts, workDir: "/tmp", pngDir: "/tmp", textBackend: "raster" }, true);
}

test("compile marks every repeated video read, but leaves a single read unchanged", () => {
  const path = "/tmp/vid2-repeated-source.mp4";
  const repeated = segment(path, 3).inputs.filter((item) => item.kind === "video");
  assert.equal(repeated.length, 3);
  assert.ok(repeated.every((item) => item.pretrim?.sourcePath === path));
  assert.ok(repeated.every((item) => item.pretrim?.durationSeconds === 3));
  const single = segment(path, 1).inputs.find((item) => item.kind === "video");
  assert.equal(single?.pretrim, undefined);
});

test("capture source receives the same guarded out cut", () => {
  const dir = tempDir("vid2-capture-out-");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "session.json"), JSON.stringify({ footage: "footage.mp4" }));
  const inputs = inputRegistry();
  const ctx = { inputs, graph: new GraphBuilder(), width: 32, height: 32, fps: { num: 10, den: 1 }, rate: 1 } as BuildContext;
  sourceInput({ type: "capture", session: dir }, 3, ctx,
    { inSeconds: 1, outSeconds: 2, speed: 1 });
  const input = inputs.list()[0]!;
  assert.equal(input.pretrim?.durationSeconds, 0.999);
  assert.deepEqual(input.args.slice(0, 4), ["-ss", "1", "-t", "0.999"]);
});

test("out holds the final red frame over a three-second layer", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-media-out-");
  const clip = join(dir, "red-blue.mkv");
  await runChecked(ffmpeg, ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=32x32:r=10:d=2",
    "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=10:d=2", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0",
    "-c:v", "ffv1", "-pix_fmt", "yuv420p", clip]);
  const authored = timeline(clip, 1);
  const input = join(dir, "timeline.json");
  const output = join(dir, "output.mp4");
  writeFileSync(input, JSON.stringify(authored));
  const result = await runChecked(process.execPath, [join(root, "src/cli/index.ts"), "render", input, "-o", output,
    "--json"], { env: { ...process.env, VID2_HOME: join(dir, "home") } });
  assert.equal((JSON.parse(result.stdout.toString()) as { ok: boolean }).ok, true);
  for (const frame of [0, 15, 29]) {
    const image = await runChecked(ffmpeg, ["-hide_banner", "-v", "error", "-i", output,
      "-vf", `select=eq(n\\,${frame}),format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "-"]);
    const [red, green, blue] = image.stdout;
    assert.ok(red! > 150 && green! < 100 && blue! < 100, `frame ${frame}: ${String(red)},${String(green)},${String(blue)}`);
  }
  assert.ok(readFileSync(output).length > 0);
});
