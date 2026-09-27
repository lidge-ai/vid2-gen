import { resolve } from "node:path";
import { probeMedia } from "../../probe/index.ts";
import { Vid2Error } from "../../shared/index.ts";
import type { CommandSpec } from "../registry.ts";

export const probe: CommandSpec = {
  name: "probe",
  summary: "Inspect dimensions, streams and timing of a media file",
  usage: "vid2 probe <media> [--json]",
  options: {},
  async run({ args, cwd }) {
    if (args.length !== 1) throw new Vid2Error("E_INPUT", "probe needs one media path");
    const info = await probeMedia(resolve(cwd, args[0]!));
    return { command: "probe", data: { ...info } };
  },
};
