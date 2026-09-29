import { toJSONSchema } from "zod";
import { TimelineSchema } from "../../timeline/index.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandSpec } from "../registry.ts";
import { stepsJsonSchema } from "../../capture/index.ts";

export const schema: CommandSpec = {
  name: "schema", group: "author",
  examples: ["vid2 schema --json > timeline.schema.json","vid2 schema --steps --json"],
  summary: "Print the authored timeline JSON Schema",
  usage: "vid2 schema [--steps] [--json]",
  options: { steps: { type: "boolean", description: "Print the capture steps JSON Schema instead of the timeline schema" } },
  run({ args, values }) {
    if (args.length) throw new Vid2Error("E_INPUT", "schema takes no positional arguments");
    if (values["steps"] === true) return Promise.resolve({ command: "schema", data: stepsJsonSchema() });
    const generated = {
      ...toJSONSchema(TimelineSchema, { target: "draft-2020-12", io: "input" }),
      $id: "https://raw.githubusercontent.com/lidge-ai/vid2-gen/main/schema/timeline.v1.json",
    };
    return Promise.resolve({ command: "schema", data: generated });
  },
};
