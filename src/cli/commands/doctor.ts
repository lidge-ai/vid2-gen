import { doctorReport, locateTools, probeFfmpeg } from "../../probe/index.ts";
import { probeHardware } from "../../render/index.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandSpec } from "../registry.ts";

export const doctor: CommandSpec = {
  name: "doctor", group: "agent",
  examples: ["vid2 doctor","vid2 doctor --hw --json"],
  description: "Checks ffmpeg, ffprobe, libass and optional capture tools, with a fix for each missing piece.",
  summary: "Check ffmpeg and optional capture tools",
  usage: "vid2 doctor [--deep] [--hw] [--json]",
  options: { deep: { type: "boolean", description: "Run diagnostic canaries" },
    hw: { type: "boolean", description: "Trial-encode five frames with each hardware encoder to show which ones work" } },
  async run({ args, values }) {
    if (args.length) throw new Vid2Error("E_INPUT", "doctor takes no positional arguments");
    const result = await doctorReport({ deep: values["deep"] === true });
    if (result.error) throw new Vid2Error(result.error.code, result.error.message, {
      details: { report: result }, fix: result.error.fix,
    });
    const data = result as unknown as Record<string, unknown>;
    if (values["hw"] === true) {
      const tools = locateTools();
      data["hwProbe"] = await probeHardware(await probeFfmpeg({ tools }), tools.ffmpeg);
    }
    return { command: "doctor", data, warnings: result.warnings };
  },
};
