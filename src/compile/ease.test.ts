import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { easeExpr } from "./ease.ts";

function evaluate(expr: string, t: number): number {
  const js = expr.replaceAll("exp(", "Math.exp(");
  return runInNewContext(js, { t, Math }) as number;
}

void test("ease expressions hit endpoints and expected midpoints", () => {
  for (const name of ["linear", "in", "out", "inout", "punch"] as const) {
    const expr = easeExpr(name, "t");
    assert.ok(Math.abs(evaluate(expr, 0)) < 1e-9);
    const end = evaluate(expr, 1);
    assert.ok(end > 0.99 && end <= 1, `${name}: ${end}`);
  }
  assert.equal(evaluate(easeExpr("in", "t"), 0.5), 0.25);
  assert.equal(evaluate(easeExpr("out", "t"), 0.5), 0.75);
  assert.equal(evaluate(easeExpr("inout", "t"), 0.5), 0.5);
});
