# Text backends

Text uses the same timeline fields in either renderer. Compilation selects libass when the probed FFmpeg has it; otherwise it selects the raster backend. `VID2_TEXT_BACKEND=ass|raster` forces a choice. Both backends use the bundled Geist, Geist Mono, and Instrument Serif files, or the timeline's custom font path/family. Font paths resolve through `src/compile/text/fonts.ts` and are copied into the plan work directory.

The ASS backend batches consecutive text layers into one subtitle file and inserts its `ass` filter at that run's position in layer order. Its style and dialogue entries carry color, alignment, box, shadow, timing, and animation overrides. It requires libass.

The raster backend parses those same TTFs with `opentype.js`, wraps text using kerning-aware widths, flattens quadratic and cubic glyph paths, and fills contours with non-zero winding and four vertical samples per pixel. It composites color, a padded rounded box, and blurred shadow into a cached RGBA PNG. Each text layer is then a separate overlay at its authored position. Text size is normalized by the font's ascent and descent to match libass placement.

Fade, rise, slam, and pop animate the PNG stream with core FFmpeg fade, overlay, and scale filters. Blur crossfades a blurred PNG into the sharp image. Type and wipe use a short sequence of cached reveal PNGs joined at the internal frame rate; their input PTS is shifted to the scene-relative layer start only after the animation. This path uses no libass, freetype, drawtext, or frei0r filters. Compilation preserves the original layer span and order in both backends.
