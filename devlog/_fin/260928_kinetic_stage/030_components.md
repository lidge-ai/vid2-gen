# 030 — UI component presets (wp4, part 1)

**Summary.** Four presets rebuild the UI moments of the reference as sharp vector motion, all compiled to stage nodes: `field`
(input with typing, caret, synthetic I-beam/hand cursor with click ripple, optional masking), `bars` (bar chart that grows with a
glow and counts values up), `ticker` (fixed prefix + slot-machine list of items with icon swap and depth fade) and `chips` (pills
with icon + text entering in sequence, joined by connector lines drawn with a travelling dot). They share one style block
(`fill`, `stroke`, `radius`, `glow`, `text`, `accent`) so a film has one visual system.

## Authored shapes (strict; all positions in authored px, span fields as usual)

- `field`: `{x,y,width,height=76,radius=999,grow?:{maxWidth, padX=36},placeholder?,size=34,typing:[{at,text,glyph="0.045s"}],
  clear?:at,mask?:{at,char="•"}, accent?:{color, decay="0.3s"}, caret:true, cursor?:{style:"ibeam"|"arrow"|"hand", from:{x,y}, at,
  click?:at}, style}`. With `grow`, `width` is the starting width and the field widens on the move spring to fit typed text + `padX`,
  up to `maxWidth` (anchored by `x` as its centre); `accent` tints each typed glyph and decays exactly as in the kinetic layer (shared
  helper in `entrances.ts`).
- `bars`: `{x,y,width,rowHeight=44,gap=14,items:[{label,note?,value,highlight?}],max=100,unit="%",grow="0.8s",stagger="0.12s",
  countUp=true, style}`; highlight rows use `style.accent` + glow.
- `ticker`: `{x,y,prefix?,items:[{text,icon?}],interval="0.55s",visible=4,size=64,align="left", style}`; the active row is full
  colour, following rows dim by depth (opacity 0.45, 0.25, 0.12) and slide up on a spring each interval.
- `chips`: `{x,y,direction:"column"|"row",gap=18,items:[{at,text,icon?,note?}],connector?:{from:{x,y},dot:true}, style}`.

## File change map

| File | Change |
|---|---|
| `src/stage/presets/{field,bars,ticker,chips}.ts` (new) | preset → nodes/tracks/events |
| `src/stage/presets/style.ts` (new) | shared style defaults (dark and light variants) |
| `src/stage/icons/cursors.ts` (new) | I-beam, arrow and hand cursor paths |
| `src/stage/raster.ts` | stroke with partial length (`progress` 0..1) for connector draw |
| `src/timeline/schema.ts`, `validate.ts` | four strict layer objects + checks (typing times inside span, items non-empty) |
| `src/compile/layers/stage.ts` | dispatch |
| `structure/stage.md`, skills timeline reference | docs |

## Acceptance

1. **field**: glyph count visible at a frame follows `glyph` timing; caret x equals the text advance ±2 px; `mask` replaces glyphs with
   bullets (pixel hash differs from plain and equals a bullet-only render); cursor click emits a `click` event at its frame.
   With `grow`, the field's pill width is monotonic non-decreasing while typing and ends at text width + 2 × padX ±2 (≤ maxWidth);
   with `accent`, the newest glyph's colour matches the kinetic accent test (020 #3).
2. **bars**: the highlighted bar's width at `grow` end equals value/max × width ±2; the drawn number at mid-grow is between 0 and value;
   bars start in stagger order.
3. **ticker**: at k × interval + settle the active row shows item k (pixel hash equals a static render of item k in that row).
4. **chips**: connector length drawn is proportional to progress; chip k becomes visible at its `at`.
5. Each preset renders in dark and light style with text contrast ≥ 4.5:1 for text under 40 px and ≥ 3:1 above. QA change: stage
   layout is a pure function of the resolved timeline and fonts, so `src/stage/index.ts` exports
   `stageTextBoxes(layer, {fonts: timeline.fonts, baseDir, width, height, fps})` (the same font resolution the compiler uses)
   returning `{absoluteFrame, box, color, size}` for every text node at its settle frame. `src/qa/checks.ts` `textIssues` (today it skips
   non-text layers at `checks.ts:90`) also iterates stage-family layers through that function and samples the background just outside
   each box on that frame, with the size-dependent threshold. Severity stays `warn` as for existing text (QA policy: contrast is
   advisory); `vid2 qa --json` reports it under `issues`. Test (`src/qa/stage-contrast.test.ts`): a `#D1D1D6` 30 px field text on a white
   scene yields a CONTRAST issue with measured < 4.5; the default dark field yields none. The dogfood gate (050) requires zero open
   contrast issues. A second case uses a custom timeline font (bundled Instrument Serif declared as a custom font entry) to prove the
   font map reaches layout.
