import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { locateOptionalTools } from "./tools.ts";

void test("optional tools are found on a supplied PATH or reported absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "vid2-tools-"));
  try {
    assert.deepEqual(locateOptionalTools(dir), { vhs: null, agg: null, asciinema: null });
    for (const name of ["vhs", "agg", "asciinema"]) {
      const path = join(dir, process.platform === "win32" ? `${name}.exe` : name);
      writeFileSync(path, ""); chmodSync(path, 0o755);
    }
    const found = locateOptionalTools(dir);
    for (const name of ["vhs", "agg", "asciinema"] as const) assert.ok(found[name]?.startsWith(dir));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
