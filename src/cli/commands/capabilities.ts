/** vid2 capabilities: one JSON call for agents — commands, ffmpeg summary, text backend, providers, schema ids. */
import { providerById as audioProvider } from "../../audio/index.ts";
import { providerById as assetProvider } from "../../assets/index.ts";
import { doctorReport } from "../../probe/index.ts";
import { Vid2Error } from "../../shared/errors.ts";
import { ICONS } from "../../stage/icons/lucide.ts";
import type { CommandSpec } from "../registry.ts";

export const capabilities: CommandSpec = {
  name: "capabilities",
  summary: "Everything an agent needs to plan: commands, ffmpeg, text backend, providers, schemas",
  usage: "vid2 capabilities [--json]",
  options: {},
  async run({ args }) {
    if (args.length) throw new Vid2Error("E_INPUT", "capabilities takes no positional arguments");
    const { commands } = await import("../registry.ts");
    const doctor = await doctorReport({ deep: false });
    const ff = doctor.ffmpeg;
    const settle = async <T>(p: Promise<T>): Promise<T | { available: false; reason: string }> => {
      try { return await p; } catch (e) { return { available: false, reason: e instanceof Error ? e.message : String(e) }; }
    };
    return { command: "capabilities", data: {
      commands: [...commands.values()].map((c) => ({ name: c.name, summary: c.summary, usage: c.usage })),
      ffmpeg: ff ? { version: ff.version, libass: ff.libs.ass, textBackend: ff.libs.ass ? "ass" : "raster" } : null,
      ok: doctor.ok, warnings: doctor.warnings,
      providers: {
        ima2: await settle(assetProvider("ima2").capabilities()),
        elevenlabs: await settle(audioProvider("elevenlabs")!.capabilities()),
        acestep: await settle(audioProvider("acestep")!.capabilities()),
      },
      schemas: { timeline: "https://raw.githubusercontent.com/lidge-ai/vid2-gen/main/schema/timeline.v1.json", steps: "vid2 schema --steps --json" },
      layers: ["media", "text", "shape", "overlay", "stage", "kinetic"],
      icons: Object.keys(ICONS).sort(),
    } };
  },
};
