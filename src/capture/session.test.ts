import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tempDir } from "../../tests/helpers.ts";
import { cdpFrameMs, createClock, findAction, mapEventFrame, readSession, writeSession } from "./session.ts";
import type { SessionMeta } from "./session.ts";

test("an action and a CDP frame taken at the same instant land in the same CFR slot", () => {
  const clock = createClock();
  const actionMs = clock.nowMs();
  const frameMs = cdpFrameMs((clock.t0.epochMs + actionMs) / 1000, clock.t0, 99999);
  const fps = { num: 30, den: 1 };
  assert.ok(Math.abs(frameMs - actionMs) < 2);
  assert.equal(mapEventFrame(frameMs, fps), mapEventFrame(actionMs, fps));
});

test("a CDP frame without a timestamp uses its receive time", () => {
  const t0 = { epochMs: 1000, monoNs: "0" };
  assert.equal(cdpFrameMs(undefined, t0, 250), 250);
  assert.equal(cdpFrameMs(0, t0, 40), 40);
  assert.equal(cdpFrameMs(2.5, t0, 0), 1500);
});

test("sessions round-trip and actions are found by label, id and kind#k", async () => {
  const dir = join(tempDir(), "demo.vid2cap");
  const meta: SessionMeta = { version: 1, surface: "web", fps: "30", width: 200, height: 100, scale: 2, t0: { epochMs: 1, monoNs: "2" },
    footage: "footage.mp4", frames: "frames.jsonl", actions: "actions.jsonl", cursorHidden: true, recordedText: false,
    tool: { vid2: "0.1.0", ffmpeg: "8.0" }, platform: "darwin", createdAt: "2026-09-28T00:00:00Z", warnings: [] };
  await writeSession(dir, meta, [{ id: "k1", seq: 1, kind: "click", tMs: 900, frame: 27, source: "agent", label: "buy" },
    { id: "g0", seq: 0, kind: "goto", tMs: 0, frame: 0, source: "agent" }]);
  const s = await readSession(dir);
  assert.deepEqual(s.actions.map((a) => a.id), ["g0", "k1"]);
  assert.equal(findAction(s.actions, "click#1")?.id, "k1");
  assert.equal(findAction(s.actions, "buy")?.frame, 27);
  assert.equal(findAction(s.actions, "g0")?.kind, "goto");
  assert.equal(s.footagePath, join(dir, "footage.mp4"));
  await assert.rejects(readSession(join(dir, "missing")), /not a capture session/);
});
