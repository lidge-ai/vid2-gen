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
import { lookRequiredFilters } from "./looks.ts";
import { Look } from "../timeline/film.ts";
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
    // Windows: token-prefixed paths use backslashes; goldens store forward slashes.
    text = text.replaceAll(/<(FIXTURES|WORK|PNG)>[^\s'",]*/g, (m) => m.replaceAll("\\", "/"));
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

void test("zero-strength looks produce exactly the no-look post graph", () => {
  const bare = fixture("two-scenes") as Record<string, unknown>;
  const baseline = compile("two-scenes", bare).plan;
  for (const preset of ["film", "riso", "paper"] as const) {
    const raw = { ...bare, look: { preset, strength: 0, seed: 11 } };
    const plan = compile("two-scenes", raw).plan;
    assert.equal(plan.post.graph, baseline.post.graph);
    assert.deepEqual(plan.post.inputs, baseline.post.inputs);
    assert.equal(plan.post.look, undefined);
  }
});

void test("an active look is recorded and missing look filters fail capability checking", () => {
  const raw = { ...(fixture("two-scenes") as Record<string, unknown>), look: { preset: "paper", strength: 0.7, seed: 3 } };
  const resolved = resolveTimeline(TimelineSchema.parse(raw), { baseDir: fixtures });
  const opts = { profile: "final" as const, output: applyProfile(timelineOutput(resolved), "final"), workDir: cacheDir("look-work"),
    ffmpeg: { ...fake, filters: new Set([...fake.filters, ...lookRequiredFilters(Look.parse(raw.look))]) },
    ffprobe: "ffprobe", timelineHash: timelineHash(resolved) };
  const plan = compileTimeline(resolved, opts);
  assert.deepEqual(plan.post.look && { preset: plan.post.look.preset, strength: plan.post.look.strength },
    { preset: "paper", strength: 0.7 });
  assert.match(plan.post.graph ?? "", /colorchannelmixer=/);
  assert.throws(() => compileTimeline(resolved, { ...opts, ffmpeg: fake }),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "E_CAPABILITY"));
});

void test("a HUD-only post requires both ffv1 capabilities and records ordered chunk IDs", () => {
  const raw = { version: 1, output: { width: 320, height: 180, fps: 30 }, scenes: [
    { id: "a", duration: "1s", background: "#222222" },
    { id: "b", duration: "1.5s", background: "#444444", transition: { type: "fade", duration: "0.5s" } },
    { id: "c", duration: "1s", background: "#666666" },
  ], overlays: [{ type: "hud", label: "REC", counter: { keys: [{ at: "0s", value: 30 }, { at: "89f", value: 99.9 }], decimals: 1 } }] };
  const resolved = resolveTimeline(TimelineSchema.parse(raw), { baseDir: fixtures });
  const options = { profile: "final" as const, output: applyProfile(timelineOutput(resolved), "final"),
    workDir: cacheDir("hud-work"), ffprobe: "ffprobe", timelineHash: timelineHash(resolved) };
  const codecs = { ...fake, encoders: new Set(["ffv1"]), decoders: new Set(["ffv1"]),
    filters: new Set([...fake.filters, "concat"]) };
  for (const info of [fake, { ...codecs, encoders: new Set<string>() }, { ...codecs, decoders: new Set<string>() }]) {
    assert.throws(() => compileTimeline(resolved, { ...options, ffmpeg: info }),
      (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "E_CAPABILITY"));
  }
  const plan = compileTimeline(resolved, { ...options, ffmpeg: codecs, hudChunkSeconds: 1 });
  assert.equal(plan.post.hud?.renders.length, 3);
  assert.deepEqual(plan.post.hud?.renders, plan.stageRenders.map((render) => render.id));
  assert.match(plan.post.graph ?? "", /concat=n=3/);
});

void test("post graph orders look, root overlay, root effect, then HUD", () => {
  const raw = { version: 1, output: { width: 320, height: 180, fps: 30 },
    sources: { glow: { type: "image", path: "media/glow.png" } },
    look: { preset: "paper", strength: 0.8 },
    scenes: [{ id: "one", duration: "1s", background: "#222222" }],
    effects: [{ type: "grain", strength: 3 }],
    overlays: [{ type: "overlay", source: "glow", blend: "normal" }, { type: "hud", label: "REC" }] };
  const resolved = resolveTimeline(TimelineSchema.parse(raw), { baseDir: fixtures });
  const plan = compileTimeline(resolved, { profile: "final", output: applyProfile(timelineOutput(resolved), "final"),
    workDir: cacheDir("post-order"), ffprobe: "ffprobe", timelineHash: timelineHash(resolved),
    ffmpeg: { ...fake, filters: new Set([...fake.filters, ...lookRequiredFilters(Look.parse(raw.look)), "concat"]),
      encoders: new Set(["ffv1"]), decoders: new Set(["ffv1"]) } });
  const graph = plan.post.graph ?? "";
  const positions = ["colorchannelmixer=", "overlay=x=", "noise=alls=3:allf=t", "concat=n=1"].map((part) => graph.indexOf(part));
  assert.ok(positions.every((position) => position >= 0), graph);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});
