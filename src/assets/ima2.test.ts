import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashFile, run, Vid2Error } from "../shared/index.ts";
import type { Runner } from "../shared/index.ts";
import { requireFfmpeg, tempDir } from "../../tests/helpers.ts";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "./provider.ts";
import { createIma2Provider } from "./ima2.ts";
import { checkIma2VideoOptions } from "./video-options.ts";

const fake = fileURLToPath(new URL("../../tests/fixtures/bin/fake-ima2.mjs", import.meta.url));
function fixture(mode = "ready", onRun?: (args: string[], timeoutMs: number | undefined) => void) {
  const dir = tempDir("vid2-ima2-test-");
  const count = join(dir, "calls.jsonl");
  const env = { ...process.env, FAKE_IMA2_MODE: mode, FAKE_IMA2_COUNT: count };
  const runner: Runner = (_cmd, args, opts) => {
    onRun?.(args, opts?.timeoutMs);
    return run(process.execPath, [fake, ...args], opts);
  };
  const provider = createIma2Provider({ runner, env, bin: [process.execPath] });
  const calls = (): string[][] => {
    try { return readFileSync(count, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as string[]); }
    catch { return []; }
  };
  return { dir, provider, calls };
}

function imageRequest(provider: ReturnType<typeof createIma2Provider>) {
  return { kind: "image" as const, prompt: "A small red square", options: provider.normalize("image", {}) };
}

function matchError(error: unknown, code: string, retryable: boolean, requestId?: string): boolean {
  return error instanceof Vid2Error && error.code === code && error.retryable === retryable &&
    (requestId === undefined || error.details?.["requestId"] === requestId);
}

test("normalization is stable and uses fixed offline defaults", () => {
  const { provider } = fixture();
  assert.deepEqual(provider.normalize("image", {}), provider.normalize("image", {
    size: "1024x1024", quality: "high", background: "opaque", model: DEFAULT_IMAGE_MODEL }));
  assert.deepEqual(provider.normalize("video", {}), provider.normalize("video", {
    durationS: 5, resolution: "720p", aspectRatio: "16:9", model: DEFAULT_VIDEO_MODEL }));
  assert.throws(() => provider.normalize("video", { resolution: "2160p" }), (error: unknown) => matchError(error, "E_INPUT", false));
});

test("reachable server reports per-kind readiness, not just executable models", async () => {
  const ready = await fixture().provider.capabilities();
  assert.equal(ready.available, true);
  assert.equal(ready.kinds.image?.available, true);
  assert.equal(ready.kinds.video?.available, true);
  const gap = await fixture("grok-disconnected").provider.capabilities();
  assert.equal(gap.available, true);
  assert.equal(gap.kinds.image?.available, true);
  assert.equal(gap.kinds.video?.available, false);
  assert.match(gap.kinds.video?.reason ?? "", /Grok login required/);
  const down = await fixture("server-down").provider.capabilities();
  assert.equal(down.available, false);
  const absent = createIma2Provider({ bin: ["missing-ima2-cli-for-test"] });
  assert.equal((await absent.capabilities()).available, false);
  await assert.rejects(absent.generate(imageRequest(absent), join(tempDir(), "image.png")),
    (error: unknown) => matchError(error, "E_CAPABILITY", false));
});

test("image generation records probed size, sha, request id and actual default model", async () => {
  const { dir, provider, calls } = fixture();
  const path = join(dir, "generated.png");
  const asset = await provider.generate(imageRequest(provider), path);
  assert.equal(asset.path, path);
  assert.equal(asset.kind, "image");
  assert.deepEqual([asset.width, asset.height], [16, 16]);
  assert.equal(asset.sha256, await hashFile(path));
  assert.equal(asset.provenance.requestId, "req-fake-image");
  assert.equal(asset.provenance.model, "gpt-6-luna");
  const gen = calls().find(args => args[0] === "gen");
  assert.ok(gen);
  assert.ok(!gen.includes("--model"), "default sentinel must let ima2 choose its current model");
  assert.ok(gen.includes("--json"));
});

test("image background and explicit model become CLI flags", async () => {
  const { dir, provider, calls } = fixture();
  const options = provider.normalize("image", { background: "transparent", model: "oauth/gpt-6-sol" });
  await provider.generate({ kind: "image", prompt: "A transparent icon", options }, join(dir, "icon.png"));
  const args = calls().find(call => call[0] === "gen");
  assert.ok(args?.includes("--bg") && args.includes("transparent"));
  assert.ok(args?.includes("--model") && args.includes("oauth/gpt-6-sol"));
});

test("video generation uses reference image and records actual duration and revised prompt", async t => {
  if (!requireFfmpeg(t)) return;
  let videoTimeout: number | undefined;
  const { dir, provider, calls } = fixture("ready", (args, timeoutMs) => {
    if (args[0] === "video" && args[1] !== "analyze") videoTimeout = timeoutMs;
  });
  const seed = join(dir, "seed.png");
  writeFileSync(seed, "seed-bytes");
  const path = join(dir, "generated.mp4");
  const options = provider.normalize("video", { seedImage: seed, resolution: "480p", timeoutS: 7 });
  const asset = await provider.generate({ kind: "video", prompt: "Blue motion", options }, path);
  assert.equal(asset.kind, "video");
  assert.deepEqual([asset.width, asset.height], [32, 18]);
  assert.ok(asset.durationS !== undefined && Math.abs(asset.durationS - 1) < 0.1);
  assert.equal(asset.provenance.revisedPrompt, "A blue scene.");
  assert.equal(asset.sha256, await hashFile(path));
  assert.equal(videoTimeout, 7000);
  const args = calls().find(call => call[0] === "video");
  assert.ok(args?.includes("--ref") && args.includes(seed));
  assert.ok(args?.includes("--resolution") && args.includes("480p"));
  assert.deepEqual(await provider.analyze!(path), { text: "The first frame is blue and the last is green.", method: "first-last-frame" });
});

test("fallback exit codes map to the public error taxonomy", async () => {
  for (const [mode, expected, retryable] of [
    ["server-down", "E_PROVIDER", true], ["auth", "E_ACCESS", false], ["validation", "E_INPUT", false],
    ["network", "E_PROVIDER", true], ["timeout", "E_TIMEOUT", true],
  ] as const) {
    const { dir, provider } = fixture(mode);
    await assert.rejects(provider.generate(imageRequest(provider), join(dir, "image.png")),
      (error: unknown) => matchError(error, expected, retryable), mode);
  }
});

test("typed JSON failures override exit 1 and preserve requestId", async () => {
  for (const [mode, expected, retryable, requestId] of [
    ["exit1-auth-json", "E_ACCESS", false, "req-auth-1"],
    ["exit1-timeout-json", "E_TIMEOUT", true, "req-timeout-1"],
  ] as const) {
    const { dir, provider } = fixture(mode);
    await assert.rejects(provider.generate(imageRequest(provider), join(dir, "image.png")),
      (error: unknown) => matchError(error, expected, retryable, requestId), mode);
  }
});

test("an already cancelled request never starts the ima2 process", async () => {
  const { dir, provider, calls } = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(provider.generate(imageRequest(provider), join(dir, "image.png"), controller.signal),
    (error: unknown) => matchError(error, "E_INTERRUPTED", false));
  assert.equal(calls().length, 0);
});

test("catalog reordering does not change the adapter's default request", async () => {
  const normal = fixture();
  const reordered = fixture("reorder");
  assert.deepEqual(normal.provider.normalize("image", {}), reordered.provider.normalize("image", {}));
  assert.equal((await reordered.provider.capabilities()).kinds.image?.available, false);
});

test("explicit server URL is forwarded to every discovery command", async () => {
  const dir = tempDir("vid2-ima2-server-");
  const count = join(dir, "calls.jsonl");
  const env = { ...process.env, FAKE_IMA2_MODE: "ready", FAKE_IMA2_COUNT: count, IMA2_SERVER: "http://127.0.0.1:3333" };
  const runner: Runner = (_cmd, args, opts) => run(process.execPath, [fake, ...args], opts);
  const provider = createIma2Provider({ runner, env, bin: [process.execPath] });
  assert.equal((await provider.capabilities()).available, true);
  const calls = readFileSync(count, "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]);
  for (const args of calls) assert.ok(args.includes("--server") && args.includes(env.IMA2_SERVER));
});

const generateCalls = (calls: string[][]): string[][] =>
  calls.filter(args => args[0] === "video" && args[1] !== "--help" && args[1] !== "analyze");
const helpCalls = (calls: string[][]): string[][] => calls.filter(args => args[0] === "video" && args[1] === "--help");

test("video guard enforces the ima2 3.23.1 limits with timeline and flag paths", () => {
  const root = tempDir("vid2-ima2-guard-");
  const refs = (n: number) => Array.from({ length: n }, (_, i) => join(root, `ref${i}.png`));
  const rejects = (raw: Record<string, unknown>, prefix: string, path: string) => assert.throws(() => checkIma2VideoOptions(raw, prefix),
    (error: unknown) => error instanceof Vid2Error && error.code === "E_INPUT" && error.details?.["path"] === path, path);
  rejects({ durationS: 20 }, "sources.clip.options", "sources.clip.options.durationS");
  rejects({ durationS: 0 }, "--flag", "--duration");
  rejects({ referenceImages: refs(8) }, "--flag", "--ref");
  rejects({ referenceImages: refs(4), model: "oauth/other-video" }, "--flag", "--ref");
  rejects({ referenceImages: refs(1), resolution: "1080p" }, "--flag", "--resolution");
  rejects({ referenceImages: refs(1), seedImage: refs(1)[0] }, "--flag", "--ref");
  rejects({ referenceImages: ["relative.png"] }, "--flag", "--ref");
  rejects({ referenceImages: [] }, "--flag", "--ref");
  rejects({ seedImage: "relative.png" }, "--flag", "--seed-image");
  rejects({ aspectRatio: "21:9" }, "--flag", "--aspect-ratio");
  rejects({ extra: 1 }, "sources.clip.options", "sources.clip.options.extra");
  assert.equal(checkIma2VideoOptions({ referenceImages: refs(7), resolution: "720p" }, "--flag").referenceImages?.length, 7);
  assert.equal(checkIma2VideoOptions({ seedImage: refs(1)[0], resolution: "1080p" }, "--flag").resolution, "1080p");
  assert.deepEqual(checkIma2VideoOptions({}, "--flag"), { durationS: 5, resolution: "720p", aspectRatio: "16:9", model: DEFAULT_VIDEO_MODEL });
});

test("reference images become ordered --ref flags; --as-reference only for exactly one", async t => {
  if (!requireFfmpeg(t)) return;
  const { dir, provider, calls } = fixture();
  const [a, b] = [join(dir, "a.png"), join(dir, "b.png")];
  writeFileSync(a, "A"); writeFileSync(b, "B");
  await provider.generate({ kind: "video", prompt: "Two refs", options: provider.normalize("video", { referenceImages: [a, b] }),
    referenceImagesSha: ["sha-a", "sha-b"] }, join(dir, "two.mp4"));
  const asset = await provider.generate({ kind: "video", prompt: "One ref", options: provider.normalize("video", { referenceImages: [b] }) },
    join(dir, "one.mp4"));
  const [two, one] = generateCalls(calls());
  assert.deepEqual(two?.filter((_, i, all) => all[i - 1] === "--ref"), [a, b]);
  assert.ok(two && !two.includes("--as-reference"));
  assert.deepEqual(one?.filter((_, i, all) => all[i - 1] === "--ref"), [b]);
  assert.ok(one?.includes("--as-reference"));
  assert.equal(helpCalls(calls()).length, 1, "the capability probe is memoized per provider");
  assert.ok(!helpCalls(calls())[0]?.includes("--json"));
  assert.equal(asset.kind, "video");
});

test("an ima2 CLI without --as-reference fails reference requests before any generate call", async () => {
  const { dir, provider, calls } = fixture("no-as-reference");
  const ref = join(dir, "ref.png");
  writeFileSync(ref, "ref");
  for (const count of [1, 2]) {
    const options = provider.normalize("video", { referenceImages: Array.from({ length: count }, () => ref) });
    await assert.rejects(provider.generate({ kind: "video", prompt: "Needs refs", options }, join(dir, "out.mp4")),
      (error: unknown) => matchError(error, "E_CAPABILITY", false));
  }
  assert.equal(generateCalls(calls()).length, 0);
  assert.equal(helpCalls(calls()).length, 1);
});

test("video requests without references never probe the CLI help", async t => {
  if (!requireFfmpeg(t)) return;
  const { dir, provider, calls } = fixture("no-as-reference");
  await provider.generate({ kind: "video", prompt: "Plain", options: provider.normalize("video", {}) }, join(dir, "plain.mp4"));
  assert.equal(helpCalls(calls()).length, 0);
  assert.equal(generateCalls(calls()).length, 1);
});
