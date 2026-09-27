import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const bin = fileURLToPath(new URL("../../bin/vid2.js", import.meta.url));

function layout(which: "dist" | "source" | "missing"): string {
  const root = mkdtempSync(join(tmpdir(), "vid2-bin-"));
  mkdirSync(join(root, "bin"));
  copyFileSync(bin, join(root, "bin/vid2.js"));
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  if (which !== "missing") {
    const target = which === "dist" ? "dist/cli/index.js" : "src/cli/index.ts";
    mkdirSync(dirname(join(root, target)), { recursive: true });
    writeFileSync(join(root, target), `console.log("${which}");`);
  }
  return join(root, "bin/vid2.js");
}

test("bin loads build output when present", () => {
  const result = spawnSync(process.execPath, [layout("dist")], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "dist");
});

test("bin loads TypeScript source in a checkout without build output", () => {
  const result = spawnSync(process.execPath, [layout("source")], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "source");
});

test("bin explains a broken package", () => {
  const result = spawnSync(process.execPath, [layout("missing")], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /build output missing \(run npm run build\)/);
});
