import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cacheDir } from "../shared/paths.ts";
import { TimelineSchema } from "../timeline/schema.ts";
import { resolveTimeline } from "../timeline/resolve.ts";
import type { FfmpegInfo } from "../probe/index.ts";
import { requiredFilters } from "./effects/registry.ts";
import { compileTimeline, timelineHash, timelineOutput } from "./plan.ts";
import { applyProfile } from "../render/profiles.ts";
import { escapePath } from "./escape.ts";
import { tempDir } from "../../tests/helpers.ts";

const fixtures = resolve(import.meta.dirname, "../../tests/fixtures/timelines");
const goldenDir = resolve(import.meta.dirname, "../../tests/golden");
const names = ["two-scenes", "text-anim", "window", "effects", "overlay", "visual", "delayed", "text-order", "zoom-out"];
process.env["VID2_HOME"] ??= tempDir("vid2-plan-home-");

const fake: FfmpegInfo = { path: "ffmpeg", version: "8.0.1", major: 8, minor: 0, buildFlags: ["--enable-libass"],
  filters: new Set(["overlay", "xfade", "alphamerge", "ass", ...requiredFilters()]), encoders: new Set(), decoders: new Set(),
  devices: { demuxers: [] }, hwaccels: [], libs: { ass: true, freetype: true, harfbuzz: true, vmaf: false, placebo: false } };

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8"));
}

function compile(name: string, authored: unknown = fixture(name)) {
  const timeline = TimelineSchema.parse(authored);
  const resolved = resolveTimeline(timeline, { baseDir: fixtures });
  const workDir = join(cacheDir("golden-work"), name);
  const pngDir = join(cacheDir("golden-png"), name);
  const plan = compileTimeline(resolved, { profile: "final", output: applyProfile(timelineOutput(resolved), "final"),
    workDir, pngDir, ffmpeg: fake, ffprobe: "ffprobe", timelineHash: timelineHash(resolved) });
  return { plan, workDir, pngDir };
}

function normalized(value: unknown, workDir: string, pngDir: string): unknown {
  if (typeof value === "string") {
    let text = value;
    const paths: [string, string][] = [[fixtures, "<FIXTURES>"], [workDir, "<WORK>"], [pngDir, "<PNG>"]];
    for (const [path, token] of paths) {
      text = text.replaceAll(escapePath(path), token).replaceAll(path, token);
    }
    return text.replaceAll(/\b[a-f0-9]{64}\b/g, "<HASH>");
  }
  if (Array.isArray(value)) return value.map((item) => normalized(item, workDir, pngDir));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalized(item, workDir, pngDir)]));
  return value;
}

for (const name of names) void test(`${name} render plan matches its golden`, () => {
  const { plan, workDir, pngDir } = compile(name);
  const actual = normalized(plan, workDir, pngDir);
  const path = join(goldenDir, `${name}.plan.json`);
  if (process.env["UPDATE_GOLDEN"] === "1") {
    mkdirSync(goldenDir, { recursive: true });
    writeFileSync(path, JSON.stringify(actual, null, 2) + "\n");
  }
  assert.deepEqual(actual, JSON.parse(readFileSync(path, "utf8")) as unknown);
});

void test("zoom 0.2 at 1920x1080 caps planned perspective canvas at 8192", () => {
  const raw = fixture("zoom-out") as { output: Record<string, unknown>; scenes: { layers: { camera: { zoom: number }[] }[] }[] };
  raw.output.width = 1920;
  raw.output.height = 1080;
  raw.scenes[0]!.layers[0]!.camera[0]!.zoom = 0.2;
  const { plan } = compile("zoom-out", raw);
  const pads = [...plan.segments[0]!.graph.matchAll(/pad=(\d+):(\d+)/g)];
  assert.ok(pads.length > 0);
  for (const match of pads) assert.ok(Number(match[1]) <= 8192 && Number(match[2]) <= 8192);
});
