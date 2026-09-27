import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runChecked } from "../shared/index.ts";
import { requireFfmpeg, tempDir } from "../../tests/helpers.ts";
import { runQa } from "./run.ts";
import { qa } from "../cli/commands/qa.ts";
import { probe } from "../cli/commands/probe.ts";
import { TimelineSchema, resolveTimeline } from "../timeline/index.ts";
import { Vid2Error } from "../shared/index.ts";

const ffmpeg = () => process.env["VID2_FFMPEG"] ?? "ffmpeg";
const ffprobe = () => process.env["VID2_FFPROBE"] ?? "ffprobe";

async function faultVideo(path: string): Promise<void> {
  const graph = "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a]volume=16[a]";
  await runChecked(ffmpeg(), ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=64x64:r=15:d=1",
    "-f", "lavfi", "-i", "color=c=black:s=64x64:r=15:d=0.8", "-f", "lavfi", "-i", "color=c=red:s=64x64:r=15:d=3.2",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=5", "-filter_complex", graph,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-t", "5", "-movflags", "+faststart", path]);
}

async function movingVideo(path: string, codec: string, extra: string[] = []): Promise<void> {
  await runChecked(ffmpeg(), ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=64x64:r=15:d=2",
    "-frames:v", "30", "-c:v", codec, ...extra, path]);
}

test("QA measures black, frozen and clipped audio and preserves waivers", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-qa-fault-");
  const video = join(dir, "fault.mp4");
  await faultVideo(video);
  const report = await runQa({ video, out: join(dir, "qa"), ffmpeg: ffmpeg(), ffprobe: ffprobe() });
  assert.equal(report.status, "fail");
  const black = report.issues.find((issue) => issue.check === "black")!;
  assert.equal(black.severity, "fail");
  assert.ok(black.range && Math.abs(black.range[0] - 1) < 0.15 && Math.abs(black.range[1] - 1.8) < 0.15,
    `black range ${JSON.stringify(black.range)}`);
  const frozen = report.issues.find((issue) => issue.check === "frozen")!;
  assert.equal(frozen.severity, "warn");
  assert.ok(frozen.range && frozen.range[1] - frozen.range[0] >= 3);
  assert.equal(report.issues.find((issue) => issue.code === "LOUDNESS_TP")?.severity, "fail");
  assert.ok((report.facts.audio?.truePeak ?? -99) > -0.5);
  const strict = await runQa({ video, out: join(dir, "strict"), ffmpeg: ffmpeg(), ffprobe: ffprobe(), strictMotion: true });
  assert.equal(strict.issues.find((issue) => issue.check === "frozen")?.severity, "fail");
  for (const name of ["report", "probe", "contact", "waveform", "spectrogram"]) {
    assert.ok(existsSync(report.artifacts[name]!), `${name} missing`);
  }
  assert.equal((JSON.parse(readFileSync(report.artifacts["report"]!, "utf8")) as { status: string }).status, "fail");
  const waived = await runQa({ video, out: join(dir, "waived"), ffmpeg: ffmpeg(), ffprobe: ffprobe(),
    waive: "black@0.9-1.9,loudness@0-5" });
  assert.equal(waived.status, "warn");
  assert.equal(waived.issues.find((issue) => issue.check === "black")?.status, "waived");
});

test("video-only skips audio checks; expect-audio makes absence a failure", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-qa-silent-");
  const video = join(dir, "silent.mp4");
  await movingVideo(video, "libx264", ["-pix_fmt", "yuv420p", "-movflags", "+faststart"]);
  const report = await runQa({ video, ffmpeg: ffmpeg(), ffprobe: ffprobe() });
  assert.equal(report.status, "pass");
  for (const name of ["silence", "loudness", "av_sync"]) assert.equal(report.checks[name as keyof typeof report.checks], "skipped");
  assert.equal(report.artifacts["waveform"], undefined);
  const required = await runQa({ video, out: join(dir, "expected"), ffmpeg: ffmpeg(), ffprobe: ffprobe(), expectAudio: true });
  assert.equal(required.status, "fail");
  assert.equal(required.issues.find((issue) => issue.code === "AUDIO_MISSING")?.severity, "fail");
  assert.equal(required.checks.loudness, "skipped");
  const probed = await probe.run({ args: [video], values: {}, cwd: dir, json: true, stderr: process.stderr });
  assert.equal(probed.data["width"], 64);
  await assert.rejects(qa.run({ args: [video], values: { "expect-audio": true, out: join(dir, "cli") }, cwd: dir,
    json: true, stderr: process.stderr }), (error: unknown) => error instanceof Vid2Error && error.exit === 6 &&
    (error.details?.["report"] as { status?: string })?.status === "fail");
});

test("timeline stills, text checks, and A/V sync use observed output", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-qa-timeline-");
  const video = join(dir, "background.mp4");
  await runChecked(ffmpeg(), ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x202020:s=64x64:r=15:d=2",
    "-frames:v", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", video]);
  const authored = TimelineSchema.parse({ version: 1, output: { width: 64, height: 64, fps: 15 }, scenes: [
    { id: "intro", duration: "1s", layers: [{ type: "text", text: "HELLO", size: 12, color: "#202020", x: 0, y: 0 }] },
    { id: "outro", duration: "1s" }],
    qa: { waive: [{ check: "black", from: "1s", to: "1.8s", reason: "intentional gap" },
      { check: "text_safe", from: "0s", to: "1s", reason: "edge title intentional" }] } });
  const timeline = resolveTimeline(authored, { baseDir: dir });
  assert.equal(timeline.qa.waivers[0]?.fromS, 1);
  timeline.captureEvents = [{ frame: 10, kind: "click", sourceId: "fixture" }];
  const report = await runQa({ video, timeline, ffmpeg: ffmpeg(), ffprobe: ffprobe() });
  assert.equal(report.checks.duration, "pass");
  assert.equal(report.checks.text_safe, "pass");
  assert.equal(report.issues.find((item) => item.check === "text_safe")?.status, "waived");
  assert.equal(report.issues.find((item) => item.check === "text_safe")?.waiver?.source, "timeline");
  assert.equal(report.checks.contrast, "warn");
  for (const name of ["intro-start", "intro-mid", "intro-end", "outro-start", "outro-mid", "outro-end",
    "outro-seam-before", "outro-seam-after", "event-1"]) assert.ok(existsSync(report.artifacts[name]!));
  const audio = join(dir, "short.wav");
  const desynced = join(dir, "desynced.mp4");
  await runChecked(ffmpeg(), ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
    "-c:a", "pcm_s24le", audio]);
  await runChecked(ffmpeg(), ["-v", "error", "-y", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", desynced]);
  const mismatch = await runQa({ video: desynced, out: join(dir, "desync-qa"), ffmpeg: ffmpeg(), ffprobe: ffprobe() });
  assert.equal(mismatch.checks.av_sync, "fail");
  assert.ok(Math.abs(mismatch.facts.audio!.durationS - mismatch.facts.durationS) > 0.5);
});

test("format matrix accepts ProRes and VP9 and rejects MP4 without faststart", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-qa-format-");
  const mov = join(dir, "valid.mov");
  const webm = join(dir, "valid.webm");
  const mp4 = join(dir, "nofast.mp4");
  await movingVideo(mov, "prores_ks", ["-profile:v", "3", "-pix_fmt", "yuv422p10le"]);
  await movingVideo(webm, "libvpx-vp9", ["-pix_fmt", "yuv420p"]);
  await movingVideo(mp4, "libx264", ["-pix_fmt", "yuv420p"]);
  for (const file of [mov, webm]) {
    const report = await runQa({ video: file, ffmpeg: ffmpeg(), ffprobe: ffprobe() });
    assert.equal(report.checks.format, "pass", file);
  }
  const bad = await runQa({ video: mp4, ffmpeg: ffmpeg(), ffprobe: ffprobe() });
  assert.equal(bad.checks.format, "fail");
  assert.equal(bad.facts.faststart, false);
});
