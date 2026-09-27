import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { TimelineSchema } from "../timeline/index.ts";
import { normalizeAssetOptions } from "./manifest.ts";
import type { AssetProvider } from "./provider.ts";
import { materializeSources } from "./resolve.ts";

function fakeProvider(count: { calls: number }): AssetProvider {
  return { id: "fake", normalize: normalizeAssetOptions,
    async capabilities() { return { provider: "fake", available: true,
      kinds: { image: { available: true, status: "ready" }, video: { available: true, status: "ready",
        maxSeconds: 30, resolutions: ["480p", "720p", "1080p"] as ("480p" | "720p" | "1080p")[], fromImage: true, continue: false } } }; },
    async generate(req, outPath) { count.calls++; writeFileSync(outPath, `generated ${count.calls}`);
      return { path: outPath, kind: req.kind, sha256: "placeholder", provenance: { provider: "fake", params: {}, createdAt: "2026-01-01T00:00:00Z" } }; },
  };
}

void test("status never calls providers; require misses fail; generate then status reuses", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vid2-assets-resolve-"));
  const before = process.env.VID2_HOME; process.env.VID2_HOME = dir;
  const timeline = TimelineSchema.parse({ version: 1, sources: { hero: { type: "generate", provider: "fake", kind: "image",
    prompt: "a hero", options: {} } }, scenes: [{ id: "one", duration: "1s" }] });
  const count = { calls: 0 }; const provider = fakeProvider(count);
  try {
    const status = await materializeSources(timeline, dir, { mode: "status", providers: () => { throw new Error("called"); } });
    assert.equal(status.assets[0]?.status, "missing");
    assert.equal(status.timeline.sources["hero"]?.type, "generate");
    await assert.rejects(materializeSources(timeline, dir, { mode: "require", providers: () => { throw new Error("called"); } }),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "E_INPUT" &&
        "fix" in error && String(error.fix).includes("--generate"));
    const made = await materializeSources(timeline, dir, { mode: "generate", providers: () => provider });
    assert.equal(made.assets[0]?.status, "generated");
    assert.equal(made.timeline.sources["hero"]?.type, "image");
    assert.equal(count.calls, 1);
    const reused = await materializeSources(timeline, dir, { mode: "status", providers: () => { throw new Error("called"); } });
    assert.equal(reused.assets[0]?.status, "cached");
    assert.equal(reused.timeline.sources["hero"]?.type, "image");
    assert.equal(timeline.sources["hero"]?.type, "generate");
    const generatedPath = made.assets[0]?.path;
    assert.ok(generatedPath);
    unlinkSync(generatedPath);
    assert.equal((await materializeSources(timeline, dir, { mode: "status" })).assets[0]?.status, "missing");
    await materializeSources(timeline, dir, { mode: "generate", providers: () => provider });
    assert.equal(count.calls, 2);
  } finally {
    if (before === undefined) delete process.env.VID2_HOME; else process.env.VID2_HOME = before;
    rmSync(dir, { recursive: true, force: true });
  }
});

void test("seed bytes, not path, determine video reuse", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vid2-assets-seed-"));
  const before = process.env.VID2_HOME; process.env.VID2_HOME = dir;
  const a = join(dir, "a.png"); const b = join(dir, "b.png");
  writeFileSync(a, "same image"); writeFileSync(b, "same image");
  const timeline = TimelineSchema.parse({ version: 1, sources: {
    first: { type: "generate", provider: "fake", kind: "video", prompt: "move", options: { seedImage: "a.png" } },
    second: { type: "generate", provider: "fake", kind: "video", prompt: "move", options: { seedImage: "b.png" } },
  }, scenes: [{ id: "one", duration: "1s" }] });
  const count = { calls: 0 }; const provider = fakeProvider(count);
  try {
    const first = await materializeSources(timeline, dir, { mode: "generate", providers: () => provider });
    assert.deepEqual(first.assets.map((item) => item.status), ["generated", "cached"]);
    assert.equal(first.assets[0]?.requestHash, first.assets[1]?.requestHash);
    assert.equal(count.calls, 1);
    writeFileSync(b, "changed image");
    const changed = await materializeSources(timeline, dir, { mode: "generate", providers: () => provider });
    assert.deepEqual(changed.assets.map((item) => item.status), ["cached", "generated"]);
    assert.notEqual(changed.assets[0]?.requestHash, changed.assets[1]?.requestHash);
    assert.equal(count.calls, 2);
    unlinkSync(b);
    const absentSeed = await materializeSources(timeline, dir, { mode: "status", providers: () => { throw new Error("called"); } });
    assert.deepEqual(absentSeed.assets.map((item) => item.status), ["cached", "missing"]);
  } finally {
    if (before === undefined) delete process.env.VID2_HOME; else process.env.VID2_HOME = before;
    rmSync(dir, { recursive: true, force: true });
  }
});
