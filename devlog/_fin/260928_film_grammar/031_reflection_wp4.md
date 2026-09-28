# WP4 reflection (architect of 006), main 0b7871be. Workers run typecheck and eslint only; CI runs the tests.

## 1. Three workers, disjoint write scopes (after main commits the shared file in section 2)
- **W1: timeline and docs.**
  - Code: src/timeline/schema.ts (root `look`, root overlays union), types.ts (import only), resolve.ts (new `resolvedHud`: span plus keys/items to absolute frames), validate.ts (+ new validate-hud.ts), schema.test.ts, validate.test.ts, schema/timeline.v1.json (`npm run schema:json` is a script, not a test).
  - Docs: skills/vid2-direction/{SKILL.md, references/edit-rhythm,color-script,review-rubric,sound-cues,reference-films.md}, skills/vid2-timeline/references/{time,recipes,schema}.md, skills/vid2-audio/SKILL.md, structure/{timeline,skills}.md, README.
- **W2: looks and post plan.** src/compile/looks.ts + looks.test.ts; src/compile/plan.ts (post order, early return, `checkCapabilities` look filters and "hud"); plan.test.ts; src/compile/segment.ts (`STAGE_FAMILY` adds "hud"); src/cli/commands/compile.ts (post summary adds look and hud); tests/e2e/looks-hud.test.ts; structure/compiler.md.
  - src/probe/requirements.ts needs **no change**: `requireFeatures` is generic (:11-21), and plan.ts passes the look filter names. Drop it from the file map.
- **W3: HUD stage.** src/stage/scene.ts (keyed number and timecode evaluation in `scrambled()`, :90-103); src/stage/presets/hud.ts + hud.test.ts; src/compile/layers/hud.ts (StageRender chunks, and the HUD's placement in the post graph); structure/stage.md.
- **After merge, main owns** examples/looks-hud and `npm run build` (skills manifest).

## 2. Contracts a worker would otherwise guess: main writes these before dispatch
New file src/timeline/film.ts. It imports only primitives.ts (Color, TimeLiteral, Span at :4-6), which avoids an import cycle with schema.ts.
```ts
export const Look = z.strictObject({ preset: z.enum(["film","riso","paper"]), palette: z.array(Color).min(2).max(6).optional(),
  strength: z.number().min(0).max(1).default(1), seed: z.number().int().min(0).max(2147483647).default(0) });
export const RISO_DEFAULT = ["#1B1B1B","#FF48B0","#0078BF","#F2EDE4"] as const; // palette only valid for riso: validate issue look.palette otherwise
const HudKey = z.strictObject({ at: TimeLiteral, value: z.number() });
const HudItem = z.strictObject({ at: TimeLiteral, text: z.string().min(1).max(120) });
export const HudOverlay = z.strictObject({ type: z.literal("hud"), ...Span, font: z.string().default("mono"),
  size: z.number().positive().default(28), color: Color.default("#F5F5F2"), accent: Color.optional(), margin: z.number().min(0).default(48),
  corners: z.boolean().default(true), label: z.string().min(1).max(60).optional(),
  counter: z.strictObject({ keys: z.array(HudKey).min(1), mode: z.enum(["hold","linear"]).default("linear"),
    decimals: z.number().int().min(0).max(4).default(0), pad: z.number().int().min(0).max(9).default(0),
    prefix: z.string().default(""), suffix: z.string().default("") }).optional(),
  timecode: z.strictObject({ mode: z.enum(["elapsed","frames"]).default("elapsed"), prefix: z.string().default("") }).optional(),
  ticker: z.strictObject({ items: z.array(HudItem).min(1), height: z.number().positive().default(44),
    background: Color.default("#000000B3") }).optional() });
export type LookSpec = z.infer<typeof Look>; export type Hud = z.infer<typeof HudOverlay>;
export type ResolvedHud = Hud & ResolvedSpan & { counterKeys: { frame: number; value: number }[]; tickerItems: { frame: number; text: string }[] };
// schema.ts: overlays: z.array(z.discriminatedUnion("type", [OverlayLayer, HudOverlay])); look: Look.optional()
// types.ts: ResolvedTimeline.overlays: (Extract<ResolvedLayer,{type:"overlay"}> | ResolvedHud)[]; look?: LookSpec
```
- Key and item frames are **absolute** output frames (`toFrames(..., "position")`, which adds the beat offset once). They are sorted and unique, and must lie in [startFrame, endFrame).
- **Layout (fixed; W3 must not invent it):**
  - Corners: four L-brackets inset by `margin`, arm length = size×1.5, stroke = max(2, size/14), in `color`.
  - `label`: top-left inside the brackets. Counter: top-right, right-aligned, in `accent ?? color`. Timecode: bottom-left.
  - Ticker: a full-width strip of `height` at the bottom, text left-aligned at `margin`. It switches items hard at each `frame`, without scrolling. When the ticker is present, the timecode sits above the strip.
  - Font resolves with `resolveFont(font, "regular", ctx)` (bundled mono = GeistMono, src/compile/text/fonts.ts:13). The HUD spec emits **no** stage events (the ticker preset's "tick" events would feed autoCues).
- **Text formatting:**
  - Counter: `value.toFixed(decimals)`, integer part zero-padded to `pad` digits, sign before the padding. `hold` keeps the previous key's value; `linear` interpolates. Before the first key the first value shows; after the last key the last value.
  - Timecode `elapsed`: frames since the HUD start as `HH:MM:SS:FF`, non-drop, with FF based on round(fps). Timecode `frames`: the absolute output frame as a plain integer.
- **Addition to src/stage/types.ts TextNode.** `counter` stays single-interval. Evaluation order in `scrambled()`: counter, keyed, timecode, scramble.
  `keyed?: { keys: {frame:number;value:number}[]; mode:"hold"|"linear"; decimals:number; pad:number; prefix:string; suffix:string }; timecode?: { mode:"elapsed"|"frames"; base:number; fps:{num:number;den:number}; prefix:string }` (stage frames; base = absolute frame of stage frame 0).
- **Additions to src/compile/ir.ts, all optional** so the PostPlan literals in src/render/cache.test.ts:23 and verify.test.ts:45 still compile:
  `export interface LookOp { preset: LookSpec["preset"]; strength: number; seed: number; palette: string[]; filters: string[] }`
  `export interface HudOp { renders: string[]; startFrame: number; endFrame: number }`
  PostPlan gains `look?: LookOp; hud?: HudOp`.
- **Signatures (main writes stubs):**
  - `looks.ts`: `lookRequiredFilters(l: LookSpec): string[]` and `applyLook(ctx: BuildContext, input: string, l: LookSpec): string`. The palette comes from in-graph `color`/`hstack` sources, with no input registry.
  - `layers/hud.ts`: `hudRenders(h: ResolvedHud, t: ResolvedTimeline, base: SegmentBase, chunkSeconds = 20): StageRender[]`, time-ordered and contiguous. The SpecBuilder uses rate 1 and scale = profile scale.
  - `layers/hud.ts`: `placeHud(ctx: BuildContext, canvas: string, renders: StageRender[], h: ResolvedHud): string`. Inputs use `["-i", out]` as in placeStage (src/compile/layers/stage.ts:85). Chunks join with `concat=n=k:v=1:a=0`, then overlay with `enable` over [start, end).
  - plan.ts (W2) puts each render into `base.stages`; the runner already materializes every stageRender (src/render/stages.ts:84).
- **Post-order contradiction.** Today overlays are applied, then root effects (src/compile/plan.ts:79-86). G-10's order "look → effects → overlays → HUD" silently puts overlays above grain and vignette on **existing** timelines.
  - Fix: use look → overlays → root effects → HUD. That keeps existing output identical, and the HUD still escapes grain.
  - `strength = 0` → `post.look` is undefined and the chain is skipped.
  - The early return (:75) must test `overlays.length || effects.length || post.look || hud`.

## 3. CI risk and the 60 s budget per test
- **ffmpeg versions differ.** Ubuntu apt on ubuntu-latest installs ffmpeg 6.1, while brew and choco install 8 or 9 (ci.yml:50-57), so "ffmpeg 9" holds only on macOS and Windows. All look filters (eq, colorbalance, gblur, blend, noise, crop, rgbashift, paletteuse, hstack, colorchannelmixer, vignette) exist in 6.1. Never commit golden md5s; compare two renders within one run.
- **Determinism and ΔE.** Run the look chain on `testsrc2=s=320x180:r=30:d=1` and write `-f framemd5` of rgb24 frames twice; compare within the run, never through x264 output. Under 5 s.
  - paletteuse emits only palette colors, so the ΔE check is near-certain. Keep it (one frame, 2,000 samples, pure-JS ΔE2000) under 3 s.
- **Test strength 0 at the plan level only** (graph string equals the no-look graph), with no ffmpeg.
- **Stage raster is JS per frame.** A 1080p, 60 s HUD takes minutes on 2-core Windows runners, so the G-11 benchmark must never be a CI test. CI HUD tests use 320×180, 30 fps, 3 s (90 frames), text and rect only, bundled font.
- **No OCR.** Assert counter and timecode values through the stage evaluator: text of a node at a frame via scene.ts. Prove chunking (B5, R2-10) by rendering once with `chunkSeconds = 1` and once unchunked and requiring equal framemd5; about 10 s.
- **B4 e2e: one file.** tests/e2e/looks-hud.test.ts renders a 3-scene 320×180 proxy with a cut and a fade, HUD plus riso. Budget 40 s on Windows; it runs at concurrency 4 beside other e2e files, so keep it separate from render.test.ts.
- **The first execution of every test is CI.** Merge W1→W2→W3 into one PR, budget one fix round, and keep each test file independent so a failure points at one worker.

REFLECTION: CHANGES
