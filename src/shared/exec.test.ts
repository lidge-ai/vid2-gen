import assert from "node:assert/strict";
import { test } from "node:test";
import { ffmpegDefaultTimeout, runChecked } from "./exec.ts";
import type { RunResult, Runner } from "./exec.ts";

const ok: RunResult = { code: 0, signal: null, stdout: Buffer.alloc(0), stderr: "", ms: 1 };
const killed: RunResult = { code: null, signal: "SIGKILL", stdout: Buffer.alloc(0), stderr: "", ms: 60000, timedOut: true };

function scripted(results: RunResult[]): Runner & { calls: number } {
  const runner = Object.assign(async () => { runner.calls += 1; return results.shift() ?? ok; }, { calls: 0 });
  return runner;
}

test("ffmpeg default timeout applies only to ffmpeg and only when configured", () => {
  assert.equal(ffmpegDefaultTimeout("/opt/homebrew/bin/ffmpeg", { VID2_FFMPEG_TIMEOUT_MS: "60000" }), 60000);
  assert.equal(ffmpegDefaultTimeout("C:\\tools\\FFMPEG.EXE", { VID2_FFMPEG_TIMEOUT_MS: "5" }), 5);
  assert.equal(ffmpegDefaultTimeout("ffprobe", { VID2_FFMPEG_TIMEOUT_MS: "60000" }), undefined);
  assert.equal(ffmpegDefaultTimeout("ffmpeg", {}), undefined);
  assert.equal(ffmpegDefaultTimeout("ffmpeg", { VID2_FFMPEG_TIMEOUT_MS: "later" }), undefined);
});

test("an ffmpeg killed by the default timeout retries once, then reports the timeout", async () => {
  const previous = process.env["VID2_FFMPEG_TIMEOUT_MS"];
  process.env["VID2_FFMPEG_TIMEOUT_MS"] = "60000";
  try {
    const recovered = scripted([killed, ok]);
    assert.equal((await runChecked("ffmpeg", ["-version"], {}, recovered)).code, 0);
    assert.equal(recovered.calls, 2);
    const stuck = scripted([killed, killed]);
    await assert.rejects(runChecked("ffmpeg", ["-version"], {}, stuck),
      (error: { details?: Record<string, unknown> }) => error.details?.["timedOut"] === true);
    assert.equal(stuck.calls, 2);
    const explicit = scripted([killed]);
    await assert.rejects(runChecked("ffmpeg", ["-version"], { timeoutMs: 10 }, explicit));
    assert.equal(explicit.calls, 1);
  } finally {
    if (previous === undefined) delete process.env["VID2_FFMPEG_TIMEOUT_MS"]; else process.env["VID2_FFMPEG_TIMEOUT_MS"] = previous;
  }
});
