import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { run } from "../../src/shared/exec.ts";
import { requireFfmpeg, requirePlaywright, tempDir } from "../helpers.ts";

const cli = resolve(import.meta.dirname, "../../src/cli/index.ts");
const SITE = '<!doctype html><html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#E8ECF2}' +
  '#go{position:absolute;left:760px;top:420px;width:120px;height:60px;background:#FF3366;border:0}</style>' +
  '<button id="go"></button><input id="q" style="position:absolute;left:80px;top:80px;width:300px"></html>';

async function vid2(cwd: string, args: string[]): Promise<Record<string, unknown>> {
  const r = await run(process.execPath, [cli, ...args, "--json"], { cwd });
  const body = JSON.parse(r.stdout.toString("utf8")) as { ok: boolean; data: Record<string, unknown>; warnings: string[] };
  assert.equal(body.ok, true, r.stdout.toString("utf8") + r.stderr);
  return { ...body.data, warnings: body.warnings };
}

async function pinkPixels(video: string, seconds: number): Promise<number> {
  const r = await run("ffmpeg", ["-v", "error", "-ss", String(seconds), "-i", video, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  const px = r.stdout;
  let n = 0;
  for (let i = 0; i + 2 < px.length; i += 3) if (Math.abs(px[i]! - 255) < 40 && Math.abs(px[i + 1]! - 51) < 40 && Math.abs(px[i + 2]! - 102) < 40) n++;
  return n;
}

void test("web capture → event-driven camera render, privacy and steps schema", async (t) => {
  if (!requireFfmpeg(t) || !(await requirePlaywright(t))) return;
  const dir = tempDir("vid2-capture-e2e-");
  mkdirSync(join(dir, "site"));
  writeFileSync(join(dir, "site", "index.html"), SITE);
  writeFileSync(join(dir, "steps.json"), JSON.stringify([{ goto: "/index.html" }, { wait: 400 }, { type: "#q", text: "hunter2-SECRET-42" },
    { wait: 1300 }, { click: "#go", label: "go" }, { wait: 1500 }]));
  const cap = await vid2(dir, ["capture", "web", "--serve", "site", "--steps", "steps.json", "--size", "960x540", "--scale", "1", "--out", "demo"]);
  const actions = cap["actions"] as { kind: string; frame: number; label?: string }[];
  assert.ok(actions.length >= 3);
  assert.deepEqual(actions.map((a) => a.frame), [...actions.map((a) => a.frame)].sort((a, b) => a - b));
  assert.doesNotMatch(readFileSync(join(dir, "demo.vid2cap", "actions.jsonl"), "utf8"), /hunter2/);

  const click = actions.find((a) => a.label === "go")!;
  const timeline = (camera: unknown) => ({ version: 1, output: { width: 960, height: 540, fps: 30 },
    sources: { app: { type: "capture", session: "demo.vid2cap" } },
    scenes: [{ id: "demo", duration: "3.5s", layers: [{ type: "media", source: "app", ...(camera ? { camera } : {}) }] }] });
  writeFileSync(join(dir, "zoom.json"), JSON.stringify(timeline({ auto: "events" })));
  writeFileSync(join(dir, "flat.json"), JSON.stringify(timeline(null)));
  await vid2(dir, ["render", "zoom.json", "-o", "zoom.mp4", "--profile", "final"]);
  await vid2(dir, ["render", "flat.json", "-o", "flat.mp4", "--profile", "final"]);
  const at = click.frame / 30 + 0.6;
  const zoomed = await pinkPixels(join(dir, "zoom.mp4"), at);
  const flat = await pinkPixels(join(dir, "flat.mp4"), at);
  assert.ok(flat > 3000, `target visible unzoomed: ${flat}`);
  assert.ok(zoomed >= flat * 1.5, `camera zooms on the click: ${zoomed} vs ${flat}`);

  await vid2(dir, ["capture", "web", "--serve", "site", "--steps", "steps.json", "--size", "960x540", "--scale", "1", "--out", "secret", "--record-text"]);
  assert.match(readFileSync(join(dir, "secret.vid2cap", "actions.jsonl"), "utf8"), /hunter2-SECRET-42/);
  const inspected = await vid2(dir, ["capture", "inspect", "secret.vid2cap"]);
  assert.equal(inspected["recordedText"], true);
  assert.ok((inspected["warnings"] as string[]).some((w) => /typed text/.test(w)));
  const steps = await vid2(dir, ["schema", "--steps"]);
  assert.equal(steps["type"], "array");
});
