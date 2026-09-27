import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";
import { runChecked } from "../shared/index.ts";
import { requireFfmpeg, requirePlaywright, tempDir } from "../../tests/helpers.ts";
import { captureWeb } from "./web.ts";
import { serveDir } from "./serve.ts";

const SECRET = "hunter2-SECRET-42";
const SITE = fileURLToPath(new URL("../../tests/fixtures/capture/site/", import.meta.url));

async function pixel(path: string, frame: number): Promise<[number, number, number]> {
  const result = await runChecked("ffmpeg", ["-v", "error", "-i", path,
    "-vf", `select='eq(n,${frame})',crop=2:2:10:10,format=rgb24`, "-frames:v", "1",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  assert.equal(result.stdout.length, 12);
  return [result.stdout[0]!, result.stdout[1]!, result.stdout[2]!];
}

test("web capture records actions, visible pixels, geometry and text privacy", async (t) => {
  if (!requireFfmpeg(t) || !await requirePlaywright(t)) return;
  const root = tempDir("vid2-web-");
  const opts = { serve: SITE, width: 160, height: 100, scale: 2, fps: 15, out: join(root, "default.vid2cap"), recordText: false,
    steps: [{ goto: "/" }, { wait: 350 }, { click: "#buy", label: "buy" }, { wait: 450 },
      { type: "#secret", text: SECRET }, { mark: "done" }, { wait: 300 }, { goto: "/second.html" }, { wait: 150 }] };
  const first = await captureWeb(opts);
  assert.ok(first.session.actions.length >= 3);
  assert.deepEqual(first.session.actions.map((action) => action.frame).toSorted((a, b) => a - b),
    first.session.actions.map((action) => action.frame));
  assert.equal(first.session.meta.width, 320);
  assert.equal(first.session.meta.height, 200);
  const probe = await runChecked("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets",
    "-show_entries", "stream=width,height,nb_read_packets", "-of", "json", first.session.footagePath]);
  const video = JSON.parse(probe.stdout.toString("utf8")) as { streams: { width: number; height: number; nb_read_packets: string }[] };
  assert.deepEqual([video.streams[0]?.width, video.streams[0]?.height], [320, 200]);
  assert.ok(Number(video.streams[0]?.nb_read_packets) > 10);
  const raw = readFileSync(join(first.dir, "actions.jsonl"), "utf8");
  assert.ok(!raw.includes(SECRET));
  assert.equal(first.session.actions.find((action) => action.kind === "type")?.chars, SECRET.length);
  const click = first.session.actions.find((action) => action.kind === "click")!;
  const before = await pixel(first.session.footagePath, Math.max(0, click.frame - 1));
  assert.ok(before[2] > before[0], `before click should be dark blue: ${before.join(",")}`);
  const after = await pixel(first.session.footagePath, click.frame + 4);
  assert.ok(after[0] > 200 && after[1] < 100 && after[2] > 50, `after click should be pink: ${after.join(",")}`);
  const second = await captureWeb({ ...opts, out: join(root, "opt-in.vid2cap"), recordText: true });
  assert.ok(readFileSync(join(second.dir, "actions.jsonl"), "utf8").includes(SECRET));
  assert.equal(second.session.meta.recordedText, true);
  const hosted = await serveDir(SITE);
  try {
    const script = join(root, "flow.mjs");
    writeFileSync(script, `export default async function (v2) {
      await v2.click("#buy", { label: "script-buy" });
      await v2.type("#secret", "script-value");
      v2.mark("script-done");
      await v2.wait(200);
    }`);
    const scripted = await captureWeb({ url: hosted.url, width: opts.width, height: opts.height,
      scale: opts.scale, fps: opts.fps, recordText: false, script, out: join(root, "script.vid2cap") });
    assert.equal(scripted.session.actions.find((action) => action.kind === "click")?.label, "script-buy");
    assert.ok(!readFileSync(join(scripted.dir, "actions.jsonl"), "utf8").includes("script-value"));
  } finally { await hosted.close(); }
});
