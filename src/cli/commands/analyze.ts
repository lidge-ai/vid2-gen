/** CLI adapter for deterministic film analysis. */
import { dirname, resolve } from "node:path";
import { analyzeAudio } from "../../analyze/audio.ts";
import { runAnalyze } from "../../analyze/run.ts";
import { loadCaptures } from "../../capture/index.ts";
import { locateTools, probeFfmpeg } from "../../probe/index.ts";
import { Vid2Error } from "../../shared/index.ts";
import { resolveTimeline } from "../../timeline/index.ts";
import type { CommandSpec } from "../registry.ts";
import { loadTimeline } from "./timeline-file.ts";

function numberOption(values: Record<string, unknown>, key: string, positive: boolean): number | undefined {
  const raw = values[key];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || positive && value <= 0) throw new Vid2Error("E_INPUT", `--${key} must be ${positive ? "positive" : "finite"}`);
  return value;
}

export const analyze: CommandSpec = {
  name: "analyze", summary: "Analyze shot rhythm, color, motion and audio",
  usage: "vid2 analyze <video> [--timeline t.json] [--bpm N] [--beat-offset S] [--out dir] [--json]",
  options: {
    timeline: { type: "string", description: "Authored timeline for scene boundaries" },
    bpm: { type: "string", description: "Beat grid tempo" },
    "beat-offset": { type: "string", description: "Beat grid offset in seconds" },
    out: { type: "string", short: "o", description: "Analysis artifact directory" },
  },
  async run({ args, values, cwd }) {
    if (args.length !== 1) throw new Vid2Error("E_INPUT", "analyze needs one video path");
    const tools = locateTools();
    const ffmpeg = await probeFfmpeg({ tools });
    let timeline;
    if (typeof values["timeline"] === "string") {
      const loaded = await loadTimeline(values["timeline"], cwd);
      const baseDir = dirname(loaded.path);
      const captures = await loadCaptures(loaded.timeline.sources, baseDir);
      timeline = resolveTimeline(loaded.timeline, { baseDir, ...(captures ? { events: captures.events } : {}) });
    }
    const bpm = numberOption(values, "bpm", true);
    const beatOffsetS = numberOption(values, "beat-offset", false);
    const report = await runAnalyze({ video: resolve(cwd, args[0]!), ffmpeg, ffprobe: tools.ffprobe, analyzeAudio,
      ...(timeline ? { timeline } : {}), ...(bpm === undefined ? {} : { bpm }),
      ...(beatOffsetS === undefined ? {} : { beatOffsetS }),
      ...(typeof values["out"] === "string" ? { out: resolve(cwd, values["out"]) } : {}) });
    return { command: "analyze", data: report as unknown as Record<string, unknown>,
      artifacts: [report.artifacts.report, ...report.artifacts.sheets, report.artifacts.sheetIndex,
        ...report.shots.map((shot) => shot.keyframe), ...(report.artifacts.spectrogram ? [report.artifacts.spectrogram] : [])],
      warnings: report.warnings };
  },
};
