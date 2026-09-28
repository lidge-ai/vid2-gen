/** Deterministic JSON-CLI fixture. It never contacts ima2 or any provider. */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";

const args = process.argv.slice(2);
const mode = process.env.FAKE_IMA2_MODE ?? "ready";
if (process.env.FAKE_IMA2_COUNT) appendFileSync(process.env.FAKE_IMA2_COUNT, `${JSON.stringify(args)}\n`);
const print = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const command = args[0];

function fail(code, payload, stderr = false) {
  if (payload) (stderr ? process.stderr : process.stdout).write(`${JSON.stringify(payload)}\n`);
  process.exit(code);
}

if (["server-down", "auth", "validation", "network", "timeout"].includes(mode)) {
  const codes = { "server-down": 3, auth: 4, validation: 5, network: 6, timeout: 8 };
  fail(codes[mode]);
}
if (mode === "exit1-auth-json") {
  process.stderr.write("request failed\n");
  fail(1, { ok: false, code: "AUTH_REQUIRED", status: 401, message: "login needed", requestId: "req-auth-1" }, true);
}
if (mode === "exit1-timeout-json") fail(1, { ok: false, code: "VIDEO_TIMEOUT", status: 504,
  message: "timed out", requestId: "req-timeout-1" });

const videoReady = mode !== "grok-disconnected";
const imageReady = mode !== "reorder";
const oauth = { status: imageReady ? "ready" : "locked", reason: imageReady ? undefined : "OAuth login required",
  models: { image: 3, video: 0 } };
const grok = { status: videoReady ? "ready" : "disconnected", reason: videoReady ? undefined : "Grok login required",
  models: { image: 0, video: 2 } };
const imageModels = ["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"].map(id => ({ lane: "oauth", id,
  status: oauth.status, executable: true }));
const videoModels = ["grok-imagine-video", "grok-imagine-video-1.5"].map(id => ({ lane: "grok", id,
  status: grok.status, executable: true }));

if (command === "ping") print({ ok: true, base: "http://127.0.0.1:3333", version: "3.23.1", pid: 1 });
else if (command === "capabilities") print({ ok: true, source: "server", version: "3.23.1", lanes: { oauth, grok },
  defaults: { oauth: { model: "gpt-6-luna" } }, valid: { videoModels: { resolutions: ["480p", "720p", "1080p"], durationRange: [1, 15] } } });
else if (command === "models") print({ ok: true, kinds: { image: flag("--kind") === "video" ? [] :
  (mode === "reorder" ? imageModels.reverse() : imageModels), video: flag("--kind") === "image" ? [] : videoModels } });
else if (command === "gen") {
  const path = flag("-o");
  if (!path) fail(5, { ok: false, code: "VALIDATION_ERROR", message: "-o required" });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png(16, 16));
  print({ ok: true, requestId: "req-fake-image", elapsed: 20, images: [{ path, filename: "fake.png",
    requestedSize: flag("--size") ?? null, actualSize: "16x16" }] });
} else if (command === "video" && args[1] === "analyze") {
  print({ analysis: "The first frame is blue and the last is green.", method: "first-last-frame" });
} else if (command === "video" && args[1] === "--help") {
  process.stdout.write(`ima2 video [prompt] [--ref path]${mode === "no-as-reference" ? "" : " [--as-reference]"}\n`);
} else if (command === "video") {
  const path = flag("-o");
  if (!path) fail(5, { ok: false, code: "VALIDATION_ERROR", message: "-o required" });
  mkdirSync(dirname(path), { recursive: true });
  const ffmpeg = process.env.VID2_FFMPEG ?? "ffmpeg";
  const rendered = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "color=c=blue:s=32x18:r=15:d=1", "-frames:v", "15", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", path]);
  if (rendered.status !== 0) fail(6, { ok: false, code: "VIDEO_ENCODING_FAILED", message: String(rendered.stderr) });
  print({ ok: true, requestId: "req-fake-video", path, filename: "fake.mp4", elapsed: 100,
    video: { model: "grok-imagine-video-1.5" }, revisedPrompt: "A blue scene." });
} else fail(5, { ok: false, code: "VALIDATION_ERROR", message: "unknown fake command" });

function crc(bytes) {
  const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  body.copy(output, 4);
  output.writeUInt32BE(crc(body), output.length - 4);
  return output;
}
function png(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * (1 + width * 4) + 1 + x * 4;
    rows.set([255, 0, 0, 255], at);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
