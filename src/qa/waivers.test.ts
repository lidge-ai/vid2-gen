import assert from "node:assert/strict";
import { test } from "node:test";
import { Vid2Error } from "../shared/index.ts";
import { applyWaivers, parseWaivers } from "./waivers.ts";
import type { QaIssue } from "./report.ts";

test("CLI waiver applies by overlapping range and keeps issue evidence", () => {
  const issue: QaIssue = { id: "black-1", check: "black", severity: "fail", status: "open", code: "BLACK",
    message: "black frame", range: [1, 1.8], fix: "review" };
  const waived = applyWaivers([issue], parseWaivers("black@0.9-1.9"));
  assert.equal(waived[0]?.status, "waived");
  assert.equal(waived[0]?.waiver?.source, "cli");
  assert.deepEqual(waived[0]?.range, issue.range);
  assert.equal(applyWaivers([issue], parseWaivers("black@2-3"))[0]?.status, "open");
  assert.equal(applyWaivers([issue], parseWaivers("black@1-1.2"))[0]?.status, "open");
  assert.throws(() => parseWaivers("black@3-2"), (error: unknown) => error instanceof Vid2Error && error.code === "E_INPUT");
});
