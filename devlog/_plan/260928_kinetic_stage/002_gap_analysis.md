# 002 — Gap analysis: vid2 0.1 against the reference grammar

**Summary.** vid2 0.1 composites whole layers with ffmpeg filters. That is enough for footage, windows, captions and grades, but every
technique in 001 that makes the reference look designed animates *parts* of a layer (a word, a glyph, an icon inside a sentence) or
re-lays out content between states. ffmpeg filters cannot express per-token layout, springs or reflow without one overlay per token per
state, which explodes the graph and still cannot re-flow. The gap is closed by one new rendering primitive (a JS stage that draws each
frame) plus presets on top of it; transitions and sound need smaller, separate additions.

| Reference technique (001) | vid2 0.1 today | Gap | Closed by |
|---|---|---|---|
| Per-glyph typing with accent decay | text `type` (ASS \\k karaoke or cached reveal PNGs), one colour | no per-glyph colour/decay, no blur per glyph | 020 kinetic |
| Word entrances (rise+blur+fade) | whole-layer fade/rise/slam/pop/blur | per-word stagger impossible in one layer | 020 kinetic |
| Inline icons as words | none (separate media layers placed by hand) | no baseline-aligned image tokens | 020 kinetic |
| Magic-move reflow between states | none | no token identity across states | 020 kinetic |
| Container pill that resizes, camera follow | shape rect is static; camera only on media layers | no animated geometry | 010 stage + 020 |
| Reading highlight sweep | none | per-word colour over time | 020 kinetic |
| Scramble/decode text | none | per-glyph substitution | 020 kinetic |
| Field with caret, I-beam cursor, masking | cursor overlays only for capture tracks | no synthetic cursor or caret | 030 components |
| Bar chart with count-up | none | animated geometry + numbers | 030 components |
| Ticker list, chips, connector line draw | none | animated geometry + clipping | 030 components |
| Zoom-from-rect ("app opens"), iris, blur dissolve | xfade presets (fade, slides, wipes, circle crop...) | no rect-to-full zoom, no blur dissolve | 040 transitions |
| Sound following motion | cues placed by hand, 8 SFX presets | no cues derived from animation | 040 auto SFX |
| Scene temperature, pacing, one idea per frame | direction skill has general rules | no kinetic grammar, no template | 050 dogfood + skill |
| Scatter/echo with motion blur | scene motionblur (tmix) | fine for whole scenes | existing (docs only) |

## What stays

- ffmpeg stays the only external renderer and encoder; the stage produces an intermediate clip that ffmpeg composites.
- Text shaping reuses the opentype.js raster path (ADR-1); no browser, no native canvas.
- The RenderPlan stays plain JSON and replayable with `vid2 render plan.json`.
- Capture, assets (ima2 adapter), audio plan, QA and preview keep their contracts; new work extends them.
