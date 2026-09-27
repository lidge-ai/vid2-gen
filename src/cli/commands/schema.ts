import { toJSONSchema } from "zod";
import { TimelineSchema } from "../../timeline/index.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandSpec } from "../registry.ts";

export const schema: CommandSpec = {
  name: "schema",
  summary: "Print the authored timeline JSON Schema",
  usage: "vid2 schema [--json]",
  options: {},
  run({ args }) {
    if (args.length) throw new Vid2Error("E_INPUT", "schema takes no positional arguments");
    const generated = {
      ...toJSONSchema(TimelineSchema, { target: "draft-2020-12", io: "input" }),
      $id: "https://raw.githubusercontent.com/lidge-ai/vid2-gen/main/schema/timeline.v1.json",
    };
    return Promise.resolve({ command: "schema", data: generated });
  },
};
