/** Resolve bundled or user-supplied fonts into the per-plan libass font directory. */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, parse } from "node:path";
import { Vid2Error, packageRoot } from "../../shared/index.ts";
import type { BuildContext } from "../ir.ts";

export type TextWeight = "regular" | "semibold" | "bold" | "black" | "italic";
export interface FontChoice { family: string; path: string; fontsDir: string }

const BUNDLED: Record<string, { family: string; files: Record<TextWeight, string> }> = {
  sans: { family: "Geist", files: { regular: "Geist-Regular.ttf", semibold: "Geist-SemiBold.ttf", bold: "Geist-Bold.ttf", black: "Geist-Black.ttf", italic: "Geist-Regular.ttf" } },
  mono: { family: "Geist Mono", files: { regular: "GeistMono-Regular.ttf", semibold: "GeistMono-Bold.ttf", bold: "GeistMono-Bold.ttf", black: "GeistMono-Bold.ttf", italic: "GeistMono-Regular.ttf" } },
  serif: { family: "Instrument Serif", files: { regular: "InstrumentSerif-Regular.ttf", semibold: "InstrumentSerif-Regular.ttf", bold: "InstrumentSerif-Regular.ttf", black: "InstrumentSerif-Regular.ttf", italic: "InstrumentSerif-Italic.ttf" } },
};
const FONT_EXT = new Set([".ttf", ".otf", ".ttc"]);

function systemFontDirs(): string[] {
  if (process.platform === "darwin") return ["/System/Library/Fonts", "/Library/Fonts", join(homedir(), "Library/Fonts")];
  if (process.platform === "win32") return [
    join(process.env["WINDIR"] ?? "C:\\Windows", "Fonts"),
    join(process.env["LOCALAPPDATA"] ?? join(homedir(), "AppData/Local"), "Microsoft/Windows/Fonts"),
  ];
  return ["/usr/share/fonts", join(homedir(), ".local/share/fonts")];
}

function key(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }

/** Filename-stem lookup, with a weight match preferred over the first family match. */
export function findSystemFont(family: string, weight: TextWeight): string | undefined {
  const familyKey = key(family);
  const matches: string[] = [];
  for (const root of systemFontDirs()) {
    if (!existsSync(root)) continue;
    for (const relative of readdirSync(root, { recursive: true })) {
      const path = join(root, String(relative));
      if (!FONT_EXT.has(extname(path).toLowerCase())) continue;
      if (key(parse(path).name).startsWith(familyKey) && statSync(path).isFile()) matches.push(path);
    }
  }
  return matches.find(path => key(parse(path).name).includes(key(weight))) ?? matches[0];
}

/** Warn before libass silently substitutes Latin-only bundled fonts for CJK glyphs. */
export function cjkFontWarning(text: string, fontId: string): string | undefined {
  if (!BUNDLED[fontId] || !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(text)) return undefined;
  return `CJK text with bundled Latin font "${fontId}" may need a custom font path or family`;
}

export function resolveFont(fontId: string, weight: TextWeight, ctx: BuildContext): FontChoice {
  const bundled = BUNDLED[fontId];
  const custom = ctx.fonts[fontId];
  let path: string;
  let family: string;
  if (bundled) {
    family = bundled.family;
    path = join(packageRoot(), "assets/fonts", bundled.files[weight]);
  } else if (custom?.path) {
    path = custom.path;
    family = custom.family ?? parse(path).name.replace(/[-_](Regular|Bold|SemiBold|Black|Italic)$/i, "");
  } else if (custom?.family) {
    family = custom.family;
    const found = findSystemFont(family, weight);
    if (!found) throw new Vid2Error("E_CAPABILITY", `font family not found: ${family}`, { fix: "Specify a font path or install the family on this system." });
    path = found;
  } else {
    throw new Vid2Error("E_SCHEMA", `unknown font: ${fontId}`);
  }
  if (!existsSync(path)) throw new Vid2Error("E_NOT_FOUND", `font file not found: ${path}`);
  const fontsDir = join(ctx.workDir, "fonts");
  mkdirSync(fontsDir, { recursive: true });
  const target = join(fontsDir, bundled ? basename(path) : `${key(fontId)}-${basename(path)}`);
  if (path !== target) copyFileSync(path, target);
  return { family, path: target, fontsDir };
}
