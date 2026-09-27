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
