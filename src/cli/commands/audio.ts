/** vid2 audio <beats|snap|synth|sfx|generate|providers>: music beds, SFX, beat grids and provider audio (040). */
import { dirname, resolve } from "node:path";
import { detectBeats, generateAsset, providerById, SFX_PRESETS, sfxArgs, snapToBeat, synthArgs, SYNTH_PRESETS } from "../../audio/index.ts";
import type { SfxName } from "../../audio/index.ts";
import { providerRequests } from "../../compile/audio-plan.ts";
import { locateTools } from "../../probe/index.ts";
import { runChecked, Vid2Error } from "../../shared/index.ts";
import { resolveTimeline } from "../../timeline/index.ts";
import type { CommandResult } from "../output.ts";
import type { CommandOption, CommandSpec } from "../registry.ts";
import { parentCommand } from "../tree.ts";
import { loadTimeline } from "./timeline-file.ts";

type Values = Record<string, unknown>;
const str = (v: Values, k: string): string | undefined => (typeof v[k] === "string" ? (v[k]) : undefined);
function num(v: Values, k: string, fallback: number): number {
  const s = str(v, k);
  const n = s === undefined ? fallback : Number(s);
  if (!Number.isFinite(n)) throw new Vid2Error("E_INPUT", `--${k} must be a number`);
  return n;
}

function arity(name: string, args: string[], min: number, max = min): void {
  if (args.length < min || args.length > max) throw new Vid2Error("E_INPUT", `audio ${name} takes ${min === max ? min : `${min}-${max}`} argument(s), got ${args.length}`, {
    fix: `run vid2 audio ${name} --help` });
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

const OUT = (fallback: string): CommandOption => ({ type: "string", short: "o", value: "<file.wav>", description: "Output WAV path", default: fallback });
const BPM: CommandOption = { type: "string", value: "<bpm>", description: "Tempo in beats per minute", default: "120" };

const beats: CommandSpec = {
  name: "beats", summary: "Detect tempo, beat and downbeat times in an audio file",
  usage: "vid2 audio beats <file> [--json]", options: {},
  examples: ["vid2 audio beats music.wav --json"],
  async run({ args, cwd }) {
    arity("beats", args, 1);
    return { command: "audio beats", data: { ...(await detectBeats(resolve(cwd, args[0]!), { ffmpeg: locateTools().ffmpeg })) } };
  },
};

const snap: CommandSpec = {
  name: "snap", summary: "Snap a time in seconds to the nearest beat of a grid",
  usage: "vid2 audio snap <seconds> [--bpm 120] [--offset 0] [--json]",
  options: { bpm: BPM, offset: { type: "string", value: "<seconds>", description: "Time of the first beat", default: "0" } },
  examples: ["vid2 audio snap 7.3 --bpm 128 --offset 0.12"],
  run({ args, values }) {
    arity("snap", args, 1);
    const t = Number(args[0]);
    if (!Number.isFinite(t)) return Promise.reject(new Vid2Error("E_INPUT", "audio snap needs a time in seconds"));
    return Promise.resolve({ command: "audio snap", data: { input: t, snapped: snapToBeat(t, { bpm: num(values, "bpm", 120), offset: num(values, "offset", 0) }) } });
  },
};

const synthSpec: CommandSpec = {
  name: "synth", summary: "Synthesize a music bed with ffmpeg (no provider needed)",
  usage: "vid2 audio synth [--preset launch] [--bpm 120] [--duration 30] [--key Am] [-o out.wav] [--json]",
  options: {
    preset: { type: "string", value: `<${SYNTH_PRESETS.join("|")}>`, description: "Arrangement preset", default: "launch" },
    bpm: BPM, duration: { type: "string", value: "<seconds>", description: "Length of the bed", default: "30" },
    key: { type: "string", value: "<key>", description: "Musical key, e.g. Am, C, Dm", default: "Am" },
    out: OUT("<preset>.wav"),
  },
  examples: ["vid2 audio synth --preset tech --bpm 128 --duration 32 -o media/bed.wav"],
  run({ args, values, cwd }) { arity("synth", args, 0); return synth(values, cwd); },
};

const sfxSpec: CommandSpec = {
  name: "sfx", summary: "Render one sound-effect preset to a WAV file",
  usage: `vid2 audio sfx <${Object.keys(SFX_PRESETS).join("|")}> [-o out.wav] [--json]`,
  options: { out: OUT("<preset>.wav") },
  examples: ["vid2 audio sfx whoosh -o media/whoosh.wav"],
  run({ args, values, cwd }) { arity("sfx", args, 1); return sfx(args[0], values, cwd); },
};

const generateSpec: CommandSpec = {
  name: "generate", summary: "Generate the provider audio a timeline asks for (ElevenLabs, ACE-Step)",
  usage: "vid2 audio generate [timeline.json] [--json]", options: {},
  examples: ["vid2 audio generate timeline.json"],
  run({ args, cwd }) { arity("generate", args, 0, 1); return generate(args[0], cwd); },
};

const providersSpec: CommandSpec = {
  name: "providers", summary: "Show which audio providers are configured",
  usage: "vid2 audio providers [--json]", options: {}, examples: ["vid2 audio providers --json"],
  run({ args }) { arity("providers", args, 0); return providers(); },
};

export const audio = parentCommand({
  name: "audio", group: "media",
  summary: "Music beds, sound effects, beat grids and provider audio",
  usage: "vid2 audio <beats|snap|synth|sfx|generate|providers> [options] [--json]",
  description: "Beat grids let scenes and cuts land on the music; synth and sfx need only ffmpeg.",
  options: {},
  subcommands: [beats, snap, synthSpec, sfxSpec, generateSpec, providersSpec],
  examples: ["vid2 audio beats music.wav", "vid2 audio synth --preset launch -o bed.wav", "vid2 audio sfx riser -o riser.wav"],
});
