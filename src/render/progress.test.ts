import assert from "node:assert/strict";
import { test } from "node:test";
import { ProgressParser } from "./progress.ts";

test("progress parser emits frame, time and speed at report boundaries", () => {
  const events: unknown[] = [];
  const parser = new ProgressParser((event) => events.push(event));
  for (const line of ["frame=12", "out_time_ms=800000", "speed=1.3x", "progress=continue", "noise",
    "frame=20", "progress=end"]) parser.line(line);
  assert.deepEqual(events, [
    { frame: 12, outTimeMs: 800000, speed: "1.3x" },
    { frame: 20, outTimeMs: 800000, speed: "1.3x" },
  ]);
});
