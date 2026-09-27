import { doctorReport } from "../../probe/index.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandSpec } from "../registry.ts";

export const doctor: CommandSpec = {
  name: "doctor",
  summary: "Check ffmpeg and optional capture tools",
  usage: "vid2 doctor [--deep] [--json]",
  options: { deep: { type: "boolean", description: "Run diagnostic canaries" } },
  async run({ args, values }) {
    if (args.length) throw new Vid2Error("E_INPUT", "doctor takes no positional arguments");
    const result = await doctorReport({ deep: values["deep"] === true });
    if (result.error) throw new Vid2Error(result.error.code, result.error.message, {
      details: { report: result }, fix: result.error.fix,
    });
    return { command: "doctor", data: result as unknown as Record<string, unknown>, warnings: result.warnings };
  },
};
