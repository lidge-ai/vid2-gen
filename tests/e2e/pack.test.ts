import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repo = fileURLToPath(new URL("../..", import.meta.url));

function command(bin: string, args: string[], cwd: string) {
  const result = spawnSync(bin, args, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `${bin} ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout;
}

test("packed install runs outside the checkout", { skip: process.env["VID2_PACK_TEST"] !== "1" }, () => {
  const root = mkdtempSync(join(tmpdir(), "vid2-pack-"));
  const packed = JSON.parse(command("npm", ["pack", "--json", "--pack-destination", root], repo)) as { filename: string }[];
  const tarball = join(root, packed[0]!.filename);
  command("npm", ["install", "--prefix", root, "--ignore-scripts", tarball], root);
  // W4-05: the optional native input hook is never a package dependency.
  const installed = JSON.parse(readFileSync(join(root, "node_modules", "vid2-gen", "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) assert.equal(installed[field]?.["uiohook-napi"], undefined);
  const executable = join(root, "node_modules", ".bin", "vid2");
  const launcher = process.platform === "win32" ? process.execPath : executable;
  const args = process.platform === "win32"
    ? [join(root, "node_modules", "vid2-gen", "bin", "vid2.js"), "version", "--json"]
    : ["version", "--json"];
  const data = JSON.parse(command(launcher, args, root)) as { ok: boolean; data: Record<string, unknown> };
  assert.equal(data.ok, true);
  assert.equal(data.data["version"], "0.1.0");

  // wp3 package contract: the installed CLI renders a 1 s timeline with bundled fonts, verified by ffprobe.
  const timeline = join(root, "smoke.json");
  writeFileSync(timeline, JSON.stringify({ version: 1, output: { width: 160, height: 90, fps: 15 },
    scenes: [{ id: "smoke", duration: "1s", layers: [{ type: "text", text: "vid2", size: 24 }] }] }));
  const out = join(root, "smoke.mp4");
  const renderArgs = ["render", timeline, "-o", out, "--profile", "final", "--json"];
  const rendered = JSON.parse(command(launcher, process.platform === "win32" ? [args[0]!, ...renderArgs] : renderArgs, root)) as { ok: boolean };
  assert.equal(rendered.ok, true);
  const frames = command("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames",
    "-of", "csv=p=0", out], root).trim();
  assert.equal(frames, "15");
});
