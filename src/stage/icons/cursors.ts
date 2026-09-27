/** Pointer glyphs for synthetic cursors, as 24×24 path data (filled shapes drawn as strokes + fill rects by the presets). */
export const CURSORS: Record<"ibeam" | "arrow" | "hand", string[]> = {
  ibeam: ["M9 3h6", "M9 21h6", "M12 3v18"],
  arrow: ["M4 3l15 7.5-6.5 1.8L10.5 19z"],
  hand: ["M9 11V5a1.5 1.5 0 0 1 3 0v5", "M12 10V4a1.5 1.5 0 0 1 3 0v6", "M15 10V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.6 13.7a1.5 1.5 0 0 1 2.4-1.8L9 15"],
};
