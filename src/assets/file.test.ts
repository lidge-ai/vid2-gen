import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { encodePng } from "../compile/png.ts";
import { locateTools, probeMedia } from "../probe/index.ts";
import { runChecked } from "../shared/index.ts";
import { materializeRequest, requestHash } from "./manifest.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { createFileProvider } from "./file.ts";

void test("file provider copies and probes a real image", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-file-provider-"));
  const before = process.env.VID2_HOME; process.env.VID2_HOME = dir;
  try {
    const source = join(dir, "source.png"); const output = join(dir, "cached.png");
    writeFileSync(source, encodePng(2, 2, 4, Uint8Array.from({ length: 16 }, (_, i) => i % 4 === 3 ? 255 : 100)));
    const provider = createFileProvider();
    const image = await provider.generate({ kind: "image", prompt: source, options: provider.normalize("image", {}) }, output);
    assert.equal(image.kind, "image");
    assert.equal(image.width, 2); assert.equal(image.height, 2);
    assert.equal(image.path, output); assert.ok(existsSync(output));
    await assert.rejects(provider.generate({ kind: "video", prompt: source, options: provider.normalize("video", {}) }, join(dir, "bad.mp4")),
      { code: "E_INPUT" });
    const jpeg = join(dir, "source.jpg");
    await runChecked(locateTools().ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=16x16",
      "-frames:v", "1", "-y", jpeg]);
    const req = { kind: "image" as const, prompt: jpeg, options: provider.normalize("image", {}) };
    const hash = requestHash({ provider: "file", kind: "image", prompt: jpeg, options: req.options as unknown as Record<string, unknown> });
    const cached = await materializeRequest(provider, req, hash);
    assert.match(cached.asset.path, /\.jpg$/);
    assert.equal((await probeMedia(cached.asset.path)).kind, "image");
  } finally {
    if (before === undefined) delete process.env.VID2_HOME; else process.env.VID2_HOME = before;
    rmSync(dir, { recursive: true, force: true });
  }
});
