/** Eight-by-five contact pages with rasterized label bands. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { encodePng } from "../compile/png.ts";
import { runChecked, packageRoot } from "../shared/index.ts";
import { textMask } from "../stage/raster.ts";
import type { ShotSpan } from "./types.ts";

const CELL_W = 192, IMAGE_H = 104, BAND_H = 24, COLS = 8, ROWS = 5;
const PAGE_W = CELL_W * COLS, PAGE_H = (IMAGE_H + BAND_H) * ROWS;
const FONT = join(packageRoot(), "assets/fonts/Geist-SemiBold.ttf");
const BACKGROUND = 18, BAND = 30, INK = 244;
export interface SheetCell { page: number; cell: number; shotId: string; timeS: number; beats: number | null }

/** Opaque dark page: an RGBA canvas left at zero is transparent, which hid every label (viewers show it as white). */
function blankPage(): Uint8Array {
  const canvas = new Uint8Array(PAGE_W * PAGE_H * 4);
  for (let offset = 0; offset < canvas.length; offset += 4) {
    canvas[offset] = BACKGROUND; canvas[offset + 1] = BACKGROUND; canvas[offset + 2] = BACKGROUND; canvas[offset + 3] = 255;
  }
  return canvas;
}

function label(canvas: Uint8Array, x: number, y: number, text: string): void {
  for (let row = 0; row < BAND_H; row++) for (let col = 0; col < CELL_W; col++) {
    const offset = ((y + IMAGE_H + row) * PAGE_W + x + col) * 4;
    canvas[offset] = BAND; canvas[offset + 1] = BAND; canvas[offset + 2] = BAND; canvas[offset + 3] = 255;
  }
  const mask = textMask(FONT, text, 13, 0, [...text].length, 1, 0);
  for (let row = 0; row < Math.min(mask.height, BAND_H - 4); row++) for (let col = 0; col < Math.min(mask.width, CELL_W - 8); col++) {
    const alpha = mask.data[row * mask.width + col]!;
    if (alpha <= 0) continue;
    const offset = ((y + IMAGE_H + 4 + row) * PAGE_W + x + 4 + col) * 4;
    for (let channel = 0; channel < 3; channel++) canvas[offset + channel] = Math.round(BAND * (1 - alpha) + INK * alpha);
  }
}

async function cellImage(path: string, ffmpeg: string): Promise<Buffer> {
  const result = await runChecked(ffmpeg, ["-v", "error", "-i", path,
    "-vf", `scale=${CELL_W}:${IMAGE_H}:force_original_aspect_ratio=decrease,pad=${CELL_W}:${IMAGE_H}:(ow-iw)/2:(oh-ih)/2`,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  if (result.stdout.length !== CELL_W * IMAGE_H * 3) throw new Error("contact cell decode returned unexpected size");
  return result.stdout;
}

function paste(canvas: Uint8Array, image: Buffer, x: number, y: number): void {
  for (let row = 0; row < IMAGE_H; row++) for (let col = 0; col < CELL_W; col++) {
    const source = (row * CELL_W + col) * 3;
    const target = ((y + row) * PAGE_W + x + col) * 4;
    canvas[target] = image[source]!; canvas[target + 1] = image[source + 1]!;
    canvas[target + 2] = image[source + 2]!; canvas[target + 3] = 255;
  }
}

export async function writeSheets(out: string, shots: (ShotSpan & { beats: number | null })[],
  keyframes: string[], ffmpeg: string): Promise<{ sheets: string[]; sheetIndex: string; cells: SheetCell[] }> {
  const dir = join(out, "sheets");
  await mkdir(dir, { recursive: true });
  const cells: SheetCell[] = [], sheets: string[] = [];
  for (let first = 0; first < shots.length; first += COLS * ROWS) {
    const page = first / (COLS * ROWS) + 1;
    const canvas = blankPage();
    for (let i = 0; i < COLS * ROWS && first + i < shots.length; i++) {
      const shot = shots[first + i]!, x = (i % COLS) * CELL_W, y = Math.floor(i / COLS) * (IMAGE_H + BAND_H);
      const image = await cellImage(keyframes[first + i]!, ffmpeg);
      paste(canvas, image, x, y);
      const beats = shot.beats === null ? "?b" : `${shot.beats.toFixed(1)}b`;
      label(canvas, x, y, `${shot.id} ${shot.startS.toFixed(2)}s ${beats}`);
      cells.push({ page, cell: i, shotId: shot.id, timeS: shot.startS, beats: shot.beats });
    }
    const path = join(dir, `page-${String(page).padStart(3, "0")}.png`);
    await writeFile(path, encodePng(PAGE_W, PAGE_H, 4, canvas));
    sheets.push(path);
  }
  const sheetIndex = join(dir, "sheet.json");
  await writeFile(sheetIndex, JSON.stringify({ version: 1, columns: COLS, rows: ROWS, cells }, null, 2) + "\n");
  return { sheets, sheetIndex, cells };
}
