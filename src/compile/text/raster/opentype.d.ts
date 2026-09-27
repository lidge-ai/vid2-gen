declare module "opentype.js" {
  export interface Command { type: "M" | "L" | "Q" | "C" | "Z"; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }
  export interface FontPath { commands: Command[] }
  export interface RenderOptions { kerning?: boolean; features?: Record<string, boolean> }
  export interface Glyph { advanceWidth?: number; getPath(x: number, y: number, fontSize: number): FontPath }
  export interface Font {
    charToGlyph(char: string): Glyph;
    getKerningValue(left: Glyph, right: Glyph): number;
    ascender: number; descender: number; unitsPerEm: number;
    getAdvanceWidth(text: string, size: number, options?: RenderOptions): number;
    getPath(text: string, x: number, y: number, size: number, options?: RenderOptions): FontPath;
  }
  const opentype: { parse(data: Buffer): Font };
  export default opentype;
}
