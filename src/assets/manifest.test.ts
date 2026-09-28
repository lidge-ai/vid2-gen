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

// Literals derived by hand from the 0.2 requestHash (sha256 of stableStringify), not by running it: a request
// without references must keep its 0.2 hash or every cached Grok clip misses and is paid for again (041 V-4).
void test("requests without references keep their 0.2 hash", () => {
  const video = { provider: "ima2", kind: "video" as const, prompt: "a red kite" };
  assert.equal(requestHash({ ...video, options: {} }), "e443f1d627b9119eef6f2b64b2aa1c73aecd08f8963c516cca6510ac9df61eac");
  assert.equal(requestHash({ ...video, options: { timeoutS: 30 } }), "e443f1d627b9119eef6f2b64b2aa1c73aecd08f8963c516cca6510ac9df61eac");
  assert.equal(requestHash({ ...video, options: { seedImage: "/any/seed.png" }, seedImageSha: "seed-sha" }),
    "63439af5e82af496f86a26738dbabc2186c9e903f0f464e551dd9b355968165a");
});

void test("reference image hashes are ordered and replace the paths in the request identity", () => {
  const video = { provider: "ima2", kind: "video" as const, prompt: "a red kite" };
  const ab = requestHash({ ...video, options: { referenceImages: ["/x/a.png", "/x/b.png"] }, referenceImagesSha: ["sha-a", "sha-b"] });
  const ba = requestHash({ ...video, options: { referenceImages: ["/x/b.png", "/x/a.png"] }, referenceImagesSha: ["sha-b", "sha-a"] });
  const moved = requestHash({ ...video, options: { referenceImages: ["/y/a.png", "/y/b.png"] }, referenceImagesSha: ["sha-a", "sha-b"] });
  const edited = requestHash({ ...video, options: { referenceImages: ["/x/a.png", "/x/b.png"] }, referenceImagesSha: ["sha-a2", "sha-b"] });
  assert.notEqual(ab, ba);
  assert.equal(ab, moved);
  assert.notEqual(ab, edited);
  assert.notEqual(ab, requestHash({ ...video, options: {} }));
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
