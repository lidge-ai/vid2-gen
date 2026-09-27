import assert from "node:assert/strict";
import { test } from "node:test";
import { StepsSchema, stepsJsonSchema } from "./steps.ts";

test("steps are strict and published as authored input", () => {
  const steps = [{ goto: "/" }, { click: "#buy", label: "buy" }, { type: "#secret", text: "private" },
    { wait: { selector: "#buy" } }, { mark: "done" }];
  assert.equal(StepsSchema.parse(steps).length, 5);
  assert.equal(StepsSchema.safeParse([{ click: "#buy", typo: true }]).success, false);
  assert.equal(StepsSchema.safeParse([{ waitFor: {} }]).success, false);
  const schema = stepsJsonSchema();
  assert.equal(schema["type"], "array");
  const items = schema["items"] as { anyOf: { additionalProperties: boolean }[] };
  assert.equal(items.anyOf.length, 10);
  assert.ok(items.anyOf.every((variant) => variant.additionalProperties === false));
});
