import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { appendMark, loadHook, startInputHook, tailMarks } from "./input-hook.ts";
import type { HookAction, InputHook } from "./input-hook.ts";

void test("missing optional hook still permits external file marks", async () => {
  assert.equal(await loadHook(async () => { throw new Error("module absent"); }), null);
  const dir = mkdtempSync(join(tmpdir(), "vid2-mark-test-"));
  const actions: HookAction[] = [];
  try {
    const hook = await startInputHook({ nowMs: () => 0, scale: 1, origin: { x: 0, y: 0 },
      onAction: (action) => actions.push(action), loader: async () => null });
    assert.ok(hook.warnings.length);
    const marks = tailMarks(dir, { epochMs: Date.now() - 100, monoNs: "0" }, (action) => actions.push(action));
    await appendMark(dir, "launch");
    await marks.stop();
    hook.stop();
    assert.equal(actions.length, 1);
    assert.equal(actions[0]?.kind, "mark");
    assert.equal(actions[0]?.label, "launch");
    assert.equal(actions[0]?.source, "agent");
    assert.equal(actions[0]?.text, undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

void test("hook logs mouse points and key codes only, decimating mouse moves", async () => {
  const listeners = new Map<string, (event: { x?: number; y?: number; keycode?: number }) => void>();
  const hook: InputHook = { on: (name, callback) => listeners.set(name, callback), start() {}, stop() {} };
  let time = 0;
  const actions: HookAction[] = [];
  const started = await startInputHook({ nowMs: () => time, scale: 2, origin: { x: 10, y: 20 },
    onAction: (action) => actions.push(action), loader: async () => hook });
  listeners.get("mousemove")?.({ x: 12, y: 23 });
  time = 5; listeners.get("mousemove")?.({ x: 13, y: 24 });
  time = 20; listeners.get("mousemove")?.({ x: 13, y: 24 });
  listeners.get("keydown")?.({ keycode: 42 });
  started.stop();
  assert.equal(actions.filter((action) => action.label === "mousemove").length, 2);
  assert.deepEqual(actions[0]?.point, { x: 4, y: 6 });
  assert.equal(actions.at(-1)?.key, "42");
  assert.ok(actions.every((action) => action.text === undefined));
});
