import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { captureNative } from "../../src/capture/native.ts";
import { locateTools } from "../../src/probe/index.ts";
import { runChecked } from "../../src/shared/index.ts";
import { requireFfmpeg } from "../helpers.ts";

void test("opt-in macOS display 0 capture has decoded frames and physical geometry", async (t) => {
  if (process.env["VID2_NATIVE_CAPTURE_TEST"] !== "1") { t.skip("set VID2_NATIVE_CAPTURE_TEST=1 for a live display capture"); return; }
  if (process.platform !== "darwin") { t.skip("live native test uses AVFoundation on macOS"); return; }
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-native-live-"));
  try {
    const captured = await captureNative({ display: 0, fps: 30, duration: 2, events: false, cursor: "hide", out: join(dir, "display.vid2cap") });
    const { ffprobe } = locateTools();
    const probe = await runChecked(ffprobe, ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
      "stream=width,height,nb_read_frames", "-of", "json", captured.session.footagePath]);
    const data = JSON.parse(probe.stdout.toString("utf8")) as { streams: { width: number; height: number; nb_read_frames: string }[] };
    const video = data.streams[0]!;
    assert.ok(Number(video.nb_read_frames) >= 30 && Number(video.nb_read_frames) <= 90, `unexpected frame count ${video.nb_read_frames}`);
    assert.ok(video.width >= 640 && video.height >= 480, `unexpected geometry ${video.width}x${video.height}`);
    assert.equal(captured.session.meta.width, video.width);
    assert.equal(captured.session.meta.height, video.height);
    t.diagnostic(`display 0: ${video.width}x${video.height}, ${video.nb_read_frames} decoded frames, scale ${captured.session.meta.scale}`);
    for (const warning of captured.warnings) t.diagnostic(`warning: ${warning}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
