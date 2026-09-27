/** Explicit opt-in: this is the only test that may ask the real ima2 server to generate media. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createIma2Provider } from "../../src/assets/ima2.ts";
import { probeMedia } from "../../src/probe/index.ts";
import { requireFfmpeg, tempDir } from "../helpers.ts";

test("live ima2 OAuth image and conditional Grok video", async t => {
  if (process.env["VID2_IMA2_LIVE"] !== "1") { t.skip("set VID2_IMA2_LIVE=1 for real ima2 generation"); return; }
  if (!requireFfmpeg(t)) return;
  const provider = createIma2Provider();
  const caps = await provider.capabilities();
  assert.equal(caps.available, true, caps.reason);
  assert.equal(caps.kinds.image?.available, true, caps.kinds.image?.reason);
  const dir = tempDir("vid2-ima2-live-");
  const image = await provider.generate({ kind: "image", prompt: "A simple red paper circle on a clean white background",
    options: provider.normalize("image", { size: "1024x1024" }) }, join(dir, "image.png"));
  const imageMedia = await probeMedia(image.path);
  assert.equal(imageMedia.kind, "image");
  assert.ok(imageMedia.width && imageMedia.height);
  assert.deepEqual([image.width, image.height], [imageMedia.width, imageMedia.height]);
  if (!caps.kinds.video?.available) {
    assert.ok(caps.kinds.video?.reason, "unavailable video kind needs a recorded reason");
    t.diagnostic(`ima2 video unavailable: ${caps.kinds.video.reason}`);
    return;
  }
  const video = await provider.generate({ kind: "video", prompt: "The red paper circle gently rotates on white for five seconds",
    options: provider.normalize("video", { durationS: 5, resolution: "480p" }) }, join(dir, "video.mp4"));
  const videoMedia = await probeMedia(video.path);
  assert.equal(videoMedia.kind, "video");
  assert.ok(videoMedia.duration && Math.abs(videoMedia.duration - 5) < 2);
});
