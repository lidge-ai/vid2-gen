import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { escapePath } from "../compile/escape.ts";
import type { RenderPlan, SegmentPlan } from "../compile/ir.ts";
import { segmentCacheKey } from "./cache.ts";

function fixture(root: string, workDir: string, media: string): RenderPlan {
  mkdirSync(workDir, { recursive: true });
  const font = join(workDir, "font.ttf");
  writeFileSync(font, "font bytes");
  const segment: SegmentPlan = { id: "one", sceneId: "one", index: 0, frames: 15, renderFrames: 15,
    width: 64, height: 64, fps: { num: 15, den: 1 }, inputs: [{ id: "media", kind: "video", path: media,
      args: ["-i", media] }], graph: `[0:v]ass=filename=${escapePath(join(workDir, "title.ass"))}[vout]`,
    outLabel: "vout", assFiles: [{ path: join(workDir, "title.ass"), content: "text", fontsDir: workDir }],
    fontFiles: [font], textBackend: "ass" as const, internalRate: 1, stageDeps: [], hash: root };
  return { planVersion: 1, timelineHash: "timeline", profile: "final", output: { width: 64, height: 64,
    fps: { num: 15, den: 1 }, background: "#000000", container: "mp4", videoCodec: "h264", quality: "high" },
    totalFrames: 15, segments: [segment], join: { segments: [{ id: "one", frames: 15, renderFrames: 15 }],
      steps: [], totalFrames: 15, graph: null }, post: { overlays: [], effects: [], inputs: [], graph: null },
    audio: null, stageRenders: [], workDir, tool: { ffmpeg: "ffmpeg", ffprobe: "ffprobe", version: "8.0", major: 8, minor: 0 } };
}

test("segment cache key ignores work directory and changes with input bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "vid2-cache-key-"));
  const media = join(root, "media.bin");
  writeFileSync(media, "first content");
  const first = fixture(root, join(root, "work-a"), media);
  const second = fixture(root, join(root, "work-b"), media);
  const key = await segmentCacheKey(first.segments[0]!, first);
  assert.equal(key, await segmentCacheKey(second.segments[0]!, second));
  writeFileSync(media, "changed content");
  assert.notEqual(key, await segmentCacheKey(first.segments[0]!, first));
});
