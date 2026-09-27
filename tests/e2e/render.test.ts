import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { run } from "../../src/shared/exec.ts";
import { solidRect } from "../../src/compile/png.ts";
import { requireFfmpeg, tempDir } from "../helpers.ts";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const fixtures = join(root, "tests/fixtures/timelines");
const ffmpeg = process.env["VID2_FFMPEG"] ?? "ffmpeg";
const ffprobe = process.env["VID2_FFPROBE"] ?? "ffprobe";
const size = { width: 320, height: 180 };
/** Text renders through libass when present, otherwise through the raster backend; ASS-file checks apply only to libass. */
const libass = /^\s*[T.][S.][C.]?\s+ass\s/m.test(spawnSync(ffmpeg, ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout ?? "")
  && process.env["VID2_TEXT_BACKEND"] !== "raster";
type RenderData = { output: string; frames: number; segments: { id: string; cached: boolean }[]; width: number; height: number };

async function command(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<{ stdout: Buffer; stderr: string }> {
  const result = await run(cmd, args, { env: { ...process.env, ...env } });
  assert.equal(result.code, 0, `${cmd} ${args.join(" ")}\n${result.stderr}\n${result.stdout.toString()}`);
  return result;
}

async function media(dir: string): Promise<Record<string, string>> {
  const folder = join(dir, "media");
  mkdirSync(folder, { recursive: true });
  const motion = join(folder, "motion.mp4");
  await command(ffmpeg, ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=15:duration=9",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", motion]);
  const red = join(folder, "red.png");
  const glow = join(folder, "glow.png");
  writeFileSync(red, solidRect(320, 180, 0, [255, 0, 0, 255]));
  writeFileSync(glow, solidRect(320, 180, 0, [255, 255, 255, 255]));
  return { "media/motion.mp4": motion, "media/red.png": red, "media/glow.png": glow };
}

function authored(name: string, paths: Record<string, string>): Record<string, unknown> {
  const timeline = JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8")) as Record<string, unknown>;
  const sources = timeline["sources"] as Record<string, { path?: string }> | undefined;
  for (const source of Object.values(sources ?? {})) {
    const mapped = source.path ? paths[source.path] : undefined;
    if (mapped) source.path = mapped;
  }
  return timeline;
}

async function render(name: string, dir: string, paths: Record<string, string>, edit?: (timeline: Record<string, unknown>) => void,
  profile = "final", home = join(dir, "home")): Promise<{ data: RenderData; path: string; timeline: string }> {
  const timeline = authored(name, paths);
  edit?.(timeline);
  const path = join(dir, `${name}-${profile}-${Math.random().toString(36).slice(2)}.mp4`);
  const input = `${path}.json`;
  writeFileSync(input, JSON.stringify(timeline));
  const result = await command(process.execPath, [join(root, "src/cli/index.ts"), "render", input, "-o", path,
    "--profile", profile, "--jobs", "2", "--json"], { VID2_HOME: home });
  const body = JSON.parse(result.stdout.toString()) as { ok: boolean; data: RenderData };
  assert.equal(body.ok, true);
  return { data: body.data, path, timeline: input };
}

async function probe(path: string): Promise<{ width: number; height: number; frames: number }> {
  const result = await command(ffprobe, ["-v", "error", "-select_streams", "v:0", "-count_packets",
    "-show_entries", "stream=width,height,nb_read_packets", "-of", "json", path]);
  const stream = (JSON.parse(result.stdout.toString()) as { streams: { width: number; height: number; nb_read_packets: string }[] }).streams[0]!;
  return { width: stream.width, height: stream.height, frames: Number(stream.nb_read_packets) };
}

async function rawFrame(path: string, frame: number, width = size.width, height = size.height): Promise<Buffer> {
  const result = await command(ffmpeg, ["-hide_banner", "-v", "error", "-i", path,
    "-vf", `select=eq(n\\,${frame}),format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "-"]);
  assert.equal(result.stdout.length, width * height * 3, `decoded frame ${frame}`);
  return result.stdout;
}

function pixel(frame: Buffer, x: number, y: number, width = size.width): [number, number, number] {
  const i = (y * width + x) * 3;
  return [frame[i]!, frame[i + 1]!, frame[i + 2]!];
}

function mean(frame: Buffer, x: number, y: number, width: number, height: number): number {
  let sum = 0;
  for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) {
    const p = pixel(frame, xx, yy);
    sum += (p[0] + p[1] + p[2]) / 3;
  }
  return sum / (width * height);
}

function redCount(frame: Buffer): number {
  let count = 0;
  for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
    const [red, green, blue] = pixel(frame, x, y);
    if (red > 160 && green < 100 && blue < 100) count++;
  }
  return count;
}

function assContents(dir: string): string[] {
  const work = join(dir, "home", "cache", "work");
  return readdirSync(work, { recursive: true }).map(String).filter((name) => name.endsWith(".ass"))
    .map((name) => readFileSync(join(work, name), "utf8"));
}

void test("wp3 render fixtures produce visible, frame-exact output", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-render-e2e-");
  const paths = await media(dir);

  await t.test("two scenes fade with a visible midpoint and exact frame count", async () => {
    const result = await render("two-scenes", dir, paths);
    assert.deepEqual(await probe(result.path), { width: 320, height: 180, frames: 52 });
    const red = pixel(await rawFrame(result.path, 10), 160, 90);
    const blend = pixel(await rawFrame(result.path, 26), 160, 90);
    const blue = pixel(await rawFrame(result.path, 45), 160, 90);
    assert.ok(red[0] > red[2] * 2 && blue[2] > blue[0] * 2);
    assert.ok(blend[0] > 25 && blend[2] > 25);
  });

  await t.test("animated text is compiled and rendered", async () => {
    const result = await render("text-anim", dir, paths);
    assert.equal((await probe(result.path)).frames, 30);
    if (libass) {
      const ass = assContents(dir).find((content) => content.includes("VID2"));
      assert.ok(ass);
      assert.match(ass, /\\move|\\fad/);
      const golden = JSON.parse(readFileSync(join(root, "tests/golden/text-anim.plan.json"), "utf8")) as {
        segments: { assFiles: { content: string }[] }[] };
      assert.equal(ass, golden.segments[0]!.assFiles[0]!.content);
    }
    const before = mean(await rawFrame(result.path, 4), 90, 60, 140, 60);
    const after = mean(await rawFrame(result.path, 16), 90, 60, 140, 60);
    assert.ok(after > before + 3);
  });

  await t.test("window has visible content and a different exterior", async () => {
    const result = await render("window", dir, paths);
    const frame = await rawFrame(result.path, 15);
    assert.ok(mean(frame, 110, 60, 80, 50) > mean(frame, 0, 0, 40, 30) + 15);
  });

  await t.test("motionblur keeps the 30-frame scene length", async () => {
    const result = await render("effects", dir, paths);
    assert.equal((await probe(result.path)).frames, 30);
    assert.ok(mean(await rawFrame(result.path, 10), 60, 40, 100, 70) > 20);
  });

  await t.test("screen overlay brightens only its span", async () => {
    const result = await render("overlay", dir, paths);
    const before = mean(await rawFrame(result.path, 2), 90, 50, 80, 60);
    const during = mean(await rawFrame(result.path, 15), 90, 50, 80, 60);
    const after = mean(await rawFrame(result.path, 27), 90, 50, 80, 60);
    assert.ok(during > before + 40 && during > after + 40);
  });

  await t.test("second render reuses all segment cache entries", async () => {
    const home = join(dir, "cache-case-home");
    const first = await render("two-scenes", dir, paths, undefined, "final", home);
    assert.ok(first.data.segments.every((segment) => !segment.cached));
    const result = await command(process.execPath, [join(root, "src/cli/index.ts"), "render", first.timeline,
      "-o", join(dir, "cached.mp4"), "--json"], { VID2_HOME: home });
    const data = (JSON.parse(result.stdout.toString()) as { data: RenderData }).data;
    assert.ok(data.segments.length > 0 && data.segments.every((segment) => segment.cached));
  });

  await t.test("proxy dimensions are half with even pixels", async () => {
    const result = await render("two-scenes", dir, paths, undefined, "proxy");
    assert.deepEqual(await probe(result.path), { width: 160, height: 90, frames: 52 });
  });

  await t.test("visible 8-second composition has window, text entrance, fade and no black run", async () => {
    const result = await render("visual", dir, paths);
    assert.equal((await probe(result.path)).frames, 120);
    const opening = await rawFrame(result.path, 10);
    assert.ok(mean(opening, 70, 55, 160, 70) > mean(opening, 0, 0, 30, 30) + 15);
    const before = mean(await rawFrame(result.path, 4), 120, 140, 80, 30);
    const after = mean(await rawFrame(result.path, 24), 120, 140, 80, 30);
    assert.ok(after > before + 2);
    const fade = pixel(await rawFrame(result.path, 60), 5, 5);
    const end = pixel(await rawFrame(result.path, 100), 5, 5);
    assert.notDeepEqual(fade, end);
    const check = await command(ffmpeg, ["-hide_banner", "-i", result.path, "-vf", "blackdetect=d=0.1", "-an", "-f", "null", "-"]);
    assert.doesNotMatch(check.stderr, /black_start:/);
  });

  await t.test("delayed still enters at 2 seconds with and without internal rate 3", async () => {
    for (const rate of [1, 3]) {
      const result = await render("delayed", dir, paths, rate === 3 ? (timeline) => {
        const scenes = timeline["scenes"] as Record<string, unknown>[];
        scenes[0]!["effects"] = [{ type: "motionblur", frames: 3 }];
      } : undefined);
      assert.equal((await probe(result.path)).frames, 45);
      assert.ok(pixel(await rawFrame(result.path, 28), 160, 90)[0] < 30, `rate ${rate}: before`);
      assert.ok(pixel(await rawFrame(result.path, 32), 160, 90)[0] > 180, `rate ${rate}: after`);
    }
  });

  await t.test("shape covers earlier text while a second ASS run stays visible", async () => {
    const result = await render("text-order", dir, paths);
    const frame = await rawFrame(result.path, 15);
    const covered = pixel(frame, 70, 45);
    assert.ok(covered[0] > 180 && covered[1] < 90 && covered[2] < 90);
    for (let y = 10; y < 80; y += 5) for (let x = 10; x < 150; x += 5) {
      const [red, green, blue] = pixel(frame, x, y);
      assert.ok(red > 180 && green < 90 && blue < 90, `covered text at ${x},${y}`);
    }
    assert.ok(mean(frame, 180, 110, 120, 50) > 6);
    if (libass) {
      const files = assContents(dir).filter((content) => content.includes("FIRST") || content.includes("SECOND"));
      assert.equal(files.length, 2);
    }
  });

  await t.test("zoom 0.5 shows a smaller subject than zoom 1", async () => {
    const result = await render("zoom-out", dir, paths);
    const small = redCount(await rawFrame(result.path, 0));
    const large = redCount(await rawFrame(result.path, 25));
    assert.ok(small > 6000 && small < 25000, `zoom 0.5: ${small}`);
    assert.ok(large > small * 2, `zoom 1: ${large}`);
  });

  await t.test("30000/1001 timeline yields an exact rational-fps frame count", async () => {
    const result = await render("two-scenes", dir, paths, (timeline) => {
      const output = timeline["output"] as Record<string, unknown>;
      output["fps"] = "30000/1001";
      const scenes = timeline["scenes"] as Record<string, unknown>[];
      scenes[0]!["duration"] = "1s";
      scenes[1]!["duration"] = "1s";
      (scenes[0]!["transition"] as Record<string, unknown>)["duration"] = "0.2s";
    });
    assert.equal((await probe(result.path)).frames, 54);
  });

  await t.test("fade then cut then fade preserves colours at boundaries", async () => {
    const result = await render("two-scenes", dir, paths, (timeline) => {
      timeline["scenes"] = [
        { id: "red", duration: "1s", background: "#ff0000", transition: { type: "fade", duration: "0.2s" } },
        { id: "blue", duration: "1s", background: "#0000ff", transition: { type: "cut" } },
        { id: "green", duration: "1s", background: "#00ff00", transition: { type: "fade", duration: "0.2s" } },
        { id: "yellow", duration: "1s", background: "#ffff00" },
      ];
    });
    assert.equal((await probe(result.path)).frames, 54);
    const at = async (n: number) => pixel(await rawFrame(result.path, n), 160, 90);
    const red = await at(0), blue = await at(26), green = await at(27), yellow = await at(53);
    assert.ok(red[0] > 180 && red[1] < 90 && red[2] < 90);
    assert.ok(blue[2] > 180 && blue[0] < 90 && blue[1] < 90);
    assert.ok(green[1] > 100 && green[0] < 90 && green[2] < 90);
    assert.ok(yellow[0] > 180 && yellow[1] > 150 && yellow[2] < 90);
  });
});
