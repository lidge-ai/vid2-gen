import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { assets } from "../cli/commands/assets.ts";
import { encodePng } from "../compile/png.ts";
import { Vid2Error } from "../shared/index.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";

void test("assets gen and resolve use the file provider cache without ima2 generation", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-assets-cli-"));
  const before = process.env.VID2_HOME; process.env.VID2_HOME = dir;
  try {
    const source = join(dir, "source.png");
    writeFileSync(source, encodePng(2, 2, 4, Uint8Array.from({ length: 16 }, (_, i) => i % 4 === 3 ? 255 : 100)));
    const context = { json: true, cwd: dir, stderr: process.stderr };
    const first = await assets.run({ ...context, args: ["gen", "file", "image", source], values: { out: "copy.png" } });
    assert.equal(first.data["status"], "generated");
    assert.ok(existsSync(join(dir, "copy.png")));
    const second = await assets.run({ ...context, args: ["gen", "file", "image", source], values: {} });
    assert.equal(second.data["status"], "cached");
    const timelinePath = join(dir, "timeline.json");
    writeFileSync(timelinePath, JSON.stringify({ version: 1, sources: { hero: { type: "generate", provider: "file",
      kind: "image", prompt: "source.png", options: {} } }, scenes: [{ id: "one", duration: "1s" }] }));
    const resolved = await assets.run({ ...context, args: ["resolve", timelinePath], values: {} });
    assert.equal(resolved.data["reused"], 1);
    assert.equal(resolved.data["generated"], 0);
    assert.deepEqual(resolved.data["failed"], []);
    const partial = join(dir, "partial.json");
    writeFileSync(partial, JSON.stringify({ version: 1, sources: {
      hero: { type: "generate", provider: "file", kind: "image", prompt: "source.png", options: {} },
      broken: { type: "generate", provider: "unknown", kind: "image", prompt: "missing", options: {} },
    }, scenes: [{ id: "one", duration: "1s" }] }));
    await assert.rejects(assets.run({ ...context, args: ["resolve", partial], values: {} }),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "E_INPUT" &&
        "details" in error && (error.details as { reused: number; failed: unknown[] }).reused === 1 &&
        (error.details as { failed: unknown[] }).failed.length === 1);
  } finally {
    if (before === undefined) delete process.env.VID2_HOME; else process.env.VID2_HOME = before;
    rmSync(dir, { recursive: true, force: true });
  }
});

const fakeIma2 = fileURLToPath(new URL("../../tests/fixtures/bin/fake-ima2.mjs", import.meta.url));
const flagError = (path: string) => (error: unknown): boolean =>
  error instanceof Vid2Error && error.code === "E_INPUT" && error.details?.["path"] === path;

void test("assets gen maps repeated --ref to ordered ima2 --ref flags and guards flags before any call", { timeout: 60_000 }, async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-assets-cli-refs-"));
  const count = join(dir, "calls.jsonl");
  const keys = ["VID2_HOME", "IMA2_BIN", "FAKE_IMA2_MODE", "FAKE_IMA2_COUNT"] as const;
  const saved = keys.map((key) => process.env[key]);
  Object.assign(process.env, { VID2_HOME: dir, IMA2_BIN: fakeIma2, FAKE_IMA2_MODE: "ready", FAKE_IMA2_COUNT: count });
  const calls = (): string[][] => existsSync(count)
    ? readFileSync(count, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as string[]) : [];
  try {
    mkdirSync(join(dir, "refs"));
    writeFileSync(join(dir, "a.png"), "A"); writeFileSync(join(dir, "refs", "b.png"), "B");
    const context = { json: true, cwd: dir, stderr: process.stderr };
    const gen = (kind: string, values: Record<string, unknown>) => assets.run({ ...context, args: ["gen", "ima2", kind, "a fox"], values });
    await assert.rejects(gen("video", { duration: "20" }), flagError("--duration"));
    await assert.rejects(gen("video", { ref: ["a.png"], resolution: "1080p" }), flagError("--resolution"));
    await assert.rejects(gen("video", { ref: Array.from({ length: 8 }, () => "a.png") }), flagError("--ref"));
    await assert.rejects(gen("image", { ref: ["a.png"] }), flagError("--ref"));
    await assert.rejects(gen("video", { ref: ["a.png", "missing.png"] }), flagError("--ref.1"));
    assert.deepEqual(calls(), [], "guard and file checks run before ima2 is started");
    const made = await gen("video", { ref: ["a.png", "refs/b.png"], out: "fox.mp4" });
    assert.equal(made.data["status"], "generated");
    assert.ok(existsSync(join(dir, "fox.mp4")));
    const generated = calls().filter((args) => args[0] === "video" && args[1] !== "--help");
    assert.equal(generated.length, 1);
    assert.deepEqual(generated[0]?.filter((_, i, all) => all[i - 1] === "--ref"), [join(dir, "a.png"), join(dir, "refs", "b.png")]);
    const again = await gen("video", { ref: ["a.png", "refs/b.png"] });
    assert.equal(again.data["status"], "cached");
    assert.equal(again.data["requestHash"], made.data["requestHash"]);
    const swapped = await assets.run({ ...context, args: ["gen", "ima2", "video", "a fox"], values: { ref: ["refs/b.png", "a.png"] } });
    assert.notEqual(swapped.data["requestHash"], made.data["requestHash"]);
  } finally {
    keys.forEach((key, i) => { const value = saved[i]; if (value === undefined) delete process.env[key]; else process.env[key] = value; });
    rmSync(dir, { recursive: true, force: true });
  }
});
