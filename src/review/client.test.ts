import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { once } from "node:events";
import { reviewWithModel } from "./client.ts";
import { fakeAnalyze, validReview } from "./report.test.ts";

test("image client uses Chat Completions, omits missing auth, repairs invalid JSON once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vid2-client-"));
  const image = join(dir, "image.png"); await writeFile(image, Buffer.from("image-marker"));
  let hits = 0;
  const server = createServer((req, res) => { void (async () => {
    hits++;
    assert.equal(req.url, "/v1/chat/completions");
    assert.equal(req.headers.authorization, undefined);
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk as Buffer);
    assert.match(Buffer.concat(chunks).toString(), /data:image\/png;base64/);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: hits === 1 ? "bad" : JSON.stringify(validReview) } }] }));
  })(); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const result = await reviewWithModel({ baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "fake", prompt: "review",
      repairPrompt: "repair", images: [{ path: image, role: "keyframe", bytes: 12 }], analyze: fakeAnalyze });
    assert.equal(hits, 2); assert.equal(result.findings[0]?.severity, "info");
  } finally { server.close(); await rm(dir, { recursive: true, force: true }); }
});

test("invalid model output raises sanitized E_PROVIDER after one repair", async () => {
  let hits = 0;
  const server = createServer((_req, res) => { hits++; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "SENSITIVE_RAW_MODEL_OUTPUT" } }] })); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    await assert.rejects(reviewWithModel({ baseUrl: `http://127.0.0.1:${address.port}`, model: "fake", prompt: "p",
      repairPrompt: "r", images: [], analyze: fakeAnalyze, apiKey: "SECRET_KEY" }), (error: Error & { code?: string; details?: unknown }) => {
      assert.equal(error.code, "E_PROVIDER"); assert.equal(hits, 2);
      assert.doesNotMatch(JSON.stringify({ message: error.message, details: error.details }), /SECRET_KEY|SENSITIVE_RAW_MODEL_OUTPUT/);
      return true;
    });
  } finally { server.close(); }
});

test("401 maps to E_ACCESS without returning provider body", async () => {
  const server = createServer((_req, res) => { res.statusCode = 401; res.end("SECRET_KEY provider body"); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    await assert.rejects(reviewWithModel({ baseUrl: `http://127.0.0.1:${address.port}`, model: "fake", prompt: "p",
      repairPrompt: "r", images: [], analyze: fakeAnalyze, apiKey: "SECRET_KEY" }), (error: Error & { code?: string }) => {
      assert.equal(error.code, "E_ACCESS"); assert.doesNotMatch(error.message, /SECRET_KEY|provider body/); return true;
    });
  } finally { server.close(); }
});
