import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TimelineSchema } from "./schema.ts";

test("committed authored-input JSON Schema matches Zod source", () => {
  const generated = z.toJSONSchema(TimelineSchema, { target: "draft-2020-12", io: "input" });
  generated.$id = "https://raw.githubusercontent.com/lidge-ai/vid2-gen/main/schema/timeline.v1.json";
  const file = fileURLToPath(new URL("../../schema/timeline.v1.json", import.meta.url));
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), generated);
  assert.equal(readFileSync(file, "utf8"), `${JSON.stringify(generated, null, 2)}\n`);
});
