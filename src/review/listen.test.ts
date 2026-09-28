import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { locateTools, probeFfmpeg } from "../probe/index.ts";
import { run } from "../shared/index.ts";
import { listenToVideo, parseListenReply } from "./listen.ts";
import { fakeAnalyze } from "./report.test.ts";

const heard = { heard_audio: true, overall: "bright", timbre: ["clear"], groove: ["steady"],
  mix: ["balanced"], arrangement: ["sparse"], top_fixes: ["none"], genre_fit: { score: 3, notes: "ignored" } };

test("listener accepts optional lowEnd and ignores unknown fields", () => {
  assert.deepEqual(parseListenReply(JSON.stringify(heard))?.lowEnd, []);
  assert.equal(parseListenReply(JSON.stringify({ ...heard, mix: null })), null);
  assert.doesNotMatch(JSON.stringify(parseListenReply(JSON.stringify({ ...heard, overall: "SECRET_KEY data:audio/wav;base64,QUJDRA==" }), "SECRET_KEY")),
    /SECRET_KEY|data:audio|QUJDRA==/);
});

test("listener is opt-in, handles heard, unheard and streamed retry without leaking audio or key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vid2-listen-test-"));
  const video = join(dir, "tone.wav");
  const tools = locateTools(); const ffmpeg = await probeFfmpeg({ tools });
  const generated = await run(ffmpeg.path, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-c:a", "pcm_s16le", "-y", video]);
  assert.equal(generated.code, 0);
  const analyze = { ...fakeAnalyze, video, audio: { integratedLufs: -20, truePeakDbtp: -3, lra: 1,
    bands: [], perShot: [], onsets: [], loudestS: 1, quietestS: 0, warnings: [] } } as typeof fakeAnalyze;
  let hits = 0; let mode: "heard" | "unheard" | "stream" = "heard";
  const server = createServer((req, res) => { void (async () => {
    hits++; assert.equal(req.url, "/v1/responses"); assert.equal(req.headers.authorization, undefined);
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString(); assert.match(body, /data:audio\//);
    if (mode === "stream" && hits === 3) { res.statusCode = 400; res.end("stream must be set to true"); return; }
    if (mode === "stream") { assert.match(body, /"stream":true/);
      res.end(`data: ${JSON.stringify({ type: "response.output_text.delta", delta: JSON.stringify(heard) })}\n\ndata: [DONE]\n\n`); return; }
    const reply = mode === "unheard" ? { ...heard, heard_audio: false } : heard;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(reply) }] }] }));
  })(); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const opts = { requested: true, video, analyze, ffmpeg, model: "fake", baseUrl };
    assert.equal((await listenToVideo({ requested: true, video, analyze, ffmpeg, model: "fake" })).status, "SKIPPED"); assert.equal(hits, 0);
    assert.equal((await listenToVideo(opts)).status, "HEARD"); assert.equal(hits, 1);
    mode = "unheard"; assert.equal((await listenToVideo(opts)).reason, "not_heard"); assert.equal(hits, 2);
    mode = "stream"; assert.equal((await listenToVideo(opts)).status, "HEARD"); assert.equal(hits, 4);
  } finally { server.close(); await rm(dir, { recursive: true, force: true }); }
});
