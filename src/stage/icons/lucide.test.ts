import assert from "node:assert/strict";
import { test } from "node:test";
import { ICONS } from "./lucide.ts";
import { pathPolylines } from "./path.ts";

void test("every built-in icon is well-formed path data that flattens inside the 24x24 view box", () => {
  assert.ok(Object.keys(ICONS).length >= 50);
  for (const [name, paths] of Object.entries(ICONS)) {
    assert.ok(paths.length > 0, name);
    for (const d of paths) {
      assert.ok(!/undefined|NaN/.test(d), `${name}: ${d}`);
      const lines = pathPolylines(d);
      assert.ok(lines.length > 0, `${name} flattens: ${d}`);
      for (const line of lines) for (const p of line.points) assert.ok(p.x >= -1 && p.x <= 25 && p.y >= -1 && p.y <= 25, `${name} point ${p.x},${p.y}`);
    }
  }
});
