import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecked } from "../shared/index.ts";
import { writeSheets } from "./sheet.ts";

void test("41 shots produce two indexed pages with ink in every label band", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vid2-sheet-"));
  try {
    const still = join(dir, "still.png");
    await runChecked("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90", "-frames:v", "1", "-y", still]);
    const shots = Array.from({ length: 41 }, (_, i) => ({ id: `shot-${String(i + 1).padStart(3, "0")}`,
      startFrame: i * 30, endFrame: (i + 1) * 30, startS: i, endS: i + 1, beats: 2 }));
    const result = await writeSheets(dir, shots, shots.map(() => still), "ffmpeg");
    assert.equal(result.sheets.length, 2);
    assert.deepEqual(result.cells[40], { page: 2, cell: 0, shotId: "shot-041", timeS: 40, beats: 2 });
    const index = JSON.parse(await readFile(result.sheetIndex, "utf8")) as { cells: unknown[] };
    assert.equal(index.cells.length, 41);
    for (const [pageIndex, path] of result.sheets.entries()) {
      const raw = await runChecked("ffmpeg", ["-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"]);
      const width = 1536;
      for (let cell = 0; cell < (pageIndex === 0 ? 40 : 1); cell++) {
        const x = (cell % 8) * 192, y = Math.floor(cell / 8) * 128 + 104;
        const pixels: number[] = [];
        for (let row = 0; row < 24; row++) for (let col = 0; col < 192; col++) {
          const offset = ((y + row) * width + x + col) * 4;
          assert.equal(raw.stdout[offset + 3], 255, `transparent label pixel ${pageIndex}:${cell}`);
          pixels.push(raw.stdout[offset]!);
        }
        assert.ok(Math.max(...pixels) > Math.min(...pixels), `blank label ${pageIndex}:${cell}`);
      }
      assert.equal(raw.stdout[(640 * width - 1) * 4 + 3], 255, "page background must be opaque");
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
