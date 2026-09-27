import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import { advanceWidth, textPath } from "./glyphs.ts";

// opentype.js 2 throws in ccmp for Instrument Serif (GSUB type 6 format 2); vid2 shapes glyph by glyph instead.
test("every bundled font lays out and outlines text without GSUB failures", () => {
  for (const name of ["Geist-Regular", "Geist-Black", "GeistMono-Regular", "InstrumentSerif-Regular", "InstrumentSerif-Italic"]) {
    const font = opentype.parse(readFileSync(fileURLToPath(new URL(`../../../../assets/fonts/${name}.ttf`, import.meta.url))).buffer);
    const text = "Made to move you. ffi fl 01 / FIND";
    const w = advanceWidth(font, text, 40);
    assert.ok(w > 300 && w < 1200, `${name} width ${w}`);
    assert.ok(textPath(font, text, 0, 40, 40).commands.length > 50, name);
    assert.ok(advanceWidth(font, "AV", 40) <= advanceWidth(font, "A", 40) + advanceWidth(font, "V", 40), `${name} kerning does not widen`);
  }
});
