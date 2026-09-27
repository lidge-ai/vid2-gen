import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { run } from "../../src/shared/exec.ts";
import { requireFfmpeg, tempDir } from "../helpers.ts";

const cli = resolve(import.meta.dirname, "../../src/cli/index.ts");
const fake = resolve(import.meta.dirname, "../fixtures/bin/fake-ima2.mjs");

async function vid2(cwd: string, args: string[], env: NodeJS.ProcessEnv) {
  const r = await run(process.execPath, [cli, ...args, "--json"], { cwd, env: { ...process.env, ...env } });
  return { code: r.code, body: JSON.parse(r.stdout.toString("utf8")) as { ok: boolean; data: Record<string, unknown>; warnings?: string[];
    error?: { code: string; fix?: string } } };
}
const calls = (file: string) => readFileSync(file, "utf8").split("\n").filter((l) => l.startsWith("[\"gen\"") || l.startsWith("[\"video\"")).length;

void test("generated sources: missing → exit 2 with fix; --generate calls ima2 once; later renders reuse the cache", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-assets-e2e-");
  const count = join(dir, "calls.log");
  writeFileSync(count, "");
  const env = { IMA2_BIN: fake, FAKE_IMA2_MODE: "ready", FAKE_IMA2_COUNT: count, VID2_HOME: join(dir, "home") };
  writeFileSync(join(dir, "t.json"), JSON.stringify({ version: 1, output: { width: 160, height: 90, fps: 15 },
    sources: { hero: { type: "generate", provider: "ima2", kind: "image", prompt: "a neon fox", options: { size: "512x512" } } },
    scenes: [{ id: "one", duration: "1s", layers: [{ type: "media", source: "hero", fit: "contain" }] }] }));

  const validated = await vid2(dir, ["validate", "t.json"], env);
  assert.equal(validated.body.ok, true);
  assert.ok((validated.body.warnings ?? []).some((w) => /hero/.test(w)));
  const status = await vid2(dir, ["resolve", "t.json"], env);
  assert.deepEqual((status.body.data["assets"] as { status: string }[]).map((a) => a.status), ["missing"]);

  const missing = await vid2(dir, ["render", "t.json", "-o", "a.mp4"], env);
  assert.equal(missing.code, 2);
  assert.match(missing.body.error?.fix ?? "", /assets resolve|--generate/);
  assert.equal(calls(count), 0);

  const generated = await vid2(dir, ["render", "t.json", "-o", "b.mp4", "--generate"], env);
  assert.equal(generated.body.ok, true, JSON.stringify(generated.body));
  assert.equal(calls(count), 1);
  const again = await vid2(dir, ["render", "t.json", "-o", "c.mp4", "--no-cache"], { ...env, FAKE_IMA2_MODE: "server-down" });
  assert.equal(again.body.ok, true, JSON.stringify(again.body));
  assert.equal(calls(count), 1);
  const cached = await vid2(dir, ["resolve", "t.json"], env);
  assert.deepEqual((cached.body.data["assets"] as { status: string }[]).map((a) => a.status), ["cached"]);
});


void test("--placeholders renders missing files and uncached generated sources without calling ima2", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-placeholders-");
  const count = join(dir, "calls.log");
  writeFileSync(count, "");
  const env = { IMA2_BIN: fake, FAKE_IMA2_MODE: "ready", FAKE_IMA2_COUNT: count, VID2_HOME: join(dir, "home") };
  writeFileSync(join(dir, "t.json"), JSON.stringify({ version: 1, output: { width: 160, height: 90, fps: 15 },
    sources: { hero: { type: "generate", provider: "ima2", kind: "image", prompt: "x" }, shot: { type: "image", path: "missing.png" },
      leak: { type: "video", path: "missing-leak.mp4" }, song: { type: "audio", path: "missing.wav" } },
    scenes: [{ id: "one", duration: "1s", layers: [{ type: "media", source: "hero" }, { type: "media", source: "shot", start: "0.5s" }] }],
    overlays: [{ type: "overlay", source: "leak" }], audio: { music: { source: "song" } } }));
  for (const cmd of [["compile", "t.json"], ["render", "t.json", "-o", "p.mp4"]]) {
    const without = await vid2(dir, cmd, env);
    assert.equal(without.code, 2, cmd.join(" "));
    const withFlag = await vid2(dir, [...cmd, "--placeholders"], env);
    assert.equal(withFlag.body.ok, true, JSON.stringify(withFlag.body));
    assert.deepEqual([...(withFlag.body.warnings ?? [])].filter((w) => w.startsWith("W_PLACEHOLDER")).sort(),
      ["W_PLACEHOLDER hero", "W_PLACEHOLDER leak", "W_PLACEHOLDER shot", "W_PLACEHOLDER song"]);
  }
  assert.equal(calls(count), 0);
});

