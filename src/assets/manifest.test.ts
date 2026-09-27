import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { sha256 } from "../shared/index.ts";
import { assetPath, lookupAsset, readManifest, recordAsset, requestHash } from "./manifest.ts";

void test("implicit and explicit image/video defaults have identical hashes", () => {
  const image = { provider: "ima2", kind: "image" as const, prompt: "a red kite" };
  const video = { provider: "ima2", kind: "video" as const, prompt: "a red kite" };
  assert.equal(requestHash({ ...image, options: {} }), requestHash({ ...image,
    options: { size: "1024x1024", quality: "high", background: "opaque", model: "oauth/gpt-image-2" } }));
  assert.equal(requestHash({ ...video, options: {} }), requestHash({ ...video,
    options: { durationS: 5, resolution: "720p", aspectRatio: "16:9", model: "grok/grok-imagine-video-1.5" } }));
  assert.equal(requestHash({ ...video, options: { seedImage: "a.png" }, seedImageSha: "same" }),
    requestHash({ ...video, options: { seedImage: "b.png" }, seedImageSha: "same" }));
});

void test("manifest writes atomically and a deleted output is a miss", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vid2-assets-manifest-"));
  const before = process.env.VID2_HOME; process.env.VID2_HOME = dir;
  try {
    const hash = sha256("asset-key");
    const path = assetPath(hash, "image");
    assert.match(path, /[a-f0-9]{16}\.png$/);
    assert.deepEqual(readManifest(), {});
    writeFileSync(path, "asset bytes");
    const asset = { path, kind: "image" as const, sha256: sha256("asset bytes"),
      provenance: { provider: "fake", params: {}, createdAt: "2026-01-01T00:00:00Z" } };
    await recordAsset(hash, asset);
    assert.equal(lookupAsset(hash)?.path, path);
    unlinkSync(path);
    assert.equal(lookupAsset(hash), undefined);
  } finally {
    if (before === undefined) delete process.env.VID2_HOME; else process.env.VID2_HOME = before;
    rmSync(dir, { recursive: true, force: true });
  }
});
