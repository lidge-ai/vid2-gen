/** vid2 audio <beats|snap|synth|sfx|generate|providers>: music beds, SFX, beat grids and provider assets (040). */
import { dirname, resolve } from "node:path";
import { detectBeats, generateAsset, providerById, SFX_PRESETS, sfxArgs, snapToBeat, synthArgs, SYNTH_PRESETS } from "../../audio/index.ts";
import type { SfxName } from "../../audio/index.ts";
import { providerRequests } from "../../compile/audio-plan.ts";
import { locateTools } from "../../probe/index.ts";
import { runChecked, Vid2Error } from "../../shared/index.ts";
import { resolveTimeline } from "../../timeline/index.ts";
import type { CommandResult } from "../output.ts";
import type { CommandSpec } from "../registry.ts";
import { loadTimeline } from "./timeline-file.ts";

type Values = Record<string, unknown>;
const str = (v: Values, k: string): string | undefined => (typeof v[k] === "string" ? (v[k]) : undefined);
function num(v: Values, k: string, fallback: number): number {
  const s = str(v, k);
  const n = s === undefined ? fallback : Number(s);
  if (!Number.isFinite(n)) throw new Vid2Error("E_INPUT", `--${k} must be a number`);
  return n;
}

async function synth(v: Values, cwd: string): Promise<CommandResult> {
  const preset = str(v, "preset") ?? "launch";
  if (!(SYNTH_PRESETS as readonly string[]).includes(preset)) throw new Vid2Error("E_INPUT", `unknown preset: ${preset}`, { details: { presets: SYNTH_PRESETS } });
  const out = resolve(cwd, str(v, "out") ?? `${preset}.wav`);
  const args = synthArgs({ preset: preset as "launch", key: str(v, "key") ?? "Am", bpm: num(v, "bpm", 120), durationS: num(v, "duration", 30) }, out);
  await runChecked(locateTools().ffmpeg, args);
  return { command: "audio synth", data: { output: out, preset }, artifacts: [out] };
}

async function sfx(name: string | undefined, v: Values, cwd: string): Promise<CommandResult> {
  if (!name || !(name in SFX_PRESETS)) throw new Vid2Error("E_INPUT", "audio sfx needs a preset name", { details: { presets: Object.keys(SFX_PRESETS) } });
  const out = resolve(cwd, str(v, "out") ?? `${name}.wav`);
  await runChecked(locateTools().ffmpeg, sfxArgs(name as SfxName, out));
  return { command: "audio sfx", data: { output: out, ...SFX_PRESETS[name as SfxName] }, artifacts: [out] };
}

async function generate(file: string | undefined, cwd: string): Promise<CommandResult> {
  const { timeline, path } = await loadTimeline(file, cwd);
  const requests = providerRequests(resolveTimeline(timeline, { baseDir: dirname(path) }));
  const assets = [];
  for (const req of requests) {
    const provider = providerById(req.provider);
    if (!provider) throw new Vid2Error("E_INPUT", `unknown audio provider: ${req.provider}`, { details: { providers: ["elevenlabs", "acestep"] } });
    const entry = await generateAsset(provider, req.kind, req.params as never);
    assets.push({ key: req.key, kind: req.kind, provider: req.provider, path: entry.path });
  }
  return { command: "audio generate", data: { assets }, artifacts: assets.map((a) => a.path) };
}

async function providers(): Promise<CommandResult> {
  const out: Record<string, unknown> = {};
  for (const id of ["elevenlabs", "acestep"]) out[id] = await providerById(id)!.capabilities();
  return { command: "audio providers", data: out };
}

export const audio: CommandSpec = {
  name: "audio",
  summary: "Music beds, sound effects, beat grids and provider audio",
  usage: "vid2 audio <beats <file> | snap <seconds> --bpm B [--offset S] | synth [--preset launch] [--bpm 120] [--duration 30] [--key Am] -o out.wav | sfx <preset> -o out.wav | generate <timeline> | providers> [--json]",
  options: {
    out: { type: "string", short: "o", description: "output path" },
    preset: { type: "string", description: "synth preset: " + "launch | minimal | tech | none" },
    bpm: { type: "string", description: "tempo" },
    offset: { type: "string", description: "beat grid offset in seconds" },
    duration: { type: "string", description: "seconds" },
    key: { type: "string", description: "musical key, e.g. Am, C, Dm" },
  },
  async run({ args, values, cwd }) {
    const [sub, arg] = args;
    switch (sub) {
      case "beats": {
        if (!arg) throw new Vid2Error("E_INPUT", "audio beats needs an audio file");
        return { command: "audio beats", data: { ...(await detectBeats(resolve(cwd, arg), { ffmpeg: locateTools().ffmpeg })) } };
      }
      case "snap": {
        const t = Number(arg);
        if (!Number.isFinite(t)) throw new Vid2Error("E_INPUT", "audio snap needs a time in seconds");
        return { command: "audio snap", data: { input: t, snapped: snapToBeat(t, { bpm: num(values, "bpm", 120), offset: num(values, "offset", 0) }) } };
      }
      case "synth": return synth(values, cwd);
      case "sfx": return sfx(arg, values, cwd);
      case "generate": return generate(arg, cwd);
      case "providers": return providers();
      default: throw new Vid2Error("E_INPUT", "audio needs a subcommand: beats | snap | synth | sfx | generate | providers");
    }
  },
};
