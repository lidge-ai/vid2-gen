import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assets } from "../cli/commands/assets.ts";
import { encodePng } from "../compile/png.ts";
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
