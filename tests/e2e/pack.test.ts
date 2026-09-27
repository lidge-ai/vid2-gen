import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
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
  const executable = join(root, "node_modules", ".bin", "vid2");
  const launcher = process.platform === "win32" ? process.execPath : executable;
  const args = process.platform === "win32"
    ? [join(root, "node_modules", "vid2-gen", "bin", "vid2.js"), "version", "--json"]
    : ["version", "--json"];
  const data = JSON.parse(command(launcher, args, root)) as { ok: boolean; data: Record<string, unknown> };
  assert.equal(data.ok, true);
  assert.equal(data.data["version"], "0.1.0");
});
