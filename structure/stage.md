# Stage (motion graphics)

A stage layer is a small animated scene drawn by vid2 itself, frame by frame, in pure JavaScript, then composited by ffmpeg like any
other layer. It exists for motion that ffmpeg filters cannot express: words and glyphs that move independently, layouts that re-flow,
UI components that grow and count. Presets such as `kinetic` (020) and `field`/`bars`/`ticker`/`chips` (030) compile to the same
model, so everything here applies to them too.

```text
authored stage layer ──compile/layers/stage.ts──► StageSpec (JSON, profile-scaled, stage frames) ──► RenderPlan.stageRenders[]
render: materializeStages (render/stages.ts) ─► cache hit? copy : StageRenderer frames ─► ffmpeg rawvideo rgba ─► FFV1 bgra .mkv
segment: -i stage-<hash>.mkv → fps → format=rgba → setpts +start → overlay (like a media layer)
```

## Model (`src/stage/types.ts`)

- **Nodes**: `text` (font file, size normalized like libass, colour, letter spacing, optional `reveal` glyph count), `image` (decoded by
  ffmpeg to RGBA at the largest scale bucket used), `rect` (rounded, fill, inner stroke, shadow, glow), `icon` (stroke paths in a 24×24
  view box, partial `progress` for line drawing), `group` (transform parent with an optional rounded clip). Common properties: `x`,
  `y`, `anchorX`/`anchorY` (fraction of the node's own box), `scale`, `scaleX`, `scaleY`, `rotation` (degrees), `opacity`, `blur` (px),
  `z` (paint order; ties keep declaration order).
- **Tracks** animate one property of one node. An ordinary key is the value reached at its frame, eased from the previous key
  (`linear|in|out|inout|punch|hold`). A `spring` key is a release: at its frame the value starts from wherever the track is and settles
  toward the key's value (closed-form damped spring, so any frame is computable directly). A first spring key starts from the node's
  authored property. Colour tracks interpolate in linear light.
- **Events** mark frames for sound (`glyph`, `token`, `icon`, `click`, `grow`, `state`, `tick`); they are converted to absolute output
  frames during compile and feed `audio.autoCues` (040).

## Renderer (`src/stage/`)

| File | Role |
|---|---|
| `raster.ts` | analytic rounded-rect coverage, glyph runs through the raster text rasterizer, stroked polylines, three-pass box blur |
| `sprites.ts` | coverage-mask sprites per (content, scale bucket 2^(k/4), blur level 0/2/4/8/16/32); images are premultiplied RGBA |
| `scene.ts` | evaluates tracks, composes group transforms/opacity/clips, emits draw items in paint order |
| `composite.ts` | premultiplied float canvas, bilinear affine drawing, straight-alpha export |
| `render.ts` | frame loop: consecutive frames recomposite only the dirty region (every item intersecting it is redrawn); any other entry recomposites fully, so frame N depends only on (spec, N) |
| `encode.ts` | rawvideo RGBA over stdin with backpressure → `ffv1 -level 3 -pix_fmt bgra`, Matroska, bit-exact |
| `images.ts` | ffmpeg decode to an exact RGBA size through a bounded stream |
| `icons/path.ts` | SVG path data (M/L/H/V/C/S/Q/T/A/Z) to polylines |

Colour is applied when a mask is drawn, so colour animation never re-rasterizes. Blur mixes the two nearest precomputed levels.
Throughput (`node scripts/bench-stage.mjs`, 1080p, 30 animated words + 5 springing pills): 77 fps on an Apple M-series laptop,
before encoding.

## Plan, cache and render

`StageRender { id, hash, spec, out, frames, width, height }` lives in `RenderPlan.stageRenders`; each `SegmentPlan.stageDeps` lists the
clips it reads. The clip spans the layer at the segment's internal rate (fps × motion-blur rate) and, when the layer reaches the scene
end, also the two spare tail frames. The runner materializes all clips before segments (`renderPlan`) or only the dependencies of
requested segments (`renderSegments`, used by preview). The cache key is the canonical spec with font and image paths replaced by
their content hashes, plus the renderer version and the ffmpeg version; entries live in `cacheDir("stage")`. Every clip is verified
(size, frame count ±1, `bgra`) before it is published. Plans compiled by 0.1 have no stage fields; the plan loader fills them with
empty lists. Compiling a timeline with a stage layer requires the `ffv1` encoder and decoder (`E_CAPABILITY` otherwise).

## Validation

Duplicate node keys, a parent that is not a group, tracks on unknown nodes, properties a node kind cannot animate, colour/number
mismatches, image nodes without an image source and unknown fonts are reported by `validateTimeline` as `E_SCHEMA` issues with paths
(`vid2 validate` fails with `E_INPUT` and lists them).

## Kinetic typography (`kinetic` layer)

`src/compile/layers/kinetic.ts` turns the authored layer into a `KineticConfig` (seconds, authored px, resolved font and icons) and
`src/stage/presets/kinetic.ts` writes it into a `SpecBuilder` (`presets/builder.ts`), which converts to stage frames and profile
pixels once. The rest of the pipeline treats the result as a stage clip.

- **Tokens** (`presets/tokens.ts`): `text` is split on whitespace; `{name}` is an icon token (a built-in icon or an `image` source id);
  a newline starts a new line. Default keys are the lowercased word (or `icon:name`) plus `#occurrence`, so the same word in the next
  state is the same actor. Explicit `tokens` may set `key`, `color`, `accent`, per-token `enter` and `newline`.
- **Layout** (`presets/layout.ts`): kerned widths from the raster font code, icons at 0.82 × size × `iconScale`, greedy wrap at
  `maxWidth`, per-line alignment around (`x`, `y`).
- **Actors** (`presets/kinetic.ts`): a key present in consecutive states springs to its new box at the state time (magic move); new
  tokens stagger in reading order and wait `exit.duration` when something leaves in that state; a key that returns later is a new actor.
  Word styles (`rise`, `blur`, `fade`, `pop`, `none`) animate one text node; glyph styles (`drop`, `type`, `scramble`) put one node per
  glyph at its kerned advance. `scramble` uses `TextNode.scramble`, evaluated by the renderer (seeded characters every 2 frames until
  the glyph resolves). `accent` tints each new word/glyph and decays; `highlight` dims tokens and sweeps them to full colour.
- **Framing** (`presets/kinetic-frame.ts`): the pill is a rect under the tokens (z −1) keyed to the on-screen extent at every entrance;
  camera follow shifts the token group so the newest token stays `margin` inside `x ± camera.width/2`, starting 0.15 s early; `expand`
  grows a plate (the icon's image, or a `fill` rect over a growing stroke icon) from the token's evaluated on-screen box to the target
  (z 10). Geometry springs are critically damped so pills and plates never overshoot; token moves use the authored `move` spring.
- **Sound events**: `token`, `icon`, `glyph` (every third typed glyph), `state` (≥ 3 actors move), `grow` (expand).
- **Icons** (`src/stage/icons/lucide.ts`): 58 Lucide icons (ISC, `assets/icons/LICENSE-lucide.txt`) as 24×24 path data, drawn as round
  strokes; `vid2 capabilities` lists the names.
- **Validation** (`src/timeline/validate-kinetic.ts`): unknown icons, empty states, duplicate keys in one state, an `expand` token not on
  screen, and (on resolved frames) states out of order or at/after the layer end. It imports the dependency-free token and icon tables
  from `src/stage` so validation and compilation tokenize identically.

## UI components (`field`, `bars`, `ticker`, `chips`)

`src/compile/layers/components.ts` resolves fonts, icons and times, and calls the presets in `src/stage/presets/{field,bars,ticker,chips}.ts`
on a `SpecBuilder`. All four share `presets/style.ts` (`theme: dark|light` plus per-layer overrides of fill, stroke, radius, glow, text,
muted, accent, track, shadow).

Repeated durations retain authored seconds until each cumulative timestamp reaches `SpecBuilder.frame()`: field glyph periods,
bars stagger, ticker intervals, kinetic word/glyph stagger and highlight sweep. Absolute anchors retain output-frame quantization;
the final stage clock includes the motion-blur rate. A 45 ms glyph period at 30 fps therefore places glyph index 9 at frame 12,
not frame 9. Explicit zero glyph periods reveal the entry together; positive subframe periods are not replaced with defaults.

- **field**: pill (fill, stroke, glow, shadow) with an optional placeholder; typed glyphs are one text node each, revealed at their
  typing time and tinted by `accent` (decays); `grow` widens the pill (critically damped, centred on `x`) to text + 2·padX up to
  `maxWidth`; the caret rect follows the advance and blinks when idle; `mask` swaps glyphs for evenly spaced bullets; `clear` fades
  them; `cursor` (I-beam, arrow or hand from `src/stage/icons/cursors.ts`) glides to the field, and `click` scales it and emits a ripple
  and a `click` event. Events: `glyph` every third character, `click`.
- **bars**: per row a track, a bar growing (ease out) to value/max × width in stagger order, the highlighted row in the accent colour
  with a glow, a label and note inside the bar, and a value that counts up through `TextNode.counter` (renderer-evaluated). Event:
  `grow` when the highlighted bar finishes.
- **ticker**: an optional prefix and a column of items (optional icon) that rolls up one row per `interval` on the move spring; depth
  opacity 1 / 0.45 / 0.25 / 0.12, rows above the active one fade out. Event: `tick` per step.
- **chips**: pills (icon, text, note) entering at their `at` with a slide, fade and blur; an optional connector is a `path` node (SVG path
  in node pixels, drawn by `progress`) from `connector.from` to the chip, with a travelling dot. Event: `token` per chip.

The `path` node kind (`types.ts` `PathNode`) draws an arbitrary stroked path inside explicit bounds. The renderer evaluates text in
counter → keyed → timecode → scramble order. `keyed` interpolates or holds numeric keys in stage frames and formats fixed decimals,
signed integer padding, prefix and suffix. `timecode` uses an absolute output-frame base and HUD-start origin; elapsed mode prints
non-drop `HH:MM:SS:FF` at `round(fps)` and frames mode prints the absolute output frame.

## Timeline HUD

`src/stage/presets/hud.ts` builds a full-frame HUD clip at output fps, profile-scaled once. Four L-brackets sit at the authored
margin (arm = 1.5 × size, stroke = max(2, size / 14)); label and right-aligned counter sit inside the top brackets. Timecode is at
bottom-left, above a ticker when present. The ticker is a full-width bottom strip whose item text switches at its resolved frame.
The font is resolved through `resolveFont(font, "regular", ctx)`; `mono` selects bundled Geist Mono. The HUD emits no stage events or
automatic sound cues.

`src/compile/layers/hud.ts` splits the HUD span into contiguous stage renders of at most `hudChunkSeconds` (default 20). Each chunk
has a distinct hash and is registered in the plan stage map. Counter keys and ticker item frames shift by the chunk's absolute start,
while timecode keeps its absolute base and HUD origin. Post joins chunk inputs with `concat` and overlays the HUD across its half-open
timeline span after look, overlays and root effects. Because this happens after scene joins, cuts and fades do not blend duplicate HUDs.

## QA

`src/compile/layers/stage-text.ts` compiles each stage-family layer at scale 1 (fonts resolved into `cacheDir("qa-fonts")`) and
`src/stage/settle.ts` samples each text node after 0.4 s of full opacity and completion of its color keys. `vid2 qa` scales those
parent-transformed boxes to output dimensions and warns when they cross the 5% title-safe margin. It also samples the background
just outside each box and warns below 4.5:1 (authored text under 40 px) or 3:1. Safety does not depend on color parsing.

These are first-opaque-hold samples, not proof of geometric settling, every reflow state, collisions, or every transition frame.
Text that never reaches the sampled hold may have no box. Inspect event boundaries and readable holds in preview and the encoded
video; a clean sampled report alone does not establish complete motion or readability coverage.
