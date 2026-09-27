import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TimelineSchema } from "../src/timeline/schema.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(root, "schema/timeline.v1.json");
const schema = z.toJSONSchema(TimelineSchema, { target: "draft-2020-12", io: "input" });
schema.$id = "https://raw.githubusercontent.com/lidge-ai/vid2-gen/main/schema/timeline.v1.json";
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify(schema, null, 2)}\n`);
