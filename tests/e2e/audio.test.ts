import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { run } from "../../src/shared/exec.ts";
import { requireFfmpeg, tempDir } from "../helpers.ts";

const cli = resolve(import.meta.dirname, "../../src/cli/index.ts");
const ffmpeg = process.env["VID2_FFMPEG"] ?? "ffmpeg";
const ffprobe = process.env["VID2_FFPROBE"] ?? "ffprobe";

async function vid2(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ ok: boolean; data: Record<string, unknown>; error?: { code: string; fix?: string } }> {
  const r = await run(process.execPath, [cli, ...args, "--json"], { cwd, env: { ...process.env, ...env } });
  return JSON.parse(r.stdout.toString("utf8")) as { ok: boolean; data: Record<string, unknown>; error?: { code: string; fix?: string } };
}

async function loudness(path: string): Promise<{ I: number; TP: number }> {
  const r = await run(ffmpeg, ["-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(r.stderr.split("Summary:").at(-1) ?? "")?.[1]);
  const TP = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(r.stderr.split("Summary:").at(-1) ?? "")?.[1]);
  return { I, TP };
}

async function durations(path: string): Promise<{ video: number; audio: number }> {
  const r = await run(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,duration", "-of", "json", path]);
  const streams = (JSON.parse(r.stdout.toString("utf8")) as { streams: { codec_type: string; duration: string }[] }).streams;
  return { video: Number(streams.find((s) => s.codec_type === "video")?.duration), audio: Number(streams.find((s) => s.codec_type === "audio")?.duration) };
}

const scenes = [{ id: "one", duration: "3s", background: "#101820", layers: [{ type: "text", text: "ONE", size: 48 }], transition: { type: "fade", duration: "0.5s" } },
  { id: "two", duration: "3.5s", background: "#F5F5F2", layers: [{ type: "text", text: "TWO", size: 48, color: "#111111" }] }];

void test("launch synth + auto cues master to -14 LUFS and match the video duration", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-audio-e2e-");
  writeFileSync(join(dir, "t.json"), JSON.stringify({ version: 1, output: { width: 320, height: 180, fps: 30 }, beat: { bpm: 120 }, scenes,
    audio: { music: { synth: { preset: "launch" } }, cues: [{ at: "3s", sfx: "preset:impact" }] } }));
  const body = await vid2(dir, ["render", "t.json", "-o", "out.mp4"]);
  assert.equal(body.ok, true, JSON.stringify(body));
  const l = await loudness(join(dir, "out.mp4"));
  assert.ok(Math.abs(l.I + 14) <= 0.5, `integrated ${l.I}`);
  assert.ok(l.TP <= -0.9 + 0.05, `true peak ${l.TP}`);
  const d = await durations(join(dir, "out.mp4"));
  assert.ok(Math.abs(d.audio - d.video) <= 1 / 30 + 1e-3, `audio ${d.audio} vs video ${d.video}`);
});

void test("provider SFX: render asks for 'audio generate', which fills the cache; later renders need no network", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-audio-provider-");
  const tone = join(dir, "tone.wav");
  await run(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000:duration=0.6", "-y", tone]);
  let requests = 0;
  const server = createServer((req, res) => { requests++; req.resume(); req.on("end", () => res.end(readFileSync(tone))); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const env = { ELEVENLABS_API_KEY: "test-key", ELEVENLABS_BASE_URL: `http://127.0.0.1:${port}`, VID2_HOME: join(dir, "home") };
  writeFileSync(join(dir, "t.json"), JSON.stringify({ version: 1, output: { width: 160, height: 90, fps: 15 }, scenes: [scenes[1]],
    audio: { cues: [{ at: "1s", sfx: "elevenlabs:door slam" }] } }));
  const missing = await vid2(dir, ["render", "t.json", "-o", "a.mp4"], env);
  assert.equal(missing.ok, false);
  assert.equal(missing.error?.code, "E_INPUT");
  assert.match(missing.error?.fix ?? "", /vid2 audio generate/);
  const gen = await vid2(dir, ["audio", "generate", "t.json"], env);
  assert.equal(gen.ok, true, JSON.stringify(gen));
  assert.equal(requests, 1);
  await new Promise<void>((r) => server.close(() => r()));
  const rendered = await vid2(dir, ["render", "t.json", "-o", "b.mp4", "--no-cache"], { ...env, ELEVENLABS_BASE_URL: "http://127.0.0.1:9" });
  assert.equal(rendered.ok, true, JSON.stringify(rendered));
  assert.equal(requests, 1);
  const again = await vid2(dir, ["audio", "generate", "t.json"], { ...env, ELEVENLABS_BASE_URL: "http://127.0.0.1:9" });
  assert.equal(again.ok, true, "cached assets are not requested again");
});
