import assert from "node:assert/strict";
import { test } from "node:test";
import { runChecked } from "../shared/index.ts";
import { Look, RISO_DEFAULT } from "../timeline/film.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { GraphBuilder } from "./graph.ts";
import { applyLook, lookRequiredFilters } from "./looks.ts";

const ffmpeg = process.env["VID2_FFMPEG"] ?? "ffmpeg";
const fps = { num: 30, den: 1 };

function graph(preset: "film" | "riso" | "paper", strength = 1): string {
  const builder = new GraphBuilder();
  const look = Look.parse({ preset, strength, seed: 2048 });
  const result = applyLook({ graph: builder, width: 320, height: 180, fps }, "0:v", look);
  if (strength > 0) builder.add([result], ["format=rgb24"], "out");
  return builder.toString();
}

async function ff(args: string[]): Promise<Buffer> {
  const result = await runChecked(ffmpeg, ["-hide_banner", "-v", "error", ...args]);
  return result.stdout;
}

async function checksum(preset: "film" | "riso" | "paper"): Promise<string> {
  const output = await ff(["-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1", "-filter_complex", graph(preset),
    "-map", "[out]", "-frames:v", "30", "-pix_fmt", "rgb24", "-f", "framemd5", "pipe:1"]);
  return output.toString("utf8").split("\n").filter((line) => line && !line.startsWith("#")).join("\n");
}

void test("look requirements are preset-specific and zero strength needs no filters", () => {
  for (const preset of ["film", "riso", "paper"] as const) {
    assert.deepEqual(lookRequiredFilters(Look.parse({ preset, strength: 0 })), []);
    assert.ok(lookRequiredFilters(Look.parse({ preset })).length > 0);
    assert.equal(graph(preset, 0), "");
  }
});

void test("all three looks produce deterministic rgb24 frame hashes for a fixed seed", async (t) => {
  if (!requireFfmpeg(t)) return;
  for (const preset of ["film", "riso", "paper"] as const) {
    const first = await checksum(preset);
    assert.ok(first.length > 0, `${preset} must produce frames`);
    assert.equal(await checksum(preset), first, `${preset} output changed with the same seed`);
  }
});

type RGB = readonly [number, number, number];
type Lab = readonly [number, number, number];

function lab(rgb: RGB): Lab {
  const [r, g, b] = rgb.map((channel) => {
    const x = channel / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const xyz = [(0.4124564 * r! + 0.3575761 * g! + 0.1804375 * b!) / 0.95047,
    (0.2126729 * r! + 0.7151522 * g! + 0.0721750 * b!),
    (0.0193339 * r! + 0.1191920 * g! + 0.9503041 * b!) / 1.08883].map((v) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * xyz[1]! - 16, 500 * (xyz[0]! - xyz[1]!), 200 * (xyz[1]! - xyz[2]!)];
}

function deltaE(a: Lab, b: Lab): number {
  const [l1, a1, b1] = a; const [l2, a2, b2] = b;
  const c1 = Math.hypot(a1, b1), c2 = Math.hypot(a2, b2);
  const meanC = (c1 + c2) / 2;
  const g = (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7))) / 2;
  const ap1 = a1 * (1 + g), ap2 = a2 * (1 + g);
  const cp1 = Math.hypot(ap1, b1), cp2 = Math.hypot(ap2, b2);
  const hue = (x: number, y: number): number => (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  const h1 = hue(ap1, b1), h2 = hue(ap2, b2);
  const dh = cp1 * cp2 === 0 ? 0 : ((h2 - h1 + 540) % 360) - 180;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin(dh * Math.PI / 360);
  const meanH = cp1 * cp2 === 0 ? h1 + h2 : Math.abs(h1 - h2) > 180
    ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2;
  const t = 1 - 0.17 * Math.cos((meanH - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * meanH * Math.PI / 180)
    + 0.32 * Math.cos((3 * meanH + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * meanH - 63) * Math.PI / 180);
  const meanL = (l1 + l2) / 2, meanCp = (cp1 + cp2) / 2;
  const sl = 1 + 0.015 * (meanL - 50) ** 2 / Math.sqrt(20 + (meanL - 50) ** 2);
  const sc = 1 + 0.045 * meanCp, sh = 1 + 0.015 * meanCp * t;
  const deltaTheta = 30 * Math.exp(-(((meanH - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(meanCp ** 7 / (meanCp ** 7 + 25 ** 7));
  const rt = -Math.sin(2 * deltaTheta * Math.PI / 180) * rc;
  const dl = (l2 - l1) / sl, dc = (cp2 - cp1) / sc, dhs = dH / sh;
  return Math.sqrt(dl * dl + dc * dc + dhs * dhs + rt * dc * dhs);
}

void test("riso palette maps at least 95 percent of seeded samples within deltaE2000 6", async (t) => {
  if (!requireFfmpeg(t)) return;
  // 0.01 activates paletteuse while integer grain and channel shifts round to zero.
  const gradient = "nullsrc=s=320x180:r=30:d=1,format=rgb24," +
    "geq=r='255*X/W':g='255*Y/H':b='255*(X+Y)/(W+H)'";
  const pixels = await ff(["-f", "lavfi", "-i", gradient, "-filter_complex", graph("riso", 0.01),
    "-map", "[out]", "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]);
  assert.equal(pixels.length, 320 * 180 * 3);
  const palette: RGB[] = RISO_DEFAULT.map((hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number]);
  const candidates = [...palette];
  for (let i = 0; i < palette.length; i++) for (let j = i + 1; j < palette.length; j++) {
    candidates.push([0, 1, 2].map((channel) => (palette[i]![channel]! + palette[j]![channel]!) / 2) as [number, number, number]);
  }
  const labs = candidates.map(lab);
  let seed = 0x41c64e6d, close = 0;
  for (let i = 0; i < 2000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const offset = (seed % (320 * 180)) * 3;
    const sample = lab([pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!]);
    if (labs.some((candidate) => deltaE(sample, candidate) <= 6)) close++;
  }
  assert.ok(close >= 1900, `${close}/2000 samples matched the palette or a 50% sRGB mix`);
});
