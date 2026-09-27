import { deflateSync } from "node:zlib";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashJson } from "../shared/hash.ts";

const CRC = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC[(c ^ byte) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

export function encodePng(width: number, height: number, channels: 1 | 4, data: Uint8Array): Buffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * channels) {
    throw new RangeError("invalid PNG dimensions or byte count");
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 1 ? 0 : 6;
  const raw = Buffer.alloc(height * (1 + width * channels));
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * channels, width * channels)
    .copy(raw, y * (1 + width * channels) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function inside(x: number, y: number, w: number, h: number, radius: number): boolean {
  const r = Math.min(radius, w / 2, h / 2);
  const cx = Math.max(r, Math.min(w - r, x));
  const cy = Math.max(r, Math.min(h - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function coverage(x: number, y: number, w: number, h: number, radius: number): number {
  let hits = 0;
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4, w, h, radius)) hits++;
  }
  return Math.round(hits * 255 / 16);
}

export function roundedRectMask(width: number, height: number, radius: number): Buffer {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = coverage(x, y, width, height, radius);
  return encodePng(width, height, 1, data);
}

function rgba(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return encodePng(width, height, 4, data);
}

export function solidRect(width: number, height: number, radius: number, color: [number, number, number, number]): Buffer {
  return rgba(width, height, (x, y) => [color[0], color[1], color[2], Math.round(color[3] * coverage(x, y, width, height, radius) / 255)]);
}

export function roundedRectBorder(width: number, height: number, radius: number, thickness = 2): Buffer {
  return rgba(width, height, (x, y) => {
    const outer = coverage(x, y, width, height, radius);
    const inner = x >= thickness && y >= thickness && x < width - thickness && y < height - thickness
      ? coverage(x - thickness, y - thickness, width - 2 * thickness, height - 2 * thickness, Math.max(0, radius - thickness)) : 0;
    return [255, 255, 255, Math.max(0, outer - inner)];
  });
}

function blurPass(data: Float32Array, width: number, height: number, radius: number, horizontal: boolean): Float32Array {
  const out = new Float32Array(data.length);
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const index = (line: number, offset: number): number => horizontal ? line * width + offset : offset * width + line;
  for (let line = 0; line < lines; line++) {
    let sum = 0;
    for (let offset = 0; offset <= radius && offset < length; offset++) sum += data[index(line, offset)]!;
    for (let offset = 0; offset < length; offset++) {
      out[index(line, offset)] = sum / (2 * radius + 1);
      if (offset - radius >= 0) sum -= data[index(line, offset - radius)]!;
      if (offset + radius + 1 < length) sum += data[index(line, offset + radius + 1)]!;
    }
  }
  return out;
}

export function softShadow(width: number, height: number, radius: number, pad = 40): Buffer {
  const w = width + pad * 2;
  const h = height + pad * 2;
  let alpha: Float32Array = new Float32Array(w * h);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) alpha[(y + pad) * w + x + pad] = coverage(x, y, width, height, radius);
  for (let pass = 0; pass < 3; pass++) {
    alpha = blurPass(alpha, w, h, 11, true);
    alpha = blurPass(alpha, w, h, 11, false);
  }
  return rgba(w, h, (x, y) => [0, 0, 0, Math.round(alpha[y * w + x]! * 0.6)]);
}

export function cachedPng(dir: string, key: unknown, make: () => Buffer): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${hashJson(key)}.png`);
  if (!existsSync(path)) writeFileSync(path, make());
  return path;
}
