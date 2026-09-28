import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { run, sha256, Vid2Error } from "../shared/index.ts";
import { TimelineSchema } from "../timeline/index.ts";
import { normalizeAssetOptions } from "./manifest.ts";
import type { AssetProvider, GenerateRequest } from "./provider.ts";
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

interface Spy { providers: number; capabilities: number; requests: GenerateRequest[] }
/** Video provider spy standing in for ima2; `clip` is copied as the generated file when given. */
function videoSpy(spy: Spy, durationS?: number, clip?: string): AssetProvider {
  return { id: "ima2", normalize: normalizeAssetOptions,
    async capabilities() { spy.capabilities++; return { provider: "ima2", available: true, kinds: { video: { available: true,
      status: "ready", maxSeconds: 15, resolutions: ["480p", "720p"] as ("480p" | "720p")[], fromImage: true, continue: false } } }; },
    async generate(req, outPath) {
      spy.requests.push(req);
      if (clip) copyFileSync(clip, outPath); else writeFileSync(outPath, `clip ${spy.requests.length}`);
      return { path: outPath, kind: req.kind, ...(durationS === undefined ? {} : { durationS }), sha256: "unused",
        provenance: { provider: "ima2", params: {}, createdAt: "2026-01-01T00:00:00Z" } };
    } };
}

async function withHome(prefix: string, body: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const before = process.env.VID2_HOME; process.env.VID2_HOME = dir;
  try { await body(dir); } finally {
    if (before === undefined) delete process.env.VID2_HOME; else process.env.VID2_HOME = before;
    rmSync(dir, { recursive: true, force: true });
  }
}

function clipTimeline(options: Record<string, unknown>, provider = "ima2") {
  return TimelineSchema.parse({ version: 1, sources: { clip: { type: "generate", provider, kind: "video", prompt: "a slow pan",
    options } }, scenes: [{ id: "one", duration: "1s" }] });
}

const inputError = (path: string) => (error: unknown): boolean =>
  error instanceof Vid2Error && error.code === "E_INPUT" && error.details?.["path"] === path;

void test("invalid ima2 video options fail before any provider call", async () => {
  await withHome("vid2-assets-guard-", async (dir) => {
    const spy: Spy = { providers: 0, capabilities: 0, requests: [] };
    const eight = Array.from({ length: 8 }, (_, i) => `ref${i}.png`);
    const cases: [Record<string, unknown>, string][] = [
      [{ durationS: 20 }, "durationS"], [{ durationS: 2.5 }, "durationS"], [{ referenceImages: eight }, "referenceImages"],
      [{ referenceImages: ["a.png"], resolution: "1080p" }, "resolution"],
      [{ referenceImages: ["a.png"], seedImage: "seed.png" }, "referenceImages"],
      [{ referenceImages: ["a.png", "b.png", "c.png", "d.png"], model: "oauth/other-video" }, "referenceImages"],
      [{ aspectRatio: "21:9" }, "aspectRatio"], [{ loop: true }, "loop"],
    ];
    for (const [options, key] of cases) for (const mode of ["generate", "status"] as const) {
      await assert.rejects(materializeSources(clipTimeline(options), dir, { mode, providers: () => { spy.providers++; return videoSpy(spy); } }),
        inputError(`sources.clip.options.${key}`), `${mode} ${JSON.stringify(options)}`);
    }
    assert.deepEqual([spy.providers, spy.capabilities, spy.requests.length], [0, 0, 0]);
    const loose = await materializeSources(clipTimeline({ durationS: 20, loop: true }, "fake"), dir, { mode: "status" });
    assert.equal(loose.assets[0]?.status, "missing", "non-ima2 providers keep loose options");
  });
});

void test("reference image bytes and order determine video reuse", async () => {
  await withHome("vid2-assets-refs-", async (dir) => {
    const spy: Spy = { providers: 0, capabilities: 0, requests: [] };
    const a = join(dir, "a.png"); const b = join(dir, "b.png");
    writeFileSync(a, "image A"); writeFileSync(b, "image B");
    const providers = () => videoSpy(spy, 5);
    const ab = clipTimeline({ referenceImages: ["a.png", "b.png"] });
    const first = await materializeSources(ab, dir, { mode: "generate", providers });
    assert.equal(first.assets[0]?.status, "generated");
    assert.deepEqual(spy.requests[0]?.referenceImagesSha, [sha256("image A"), sha256("image B")]);
    assert.deepEqual((spy.requests[0]?.options as { referenceImages?: string[] }).referenceImages, [a, b]);
    const hit = await materializeSources(ab, dir, { mode: "status", providers: () => { throw new Error("called"); } });
    assert.equal(hit.assets[0]?.status, "cached");
    assert.equal(hit.assets[0]?.requestHash, first.assets[0]?.requestHash);
    const ba = await materializeSources(clipTimeline({ referenceImages: ["b.png", "a.png"] }), dir, { mode: "generate", providers });
    assert.equal(ba.assets[0]?.status, "generated");
    assert.notEqual(ba.assets[0]?.requestHash, first.assets[0]?.requestHash);
    writeFileSync(a, "image A edited");
    assert.equal((await materializeSources(ab, dir, { mode: "status" })).assets[0]?.status, "missing");
    unlinkSync(b);
    assert.equal((await materializeSources(ab, dir, { mode: "status" })).assets[0]?.status, "missing");
    await assert.rejects(materializeSources(ab, dir, { mode: "generate", providers }),
      inputError("sources.clip.options.referenceImages.1"));
    assert.equal(spy.requests.length, 2);
  });
});

void test("generatedVideos reports clip seconds on generate and cache hits, and nothing for placeholders", async () => {
  await withHome("vid2-assets-durations-", async (dir) => {
    const spy: Spy = { providers: 0, capabilities: 0, requests: [] };
    const timeline = clipTimeline({ durationS: 5 });
    const made = await materializeSources(timeline, dir, { mode: "generate", providers: () => videoSpy(spy, 5) });
    assert.deepEqual(made.generatedVideos, { clip: { durationS: 5 } });
    const hit = await materializeSources(timeline, dir, { mode: "status" });
    assert.deepEqual(hit.generatedVideos, { clip: { durationS: 5 } });
    assert.deepEqual((await materializeSources(timeline, dir, { mode: "placeholders" })).generatedVideos, {});
    const unknown = clipTimeline({ durationS: 6 });
    await materializeSources(unknown, dir, { mode: "generate", providers: () => videoSpy(spy) });
    assert.deepEqual((await materializeSources(unknown, dir, { mode: "status" })).generatedVideos, { clip: { durationS: null } });
  });
});

void test("an old manifest entry without durationS is probed on a cache hit", { timeout: 60_000 }, async (t) => {
  if (!requireFfmpeg(t)) return;
  await withHome("vid2-assets-probe-", async (dir) => {
    const clip = join(dir, "clip.mp4");
    const made = await run(process.env["VID2_FFMPEG"] ?? "ffmpeg", ["-hide_banner", "-v", "error", "-f", "lavfi",
      "-i", "testsrc2=size=160x90:rate=15:duration=2", "-an", "-c:v", "mpeg4", "-q:v", "4", clip], { timeoutMs: 30_000 });
    assert.equal(made.code, 0, made.stderr);
    const spy: Spy = { providers: 0, capabilities: 0, requests: [] };
    const timeline = clipTimeline({ durationS: 2 });
    await materializeSources(timeline, dir, { mode: "generate", providers: () => videoSpy(spy, undefined, clip) });
    const seconds = (await materializeSources(timeline, dir, { mode: "status" })).generatedVideos["clip"]?.durationS;
    assert.ok(seconds !== null && seconds !== undefined && Math.abs(seconds - 2) < 0.2, String(seconds));
  });
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
