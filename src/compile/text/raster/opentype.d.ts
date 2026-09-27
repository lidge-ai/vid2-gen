declare module "opentype.js" {
  export interface Command { type: "M" | "L" | "Q" | "C" | "Z"; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }
  export interface FontPath { commands: Command[] }
  export interface Font {
    ascender: number; descender: number; unitsPerEm: number;
    getAdvanceWidth(text: string, size: number, options?: { kerning?: boolean }): number;
    getPath(text: string, x: number, y: number, size: number, options?: { kerning?: boolean }): FontPath;
  }
  const opentype: { parse(data: Buffer): Font };
  export default opentype;
}
