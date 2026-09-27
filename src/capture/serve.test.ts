import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { serveDir } from "./serve.ts";

test("static fixture serves files and rejects traversal", async () => {
  const root = fileURLToPath(new URL("../../tests/fixtures/capture/site/", import.meta.url));
  const hosted = await serveDir(root);
  try {
    const page = await fetch(hosted.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /#ff3366/);
    assert.equal((await fetch(new URL("second.html", hosted.url))).status, 200);
    assert.notEqual((await fetch(new URL("%2e%2e%2fpackage.json", hosted.url))).status, 200);
  } finally { await hosted.close(); }
});
