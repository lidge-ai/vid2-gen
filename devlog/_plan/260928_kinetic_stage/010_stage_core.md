# 010 — Stage engine core (wp2)

**Summary.** Add `src/stage/`, a deterministic frame-indexed 2D renderer, and a raw `stage` timeline layer. The compiler turns each
stage layer into a JSON `StageRender` entry of the RenderPlan; the runner materializes it (cached by content hash) into an FFV1
`bgra` Matroska clip before any segment that depends on it, and the segment overlays that clip exactly like a media layer. Nothing
else in the pipeline changes shape, so `vid2 compile` → `vid2 render plan.json` keeps working.

## Decisions (from architect STG-01..03, main dispositions in 000)

- Pure JS; no new runtime dependency. Glyph outlines come from `src/compile/text/raster/glyphs.ts`; images are decoded by ffmpeg
  (`-f rawvideo -pix_fmt rgba`, scaled to the node's pixel size) during materialization, never at compile time.
- Frame buffer is premultiplied RGBA (Float32 accumulation per sprite draw, Uint8 output), converted to straight alpha before encode
  because ffmpeg `overlay` expects straight alpha.
- Sprites: each node's content is rasterized once per (content, scale bucket) and blurred into levels {0,2,4,8,16,32 px} with a
  three-pass box blur; a frame's blur value mixes the two nearest levels. Scale buckets are powers of 2^(1/4) so a 0.6→1.0 pop reuses
  4 sprites and draws with bilinear sampling.
- Only dirty bounds are cleared and recomposited: the dirty region is the union of every changed node's previous and current
  draw rectangle, and **every** node (moving or stationary) whose rectangle intersects that region is redrawn in z-order, clipped to it.
  A frame with more than 40 % of the canvas dirty is recomposited in full.
  Dirty-rect reuse is valid only when the previous call rendered frame N−1 of the same spec. Any other entry (first frame, a seek, a
  single-frame render `renderStageFrame(spec, N)`) recomposites the whole canvas, so every frame is a pure function of (spec, N).
- Springs are analytic (critically/under-damped closed form) evaluated from the frame index, never integrated, so frame N is
  identical whether or not frames 0..N−1 were rendered (preview parity, cache hits).
- Stage clips render at the segment's internal rate (fps × motion-blur rate) and span the layer's frames; a layer ending at the scene
  end also covers the segment's 2 spare tail frames (holds the final state), so transitions never read past the clip.

## File change map

| File | Change |
|---|---|
| `src/stage/types.ts` (new) | `StageSpec {version:1,width,height,fps,frames,nodes,tracks,events,fonts,images}`, `StageNode` (`text`,`image`,`rect`,`icon`,`group`; common `key,parent?,x,y,anchorX,anchorY,scale,rotation,opacity,blur,z`), `Track {node,prop,keys:[{frame,value,ease}]}`, `StageEvent {frame,kind,sfx?}` |
| `src/stage/springs.ts` (new) | `springValue(t, {stiffness,damping,mass})` closed form, `settleTime` |
| `src/stage/tracks.ts` (new) | `evaluate(tracks, node, prop, frame)` with eases from `src/compile/ease.ts` + `spring`; colour interpolation in linear light |
| `src/stage/raster.ts` (new) | rounded-rect coverage (analytic SDF, 1 px AA), stroke-polyline coverage (for icons), glyph run coverage via existing rasterizer |
| `src/stage/sprites.ts` (new) | sprite build + blur levels + LRU cache keyed by content hash and scale bucket |
| `src/stage/composite.ts` (new) | premultiplied buffer, bilinear affine draw with opacity, dirty-rect tracking, straight-alpha export |
| `src/stage/scene.ts` (new) | per-frame evaluation of the node tree (group transforms, z order) into a draw list |
| `src/stage/images.ts` (new) | ffmpeg decode of PNG/JPEG/WebP to RGBA at a target size via `spawn` streaming stdout into a preallocated buffer of exactly W×H×4 bytes (error if more or fewer); memoized per (file content hash, size) |
| `src/stage/encode.ts` (new) | ffmpeg child: `-f rawvideo -pix_fmt rgba -s WxH -r R -i - -c:v ffv1 -level 3 -pix_fmt bgra -f matroska`, stdin backpressure |
| `src/stage/materialize.ts` (new) | `materializeStage(render, tool)`: cache lookup (`cacheDir("stage")`), render, verify (frames, `bgra`), atomic publish, copy to `render.out` |
| `src/stage/index.ts` (new) | boundary exports |
| `src/timeline/schema.ts` | `StageLayer` (strict): `nodes[]`, `tracks[]` with `at` TimeLiteral relative to layer start, `events[]`, span; add to `Layer` union |
| `src/timeline/validate.ts` | unique node keys, parent/track node references exist, image nodes reference `image` sources, fonts exist |
| `src/compile/ir.ts` | `StageRender {id,hash,spec,out,frames,width,height,rate}`; `RenderPlan.stageRenders`; `SegmentPlan.stageDeps: string[]`; `BuildContext.stages` collector |
| `src/compile/layers/stage.ts` (new) | authored stage layer → `StageSpec` (scale by `ctx.scale`, frames at internal rate, font/image paths resolved), registers render, adds `video` input for `out`, returns overlay output shifted to layer start |
| `src/compile/segment.ts`, `plan.ts` | dispatch `stage` in `buildLayer`; collect `stageRenders` and per-segment deps; capability check requires ffv1 encoder/decoder and matroska |
| `src/render/runner.ts` | `materializeStages(plan, ids)` before the segment pool and inside `renderSegments` (deps only) |
| `src/cli/commands/plan-shared.ts` | plan loader normalizes 0.1 plans: missing `stageRenders` → `[]`, missing `SegmentPlan.stageDeps` → `[]`; the missing-input check (`plan-shared.ts:52`) adds every `stageRenders[].out` to the set of render outputs (like audio renders) and instead checks each stage spec's font and image paths exist |
| `src/qa/preview.ts` | no code change expected (uses `renderSegments`); verified by test |
| `schema/timeline.v1.json` | regenerated (`node scripts/schema-json.mjs`) |
| `structure/stage.md` (new), `INDEX.md`, `compiler.md`, `render.md`, `timeline.md` | contract docs |

Field chain (PLAN-FIELD-CHAIN-01) for `RenderPlan.stageRenders`: creation `compile/layers/stage.ts` → serialization: plain JSON via
`vid2 compile -o` (`src/cli/commands/compile.ts`) → deserialization: `render` command loads plan JSON (`plan-shared.ts`); a plan
without `stageRenders` (0.1 plans) is read as `[]` → consumers: `runner.ts` (materialize), `renderSegments` (deps), cache key
(segment input hashing already hashes the clip file). For the `stage` layer type: creation schema → resolve (`resolvedLayer`
generic path) → validate → `buildLayer` switch (exhaustive; tsc fails on a missing case) → `checkCapabilities`.

## Acceptance (C activation scenarios)

1. **Moving rect**: timeline with a red background and a stage rect keyed x 100→900 over 1 s (`inout`). Render final profile; frame
   15's pixel at the analytic midpoint is the rect colour ±3, a pixel 30 px outside is red. (`src/stage/stage-render.test.ts`)
2. **Alpha round trip**: stage rect at opacity 0.5 white over black → segment pixel ≈ 128 ±3 (proves straight/premultiplied handling
   and that FFV1 bgra alpha survives the overlay).
3. **Spring determinism**: `springValue` at frame N equals a fresh evaluation; sampled overshoot for damping ratio 0.6 within 1 % of
   the closed form; frame-N render of a stage clip rendered alone equals frame N of the full clip (preview parity via `vid2 preview`).
4. **Cache**: second render reports the stage cached (logger event `stage` with `cached:true`) and does not spawn the stage encoder.
5. **Plan replay**: `vid2 compile t.json -o p.json` then `vid2 render p.json` in a fresh process produces the same frame hash.
6. **Missing capability**: fake FfmpegInfo without ffv1 → `E_CAPABILITY` exit 3 naming ffv1.
7. **Validation**: duplicate node key and a track on an unknown node → `vid2 validate` fails with the existing public contract (`E_INPUT`, exit 2) and `details.issues` carrying `E_SCHEMA`-coded issues with paths (`scenes.0.layers.0.nodes.1.key`, `...tracks.0.node`).
9. **Dirty-rect correctness**: text moving across a stationary pill; every frame of the dirty-rect render equals a full-recomposite
   render of the same frame (byte-equal buffers, test flag forces full recomposite).
   Seek case: `renderStageFrame(spec, 37)` rendered cold (no prior frames) equals frame 37 of the sequential render, where frame 37
   contains a stationary pill and an image node that stopped moving at frame 20 (the icon variant is tested in 020).
10. **Image invalidation**: replacing an image source with different content of the same size and restoring its mtime changes the
   stage hash and the rendered pixels.
11. **0.1 plan replay**: a committed 0.1-format plan fixture without `stageRenders` renders through `vid2 render plan.json`.
8. **Performance** (`scripts/bench-stage.mjs`, recorded in D, not a CI gate): 1080p 90-frame stage with 30 text tokens + 5 rects
   renders at ≥ 30 fps on the dev machine.

Verifiers: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` (scripts/test.mjs discovers `src/**/*.test.ts`, so new
tests are read), `npm run privacy:scan`, `node scripts/schema-json.mjs --check` via the drift test.

## wp2 P revalidation (2026-09-28)

Previous D (wp1): roadmap locked and audited; direction unchanged: build the render primitive first. Revalidated against the source at
86487a90: `requireFeatures` already supports `encoders` (`src/probe/requirements.ts:6`) and `FfmpegInfo` exposes `encoders`/`decoders`
sets, so the capability check is `encoders: ["ffv1"]` plus decoder presence via `info.decoders.has("ffv1")` (new
`decoders` field in `FeatureRequirements`); `scripts/test.mjs` discovers `src/**/*.test.ts` recursively, so `src/stage/*.test.ts` runs in
`npm test`. Implementation notes fixed at P:

- Sprites are **coverage masks** (Float32 0..1) for text, rect fill, rect stroke, shadow and glow; colour is applied at draw time, so
  colour tracks (accent decay) never re-rasterize. Images are RGBA sprites.
- Rect geometry (width/height/radius) animates by re-rasterizing the rect mask when those values change (cheap analytic SDF); text and
  image sprites are reused across frames.
- Scale buckets: content is rasterized at bucket 2^(k/4) ≥ the node's effective scale (max 4), then drawn with residual scale ≤ 1.
- Matroska output is written with `-fflags +bitexact -flags:v +bitexact` so identical frames give identical files (segment cache keys
  hash the clip bytes).
- The `icon` node kind and the built-in icon set arrive with 020; 010 ships `text`, `image`, `rect`, `group`.
- Authored stage keys use `at` (TimeLiteral, relative to the layer start); compile converts to stage frames with `toFrames(at) × rate`.

wp2 tasks: t1 renderer core (types, springs, tracks, raster, sprites, composite, scene, images, encode, materialize); t2 schema +
validation + JSON schema; t3 compiler integration (IR, stage layer builder, plan, capability check) and plan loader normalization; t4
runner/preview materialization + logger events; t5 tests 010 #1–11 + bench script; t6 structure docs (stage.md, INDEX, compiler,
render, timeline) and skills reference stub.
- Stage cache key = hash(canonical spec, STAGE_VERSION, ffmpeg version, content hash of every referenced font file and image file).
  Acceptance 10 also covers fonts: replacing a font file at the same path with different content changes the key.

Reflection (architect 01a0e4f2, wp2): ALIGNED with two gaps, both folded (cold-seek test uses an image node; font content in the stage
cache key + same-path font replacement test).
- Keyframe semantics (`src/stage/tracks.ts`): an ordinary key is the value reached at its frame, eased from the previous key; a spring
  key is a release at its frame from the track's current value toward its own value; a spring key that is the track's first key springs
  from the node's authored base property (e.g. `x` of the node), so no track ever jumps. Test: a single spring key at frame 10 on `x`
  (base 100 → 500) holds 100 until frame 10 and then moves continuously (|x(f+1) − x(f)| < 80 px = 20 % of the travel per frame at 30 fps).

Audit wp2 round 1 (reviewer 01a0e4fa): FAIL, 2 High — first-key spring start value; validation exit contract — both folded above.
