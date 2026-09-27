import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runChecked, Vid2Error } from "../../shared/index.ts";
import { requireFfmpeg, tempDir } from "../../../tests/helpers.ts";
import { createElevenLabs } from "./elevenlabs.ts";
import { createAceStep } from "./acestep.ts";
import { importAudioFile } from "./file.ts";
import { generateAsset, lookupAsset, readManifest, recordAsset, requestHash } from "./manifest.ts";

const oldHome = process.env["VID2_HOME"];
process.env["VID2_HOME"] = tempDir("vid2-provider-cache-");
after(() => { if (oldHome === undefined) delete process.env["VID2_HOME"]; else process.env["VID2_HOME"] = oldHome; });

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
async function mockServer(t: { after(fn: () => Promise<void>): void }, handler: Handler): Promise<string> {
  const server = createServer((req, res) => { void Promise.resolve(handler(req, res)).catch(() => { res.statusCode = 500; res.end(); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("mock server did not bind");
  return `http://127.0.0.1:${address.port}`;
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of req) text += String(chunk);
  return JSON.parse(text) as Record<string, unknown>;
}

async function tone(): Promise<Buffer> {
  const dir = tempDir("vid2-provider-tone-");
  const path = join(dir, "tone.wav");
  await runChecked(process.env["VID2_FFMPEG"] ?? "ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "sine=frequency=440:sample_rate=44100:duration=0.5", "-c:a", "pcm_s16le", "-y", path]);
  return (await import("node:fs/promises")).readFile(path);
}

async function rms(path: string): Promise<number> {
  const res = await runChecked(process.env["VID2_FFMPEG"] ?? "ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path,
    "-ac", "1", "-ar", "48000", "-f", "f32le", "-"]);
  let sum = 0;
  const samples = res.stdout.length / 4;
  for (let i = 0; i < samples; i++) sum += res.stdout.readFloatLE(i * 4) ** 2;
  return Math.sqrt(sum / samples);
}

function code(error: unknown, expected: string, retryable = false): boolean {
  return error instanceof Vid2Error && error.code === expected && error.retryable === retryable;
}

test("request hashes normalize aliases and manifest cache avoids a second provider call", async t => {
  if (!requireFfmpeg(t)) return;
  const bytes = await tone();
  let requests = 0;
  const baseUrl = await mockServer(t, async (req, res) => {
    requests++;
    assert.equal(req.url, "/v1/music?output_format=mp3_48000_192");
    const data = await body(req);
    assert.equal(data["model_id"], "music_v2_5");
    res.setHeader("request-id", "music-1");
    res.setHeader("content-type", "audio/mpeg");
    res.end(bytes);
  });
  const provider = createElevenLabs({ apiKey: "test-key", baseUrl });
  const req = { prompt: "bright", durationMs: 500 };
  const first = await generateAsset(provider, "music", req);
  const second = await generateAsset(provider, "music", req);
  const offline = await generateAsset({ id: "elevenlabs", async capabilities() { return {}; },
    async music() { throw new Error("provider must not be called on a cache hit"); } }, "music", req);
  assert.deepEqual(first, second);
  assert.deepEqual(first, offline);
  assert.equal(requests, 1);
  assert.equal(first.provenance.requestId, "music-1");
  assert.equal(first.provenance.params["apiKey"], undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(first.provenance)), first.provenance);
  assert.ok((await rms(first.path)) > 0.02);
  assert.equal(requestHash({ provider: "elevenlabs", kind: "music", params: { prompt: "bright", durationMs: 500 } }),
    requestHash({ provider: "elevenlabs", kind: "music", params: { prompt: "bright", durationS: 0.5 } }));
  assert.ok(Object.keys(readManifest()).length >= 1);
  assert.ok(lookupAsset(requestHash({ provider: "elevenlabs", kind: "music", params: req })));
});

test("ElevenLabs SFX and TTS send expected bodies and return audible 48 kHz audio", async t => {
  if (!requireFfmpeg(t)) return;
  const bytes = await tone();
  const seen: Record<string, unknown>[] = [];
  const baseUrl = await mockServer(t, async (req, res) => {
    const payload = await body(req); seen.push(payload);
    if (req.url?.includes("with-timestamps")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ audio_base64: bytes.toString("base64"), alignment: { characters: ["H", "i"],
        character_start_times_seconds: [0, 0.2], character_end_times_seconds: [0.2, 0.4] } }));
    } else res.end(bytes);
  });
  const provider = createElevenLabs({ apiKey: "test-key", baseUrl });
  const sfx = await provider.sfx!({ text: "click", durationS: 0.5 });
  const tts = await provider.tts!({ text: "Hi", voiceId: "voice-1", language: "en" });
  const music = await provider.music!({ durationMs: 500, plan: { positive_global_styles: ["uplifting"] } });
  assert.equal(seen[0]?.["model_id"], "eleven_text_to_sound_v2");
  assert.equal(seen[1]?.["model_id"], "eleven_multilingual_v2");
  assert.deepEqual(seen[2]?.["composition_plan"], { positive_global_styles: ["uplifting"] });
  assert.ok(!JSON.stringify(seen).includes("test-key"));
  assert.deepEqual(tts.alignment, { chars: ["H", "i"], start: [0, 0.2], end: [0.2, 0.4] });
  assert.equal(sfx.sampleRate, 48000);
  assert.equal(music.sampleRate, 48000);
  assert.ok((await rms(tts.path)) > 0.02);
});

test("ElevenLabs maps missing key, HTTP errors, malformed TTS and timeout", async t => {
  const noKey = createElevenLabs({ apiKey: "", baseUrl: "http://127.0.0.1:1" });
  assert.equal((await noKey.capabilities()).music, false);
  await assert.rejects(noKey.music!({ prompt: "x", durationMs: 500 }), error => code(error, "E_CAPABILITY"));
  const baseUrl = await mockServer(t, async (req, res) => {
    const payload = await body(req);
    if (req.url?.includes("with-timestamps")) { res.end("{}"); return; }
    res.statusCode = Number(String(payload["prompt"]).slice(-3)); res.end("error");
  });
  const provider = createElevenLabs({ apiKey: "test-key", baseUrl });
  for (const [status, expected, retry] of [[401, "E_ACCESS", false], [403, "E_ACCESS", false], [400, "E_PROVIDER", false],
    [503, "E_PROVIDER", true]] as const) {
    await assert.rejects(provider.music!({ prompt: `status${status}`, durationMs: 500 }), error => code(error, expected, retry));
  }
  await assert.rejects(provider.tts!({ text: "Hi", voiceId: "v" }), error => code(error, "E_PROVIDER"));
  const timeout = createElevenLabs({ apiKey: "test-key", fetch: async () => { throw new DOMException("timeout", "TimeoutError"); } });
  await assert.rejects(timeout.music!({ prompt: "x", durationMs: 500 }), error => code(error, "E_TIMEOUT", true));
  const closed = createServer();
  await new Promise<void>(resolve => closed.listen(0, "127.0.0.1", resolve));
  const address = closed.address();
  if (!address || typeof address === "string") throw new Error("no port");
  await new Promise<void>(resolve => closed.close(() => resolve()));
  const unreachable = createElevenLabs({ apiKey: "test-key", baseUrl: `http://127.0.0.1:${address.port}` });
  await assert.rejects(unreachable.music!({ prompt: "x", durationMs: 500 }), error => code(error, "E_PROVIDER", true));
});

test("ACE-Step release/query/download succeeds and returns audible normalized audio", async t => {
  if (!requireFfmpeg(t)) return;
  const bytes = await tone();
  const paths: string[] = [];
  const baseUrl = await mockServer(t, async (req, res) => {
    paths.push(req.url ?? "");
    if (req.url === "/health") { res.end("ok"); return; }
    if (req.url === "/release_task") {
      const payload = await body(req);
      assert.equal(payload["audio_duration"], 0.5);
      res.end(JSON.stringify({ task_id: "task-1" })); return;
    }
    if (req.url === "/query_result") { res.end(JSON.stringify({ data: [{ status: 1,
      result: JSON.stringify([{ file: "/v1/audio?path=music.wav" }]) }] })); return; }
    if (req.url?.startsWith("/v1/audio?path=")) { res.end(bytes); return; }
    res.statusCode = 404; res.end();
  });
  const provider = createAceStep({ baseUrl, pollMs: 0 });
  assert.equal((await provider.capabilities()).music, true);
  const asset = await provider.music!({ prompt: "bright", durationMs: 500, bpm: 120, seed: 2 });
  assert.equal(asset.sampleRate, 48000);
  assert.ok((await rms(asset.path)) > 0.02);
  assert.ok(paths.some(path => path.startsWith("/v1/audio?path=music.wav")));
});

test("ACE-Step maps access, failed tasks, malformed bodies, connection refused and timeout", async t => {
  const access = await mockServer(t, (_req, res) => { res.statusCode = 403; res.end(); });
  await assert.rejects(createAceStep({ baseUrl: access }).music!({ durationMs: 500 }), error => code(error, "E_ACCESS"));
  await assert.rejects(createAceStep({ baseUrl: "" }).music!({ durationMs: 500 }), error => code(error, "E_CAPABILITY"));
  const failed = await mockServer(t, (req, res) => {
    res.end(req.url === "/release_task" ? JSON.stringify({ task_id: "t" }) : JSON.stringify({ status: 2 }));
  });
  await assert.rejects(createAceStep({ baseUrl: failed, pollMs: 0 }).music!({ durationMs: 500 }), error => code(error, "E_PROVIDER"));
  const malformed = await mockServer(t, (_req, res) => { res.end("not json"); });
  await assert.rejects(createAceStep({ baseUrl: malformed }).music!({ durationMs: 500 }), error => code(error, "E_PROVIDER"));
  const busy = await mockServer(t, (req, res) => {
    res.end(req.url === "/release_task" ? JSON.stringify({ task_id: "t" }) : JSON.stringify({ status: 0 }));
  });
  await assert.rejects(createAceStep({ baseUrl: busy, pollMs: 5, timeoutMs: 35 }).music!({ durationMs: 500 }),
    error => code(error, "E_TIMEOUT", true));
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  await new Promise<void>(resolve => server.close(() => resolve()));
  await assert.rejects(createAceStep({ baseUrl: `http://127.0.0.1:${address.port}`, timeoutMs: 100 }).music!({ durationMs: 500 }),
    error => code(error, "E_PROVIDER", true));
});

test("file normalization is audible and 48 kHz on ffmpeg 8 and 6.1", async t => {
  if (!requireFfmpeg(t)) return;
  const oldFfmpeg = process.env["VID2_FFMPEG"];
  const oldProbe = process.env["VID2_FFPROBE"];
  try {
    for (const [name, bin, probe] of [["8", "ffmpeg", "ffprobe"], ["6.1", "/tmp/ff61/ffmpeg", "/tmp/ff61/ffprobe"]]) {
      if (name === "6.1" && !existsSync(bin!)) { t.diagnostic("ffmpeg 6.1 test binary absent"); continue; }
      process.env["VID2_FFMPEG"] = bin;
      process.env["VID2_FFPROBE"] = probe;
      const dir = tempDir("vid2-file-audio-");
      const source = join(dir, `${name}.wav`);
      writeFileSync(source, await tone());
      const asset = await importAudioFile(source);
      assert.equal(asset.sampleRate, 48000);
      assert.ok((await rms(asset.path)) > 0.02, `${name} audible RMS`);
    }
  } finally {
    if (oldFfmpeg === undefined) delete process.env["VID2_FFMPEG"]; else process.env["VID2_FFMPEG"] = oldFfmpeg;
    if (oldProbe === undefined) delete process.env["VID2_FFPROBE"]; else process.env["VID2_FFPROBE"] = oldProbe;
  }
});

test("manifest ignores missing files and reports corruption as E_PROVIDER", async () => {
  const old = process.env["VID2_HOME"];
  const home = tempDir("vid2-manifest-test-");
  process.env["VID2_HOME"] = home;
  try {
    await recordAsset("missing", { path: join(home, "gone.wav"), provenance: {
      provider: "file", params: {}, createdAt: "2026-01-01T00:00:00.000Z" } });
    assert.equal(lookupAsset("missing"), undefined);
    writeFileSync(join(home, "cache/audio/manifest.json"), "{bad json");
    assert.throws(() => readManifest(), error => code(error, "E_PROVIDER"));
  } finally {
    if (old === undefined) delete process.env["VID2_HOME"]; else process.env["VID2_HOME"] = old;
  }
});
