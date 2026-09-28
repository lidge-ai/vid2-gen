/** The first test is an explicit opt-in and the only one that may ask the real ima2 server to generate media; the rest use the fake ima2. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createIma2Provider } from "../../src/assets/ima2.ts";
import { probeMedia } from "../../src/probe/index.ts";
import { run } from "../../src/shared/exec.ts";
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

const cli = resolve(import.meta.dirname, "../../src/cli/index.ts");
const fake = resolve(import.meta.dirname, "../fixtures/bin/fake-ima2.mjs");

test("offline: assets resolve guards video options and gates reference images on the ima2 CLI", { timeout: 60_000 }, async t => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-ima2-refs-");
  const count = join(dir, "calls.jsonl");
  const base = { IMA2_BIN: fake, FAKE_IMA2_COUNT: count, VID2_HOME: join(dir, "home") };
  const vid2 = async (mode: string) => {
    const result = await run(process.execPath, [cli, "assets", "resolve", "t.json", "--json"],
      { cwd: dir, env: { ...process.env, ...base, FAKE_IMA2_MODE: mode }, timeoutMs: 50_000 });
    return { code: result.code, body: JSON.parse(result.stdout.toString("utf8")) as { ok: boolean; data: Record<string, unknown>;
      error?: { code: string } } };
  };
  const calls = (): string[][] => existsSync(count)
    ? readFileSync(count, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as string[]) : [];
  const generates = () => calls().filter(args => args[0] === "video" && args[1] !== "--help");
  const timeline = (options: Record<string, unknown>) => writeFileSync(join(dir, "t.json"), JSON.stringify({ version: 1,
    sources: { clip: { type: "generate", provider: "ima2", kind: "video", prompt: "a paper fox turns", options } },
    scenes: [{ id: "one", duration: "1s" }] }));
  mkdirSync(join(dir, "refs"));
  writeFileSync(join(dir, "refs", "fox.png"), "fox reference");

  timeline({ durationS: 20 });
  const invalid = await vid2("ready");
  assert.equal(invalid.code, 2, JSON.stringify(invalid.body));
  assert.equal(invalid.body.error?.code, "E_INPUT");
  assert.deepEqual(calls(), []);

  timeline({ referenceImages: ["refs/fox.png"], durationS: 5 });
  const old = await vid2("no-as-reference");
  assert.equal(old.code, 3, JSON.stringify(old.body));
  assert.equal(old.body.error?.code, "E_CAPABILITY");
  assert.equal(generates().length, 0);

  const made = await vid2("ready");
  assert.equal(made.body.ok, true, JSON.stringify(made.body));
  assert.equal(made.body.data["generated"], 1);
  const [generate] = generates();
  // The child resolves against its realpath cwd (macOS /private/var), so compare real paths.
  assert.deepEqual(generate?.filter((_, i, all) => all[i - 1] === "--ref").map(path => realpathSync(path)),
    [realpathSync(join(dir, "refs", "fox.png"))]);
  assert.ok(generate?.includes("--as-reference"));

  const reused = await vid2("server-down");
  assert.equal(reused.body.ok, true, JSON.stringify(reused.body));
  assert.equal(reused.body.data["reused"], 1);
  assert.equal(generates().length, 1);
});
