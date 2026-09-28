import test from "node:test";
import { requireFfmpeg } from "../helpers.ts";
import { checkTemplate } from "./template-check.ts";

// Its own file so the stage-heavy template gets its own per-file time budget on slow CI runners.
void test("kinetic-launch template validates, proxy-renders and produces QA evidence", async (t) => {
  if (!requireFfmpeg(t)) return;
  await checkTemplate("kinetic-launch");
});
