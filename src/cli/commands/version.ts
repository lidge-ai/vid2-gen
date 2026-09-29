import { packageVersion } from "../../shared/paths.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandSpec } from "../registry.ts";

export const version: CommandSpec = {
  name: "version", group: "agent",
  examples: ["vid2 version","vid2 -v"],
  summary: "Print the installed vid2 version",
  usage: "vid2 version [--json]",
  options: {},
  run({ args }) {
    if (args.length) throw new Vid2Error("E_INPUT", "version takes no positional arguments");
    return Promise.resolve({ command: "version", data: { version: packageVersion() } });
  },
};
