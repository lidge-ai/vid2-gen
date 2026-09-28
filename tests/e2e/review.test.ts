import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../../src/cli/main.ts";
import { locateTools } from "../../src/probe/index.ts";
import { run } from "../../src/shared/index.ts";

class Capture { chunks: string[] = []; write(text: string): boolean { this.chunks.push(text); return true; } }

test("review writes analyze, QA and evidence and skips image network when unconfigured", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vid2-review-e2e-"));
  const video = join(dir, "fixture.mp4");
  const tools = locateTools();
  const made = await run(tools.ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=160x90:r=10:d=2",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", "-y", video], { timeoutMs: 30_000 });
  assert.equal(made.code, 0, made.stderr);
  let hits = 0;
  const server = createServer((_req, res) => { hits++; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      scores: { narrative: 3, hierarchy: 3, legibility: 3, continuity: 3, motion: 3, audioTiming: 3, technical: 3 },
      findings: [{ sceneId: null, timeS: 1, severity: "warn", category: "motion", source: "frames",
        observation: "busy", evidence: "frames", fix: "hold longer" }], limitations: [],
    }) } }] })); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const previous = { url: process.env["VID2_REVIEW_BASE_URL"], model: process.env["VID2_REVIEW_MODEL"] };
  delete process.env["VID2_REVIEW_BASE_URL"]; delete process.env["VID2_REVIEW_MODEL"];
  try {
    const stdout = new Capture(); const stderr = new Capture();
    const code = await main(["review", video, "--out", join(dir, "review"), "--json"],
      { cwd: dir, stdout: stdout as unknown as NodeJS.WritableStream, stderr: stderr as unknown as NodeJS.WritableStream });
    assert.equal(code, 0, stderr.chunks.join(""));
    const envelope = JSON.parse(stdout.chunks.join("")) as { ok: boolean; data: { status: string; reason: string } };
    assert.equal(envelope.ok, true); assert.equal(envelope.data.status, "SKIPPED");
    assert.equal(envelope.data.reason, "model_not_configured"); assert.equal(hits, 0);
    const evidence = JSON.parse(await readFile(join(dir, "review", "evidence.json"), "utf8")) as { analyze: unknown; qa: unknown; images: unknown[] };
    assert.ok(evidence.analyze); assert.ok(evidence.qa); assert.ok(evidence.images.length > 0);
    assert.equal((await readFile(join(dir, "review", "review.json"), "utf8")).includes("data:audio"), false);
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const reviewed = new Capture();
    const reviewedCode = await main(["review", video, "--out", join(dir, "reviewed"),
      "--base-url", `http://127.0.0.1:${address.port}`, "--model", "fake", "--json"],
    { cwd: dir, stdout: reviewed as unknown as NodeJS.WritableStream, stderr: stderr as unknown as NodeJS.WritableStream });
    assert.equal(reviewedCode, 0, stderr.chunks.join(""));
    const result = JSON.parse(reviewed.chunks.join("")) as { data: { status: string; findings: unknown[] } };
    assert.equal(result.data.status, "REVIEWED"); assert.equal(result.data.findings.length, 1); assert.equal(hits, 1);
  } finally {
    if (previous.url === undefined) delete process.env["VID2_REVIEW_BASE_URL"]; else process.env["VID2_REVIEW_BASE_URL"] = previous.url;
    if (previous.model === undefined) delete process.env["VID2_REVIEW_MODEL"]; else process.env["VID2_REVIEW_MODEL"] = previous.model;
    server.close(); await rm(dir, { recursive: true, force: true });
  }
});
