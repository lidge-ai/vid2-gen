import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runChecked } from "../shared/index.ts";
import { requireFfmpeg, tempDir } from "../../tests/helpers.ts";
import { measureLoudness, parseLoudnormJson, twoPassLoudnorm } from "./loudness.ts";
import { muxAudio } from "./mux.ts";

const ffmpeg = () => process.env["VID2_FFMPEG"] ?? "ffmpeg";
const ffprobe = () => process.env["VID2_FFPROBE"] ?? "ffprobe";

test("loudnorm JSON parser reads measured values", () => {
  const result = parseLoudnormJson('other log\n{"input_i":"-18.20","input_tp":"-4.50","input_lra":"1.20",' +
    '"input_thresh":"-28.20","target_offset":"0.10","normalization_type":"linear"}\n');
  assert.equal(result.input_i, -18.2);
  assert.equal(result.normalization_type, "linear");
});

test("two-pass master measures near -14 LUFS and under -0.9 dBTP", async (t) => {
  if (!requireFfmpeg(t)) return;
  const root = tempDir("vid2-loudness-");
  const input = join(root, "input.wav");
  const master = join(root, "master.wav");
  await runChecked(ffmpeg(), ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3",
    "-ac", "2", "-c:a", "pcm_s24le", input]);
  const result = await twoPassLoudnorm(input, master, { I: -14, TP: -1, LRA: 11 }, ffmpeg());
  assert.ok(Math.abs(result.loudness.integrated + 14) <= 0.5, `I=${result.loudness.integrated}`);
  assert.ok(result.loudness.truePeak <= -0.9, `TP=${result.loudness.truePeak}`);
  assert.ok(["linear", "dynamic"].includes(result.normalizationType));
  assert.deepEqual(await measureLoudness(master, ffmpeg()), result.loudness);
});

test("AAC/Opus mux keeps audio within one video frame", async (t) => {
  if (!requireFfmpeg(t)) return;
  const root = tempDir("vid2-mux-");
  const audio = join(root, "audio.wav");
  await runChecked(ffmpeg(), ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
    "-ac", "2", "-c:a", "pcm_s24le", audio]);
  for (const [codec, videoCodec, container] of [["aac", "libx264", "mp4"], ["opus", "libvpx-vp9", "webm"]] as const) {
    const video = join(root, `silent.${container}`);
    const out = join(root, `muxed.${container}`);
    await runChecked(ffmpeg(), ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=2",
      "-frames:v", "60", "-c:v", videoCodec, video]);
    const result = await muxAudio({ video, audio, out, codec, seconds: 2, ffmpeg: ffmpeg(), ffprobe: ffprobe(), targetTP: -30 });
    assert.ok(Math.abs(result.durationDelta) <= 1 / 30, `${codec} duration delta ${result.durationDelta}`);
    assert.ok(Number.isFinite(result.loudness.integrated));
    assert.match(result.warnings[0] ?? "", /Post-codec true peak/);
    if (codec === "aac") {
      const bytes = readFileSync(out).subarray(0, 4 * 1024 * 1024);
      const moov = bytes.indexOf("moov");
      const mdat = bytes.indexOf("mdat");
      assert.ok(moov >= 0 && mdat >= 0 && moov < mdat, "muxed MP4 should be faststart");
    }
  }
});
