# 020 — wp3 Render core (compiler IR, segments, joins, effects, typography, render)

Consumes 010 (schema, resolver, probe, exec, errors). Implements ARCH-04/05. Prototype lessons from 002 are requirements.

## Scope

IN: typed render IR; per-scene segment compilation; layer builders (media, window, text, shape, overlay); effects registry;
ASS typography generator with animation presets; bundled OFL fonts; pure-JS PNG writer for masks/shadows/shapes; join graph
(xfade + concat for cuts) with exact offset math; render runner with content-hash cache, progress parsing and output
verification; proxy/final profiles and hardware encoder selection; `vid2 compile`, `vid2 render`; video-only output
(audio mux lands in 040 via an AudioPlan hook). Global overlays/effects (timeline-level) applied after the join.
OUT: capture event resolution (030 provides the EventResolver + camera keys), audio (040), providers (050).

## File map (NEW unless noted)

```text
src/compile/ir.ts  src/compile/plan.ts  src/compile/graph.ts  src/compile/escape.ts  src/compile/joins.ts
src/compile/layers/{media,window,text,shape,overlay}.ts  src/compile/motion.ts  src/compile/ease.ts
src/compile/effects/{registry,grade,motionblur,vignette,grain,flash,rgbsplit}.ts
src/compile/text/{ass,animations,fonts}.ts  src/compile/png.ts  src/compile/index.ts
src/render/{runner,cache,profiles,encoders,progress,verify}.ts  src/render/index.ts
src/cli/commands/{compile,render}.ts
assets/fonts/{Geist-Regular,Geist-SemiBold,Geist-Bold,Geist-Black}.ttf  assets/fonts/{GeistMono-Regular,GeistMono-Bold}.ttf
assets/fonts/{InstrumentSerif-Regular,InstrumentSerif-Italic}.ttf  assets/fonts/{OFL-Geist,OFL-InstrumentSerif}.txt  assets/fonts/README.md
tests: src/compile/{graph,escape,joins,ease,motion,png}.test.ts  src/compile/text/ass.test.ts  src/compile/effects/registry.test.ts
  src/compile/plan.test.ts (golden)  src/render/{cache,profiles,verify}.test.ts
  tests/golden/*.plan.json  tests/e2e/render.test.ts  tests/fixtures/timelines/{two-scenes,text-anim,window,effects,overlay}.json
structure/compiler.md  structure/render.md  (MODIFY structure/INDEX.md, structure/overview.md)
MODIFY src/cli/registry.ts (register compile, render); MODIFY src/probe/index.ts (effects allowlist now sourced from registry)
```

Fonts (all SIL OFL 1.1): Geist + Geist Mono (github.com/vercel/geist-font releases, static TTF) and Instrument Serif
(github.com/Instrument/instrument-serif or Google Fonts). Research 006 lists Inter among "lazy default" fonts and asks for weight contrast
(Black vs Regular) and a sans + serif pairing. Built-in ids: `sans` (Geist, default), `mono` (Geist Mono), `serif` (Instrument Serif).
Korean/CJK text needs `fonts.<id>.family: "Pretendard"` (system) or a path; validation warns when Hangul/CJK text uses a bundled Latin font.
Record URLs + sha256 in assets/fonts/README.md.

## IR (src/compile/ir.ts)

```ts
export interface InputSpec { id: string; args: string[]; path?: string; lavfi?: string; kind: "image"|"video"|"audio"|"lavfi"|"png" }
export interface SegmentPlan { id: string; sceneId: string; index: number; frames: number; width: number; height: number;
  fps: Fps; inputs: InputSpec[]; graph: string; outLabel: string; ass?: { path: string; content: string; fontsDir: string };
  internalRate: number; hash: string }
export interface JoinStep { kind: "xfade"|"concat"; transition?: string; frames: number; offsetFrames: number }
export interface JoinPlan { segments: { id: string; frames: number }[]; steps: JoinStep[]; totalFrames: number; graph: string }
export interface PostPlan { overlays: OverlayOp[]; effects: EffectOp[]; graph: string | null }
export interface RenderPlan { planVersion: 1; timelineHash: string; profile: ProfileName; output: ResolvedOutput;
  segments: SegmentPlan[]; join: JoinPlan; post: PostPlan; audio: AudioPlan | null; workDir: string; tool: { ffmpeg: string; version: string } }
```
`AudioPlan` is declared in ir.ts as an opaque interface extended in 040; 020 sets it to null.

## Graph + escaping (graph.ts, escape.ts)

`escapeValue(v)`: backslash-escape `\ ' : , ; [ ]` for filter option values; `quoteExpr(e)`: wrap in single quotes and escape inner
single quotes as `'\''`; `escapePath(p)`: normalize to forward slashes, escape drive colon (`C\:/x`) and quotes (needed for ass/lut3d on Windows).
`class GraphBuilder { label(prefix): string; add(inputs: string[], filters: string[], output?: string): string; toString(): string }`
joins filters with `,`, chains with `;`, validates labels are unique; unit tests cover every special character and Windows paths.

## Segment compilation (plan.ts, layers/*)

Each ResolvedScene → one SegmentPlan rendered at `internalRate × fps` (internalRate = motionblur frames or 1).
Base canvas: `color=c=<background>:s=WxH:r=<fps*rate>:d=<seconds>` (or a media background). Layers composite in array order via
`overlay=x:y:eof_action=pass:format=auto` with `enable='between(n,s,e)'` from the layer span.

- media.ts: input args: image → `-framerate R -loop 1 -t D -i`; video → `-ss <in> -t <len/speed> -i` + `setpts=(PTS-STARTPTS)/speed`
  + `fps=R`; capture → resolved by 030 to its CFR footage file. Normalization first: `scale=...:flags=lanczos,format=rgba,setsar=1`.
  fit: cover = `scale=W:H:force_original_aspect_ratio=increase,crop=W:H`; contain = `...decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2:color=black@0`;
  blurfill = split → [a] cover + `gblur=sigma=48,eq=brightness=-0.3` / [b] contain-to-height-fit → overlay centered (no crop of the subject).
  JPEG/full-range sources: always `scale=in_range=auto:out_range=tv` before format conversion (prototype yuvj420p bug).
- motion.ts (revised after research 003 §4: measured jitter zoompan 0.288 px vs perspective-on-2×-oversample 0.0043 px):
  camera/motion for stills AND video uses `perspective` (sub-pixel), never zoompan. Chain: source → fit to 2×(W,H) in `yuv444p` (or rgba when
  alpha is needed) → `perspective=x0=…:y0=…:x1=…:y1=…:x2=…:y2=…:x3=…:y3=…:interpolation=cubic:sense=source:eval=frame` → `scale=W:H:flags=area`.
  Corners for zoom z and focus (cx, cy) in [0,1]: half-extent `h = 0.5/z`; clamped centre `ux = clip(cx, h, 1-h)`, `uy = clip(cy, h, 1-h)`;
  x0 = `W2*(ux-h)`, y0 = `H2*(uy-h)`, x1 = `W2*(ux+h)`, y1 = y0, x2 = x0, y2 = `H2*(uy+h)`, x3 = x1, y3 = y2 (W2/H2 = oversampled size).
  z, cx, cy are expressions of `in` (input frame number; perspective has no `t` — research pitfall 6) built from camera keys as a flat sum of
  segment terms `between(in,f_k,f_{k+1}-1)*(v_k+(v_{k+1}-v_k)*E((in-f_k)/(f_{k+1}-f_k)))` plus a hold term after the last key.
  Presets: kenburns = z 1.0→1.08 linear-inout over the layer; punch = `1+0.10*exp(-in/4)+0.025*in/N`; drift = z 1.04, cx 0.45→0.55.
  Perf note: 2× oversample costs ~4× pixels; the proxy profile uses 1× (no oversample).
- ease.ts: expression generators: linear `t`, in `t*t`, out `1-(1-t)*(1-t)`, inout smoothstep `t*t*(3-2*t)`, punch `1-exp(-6*t)`
  — all take an expression string for t and return a string; unit-tested by evaluating with a tiny JS evaluator for the used grammar.
- window.ts: content zooms inside a fixed frame (prototype rule). Pipeline: media chain scaled to window size (cover) → `format=rgba`
  → `alphamerge` with a rounded-rect mask PNG → optional border PNG overlay → onto canvas after shadow PNG at (x-pad, y-pad+offset).
  perspective (rx/ry): compose the window with shadow into a transparent full-canvas layer, then `perspective=x0:y0:x1:y1:x2:y2:x3:y3:interpolation=cubic`
  with corners from a pinhole projection (focal = 1.2×W) of the rotated rectangle; tests assert corner math for rx=0,ry=10.
  Masks/shadows/borders are generated by png.ts (supersampled 4× rounded rect, alpha AA; shadow = 3-pass box blur approximating gaussian σ=34)
  and cached under `cacheDir("png")/<hash(params)>.png`.
- png.ts: `encodePng(width, height, channels: 1|4, data: Uint8Array): Buffer` (zlib deflate, filter 0, CRC table) + helpers
  `roundedRectMask`, `roundedRectBorder`, `softShadow`, `solidRect`. Test: ffprobe decodes the PNG with the right size.
- text.ts + text/ass.ts: all text layers of a scene become one .ass file (PlayResX/Y = W/H, `ScaledBorderAndShadow: yes`, WrapStyle 2);
  one Style per (font, weight, size, color, align, shadow/box) tuple; Dialogue per layer with `\pos` (or `\an5` center) and animation
  overrides from animations.ts:
  | animation | ASS |
  |---|---|
  | fade | `\fad(ms,120)` |
  | rise | `\move(x,y+24,x,y,0,ms)\fad(ms,120)` |
  | slam | `\fscx145\fscy145\alpha&HFF&\t(0,60,\alpha&H00&)\t(0,ms,0.5,\fscx100\fscy100)` (accel 0.5 = ease-out) |
  | pop | `\fscx80\fscy80\t(0,ms*0.6,\fscx108\fscy108)\t(ms*0.6,ms,\fscx100\fscy100)\fad(80,120)` |
  | type | karaoke `{\k<cs>}` per character with SecondaryColour alpha &HFF& so glyphs appear one by one |
  | wipe | `\clip(x0,y0,x0,y1)\t(0,ms,\clip(x0,y0,x1,y1))` |
  | blur | `\blur18\alpha&HFF&\t(0,ms,\blur0\alpha&H00&)` |
  Text escaping: `\` → `\\`, `{`/`}` → `\{`/`\}`, newline → `\N`. Colors → `&HAABBGGRR`. Box → BorderStyle 3 with BackColour.
  The filter is `ass=filename=<escapePath>:fontsdir=<escapePath>` applied last in the segment (after layers, before effects).
  fonts.ts: built-ins `sans` (regular/semibold/bold/black → Geist-*.ttf), `mono` (Geist Mono), `serif` (Instrument Serif regular/italic);
  user fonts by path (copied into a per-plan fonts dir)
  or family (looked up in OS font dirs: macOS /System/Library/Fonts, /Library/Fonts, ~/Library/Fonts; Windows %WINDIR%/Fonts,
  %LOCALAPPDATA%/Microsoft/Windows/Fonts; Linux /usr/share/fonts, ~/.local/share/fonts) matching filename stem case-insensitively.
  Missing libass → E_CAPABILITY. Never emit animated drawtext fontsize (bug canary drawtext-animated-fontsize-segv).
- shape.ts: rounded rect PNG (png.ts) overlaid with enable window; radius 0 → `drawbox`.
- overlay.ts (screen/add blend): overlay source scaled to canvas; for `sweep` it is placed on a black canvas and moved with
  `overlay=x='-W*0.4+W*0.8*(t-s)/len'`; outside its span the stream is black (tpad), then `format=gbrp` on both and
  `blend=all_mode=screen:all_opacity=<opacity>` (screen with black = identity, so no enable needed), back to rgba.

## Effects registry (effects/*)

```ts
export interface EffectDef<P> { type: string; requires: { filters: string[] }; internalRate?(p: P): number;
  build(p: P, ctx: { fps: Fps; rate: number; frames: number; width: number; height: number }): string[] }
```
grade → `eq=brightness:contrast:saturation` (+ `colortemperature=temperature=` when set, + `lut3d=file=<escapePath>` when lut);
motionblur(k) → internalRate k; build `tmix=frames=k,fps=<fps>`; vignette → `vignette=angle=PI*strength/2.5`;
grain → `noise=alls=<s>:allf=t` (docs warn about bitrate); flash(at) → `eq=brightness='s*exp(-max(0,t-at)*decay)*gte(t,at)':eval=frame`;
rgbsplit(at, frames, px) → `rgbashift=rh=-px:bh=px:edge=smear:enable='between(n,a,a+frames-1)'` (verify the filter supports timeline
enable via `ffmpeg -h filter=rgbashift`; if not, fallback = split/trim/concat as in the prototype, chosen at compile time from probe).
Effects apply after text; scene effects inside the segment, timeline effects in PostPlan after the join. Time contract (audit round 2):
segment-level builders may use `n`/`t` relative to the segment; PostPlan builders receive `ctx.clock = "absolute-t"` and must express timing in
`t` only (e.g. global rgbsplit uses `enable='between(t,a,b)'`, flash uses `t`), so previews that shift PTS evaluate identically; a unit test
asserts no PostPlan filter string contains an `n`-based expression. `requires` feeds doctor
and a compile-time `requireFeatures` check (no silent fallback).

## Joins (joins.ts) — exact math

Segments are rendered with `frames_i` = resolved scene frames (visible length) plus 2 spare tail frames (research pitfall 3: xfade silently
drops B when `offset >= len(A)`; the guard below allows the exact equality `offset + duration == len(A)`). Normalization of every segment input: `fps=<num>/<den>,settb=AVTB,setpts=PTS-STARTPTS,
format=yuv420p,setsar=1,scale=out_range=tv` — the timebase is AVTB, never `1/<fps.num>` (a 30000/1001 timeline would otherwise get 1/30000;
architect reflection gap 1). Per-join contract (reflection gap 2): before each join step the accumulated stream is trimmed to its intended
length `trim=end_frame=start_i + T_i,setpts=PTS-STARTPTS` (for a cut T_i = 0, so spare frames of the previous segment never leak), and the
incoming segment is trimmed to `frames_i + (i is last ? 0 : 2)`. Then: cut → `concat=n=2:v=1:a=0`; transition → `xfade=transition=<type>:
duration=<T_i/fps>:offset=<start_i/fps>` (seconds computed from rational fps as `start_i*den/num`). The final stream is trimmed to
`totalFrames`. Unit tests: 3×60f with 15f fades → offsets 1.5 s and 3.0 s, total 150; fade→cut→fade sequence where each scene is a solid
distinct colour → e2e render asserts the colour at every scene's first and last visible frame (catches leaked spare frames); a 30000/1001
timeline renders with exact frame count; single segment → no join graph (copy).

## Render runner (render/*)

- profiles.ts: `proxy` = half resolution (even dims), x264 `-preset ultrafast -crf 26`; `final` = full, intermediates x264
  `-preset veryfast -crf 12 -pix_fmt yuv420p`, final encode `-preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart` (+ `-tag:v hvc1` for hevc),
  webm → libvpx-vp9 `-crf 32 -b:v 0`, prores → prores_ks profile 3. `--hw` picks the first available of videotoolbox/nvenc/qsv/amf/vaapi
  (encoders.ts) with quality-equivalent settings; absent → warning and software.
- cache.ts: key = hashJson({segmentPlanWithoutWorkDir, inputFileHashes, fontHashes, profile, ffmpegVersion, effectVersions}); file
  `cacheDir("segments")/<key>.mp4`; `--no-cache` bypass; `vid2 render --segments <ids>` forces re-render of those.
- progress.ts: add `-progress pipe:2 -nostats`; parse `frame=` and `out_time_ms=` lines → logger progress per segment.
- verify.ts: after each segment and the final output: ffprobe width/height/frames (±1 frame tolerance: `-count_packets`), pix_fmt,
  color_range; mismatch → E_RENDER with details. Final: `+faststart` check (moov before mdat, first 4 MiB).
- Graph transport: every filtergraph is written to `<workDir>/<segment>.graph.txt` and passed as `-/filter_complex <file>` when ffmpeg ≥ 7.1,
  else `-filter_complex_script <file>` (research pitfall 18: avoids argv escaping differences and Windows' 32 KiB command-line limit).
  Minimum supported ffmpeg: 6.1 (doctor errors below 6.1, warns below 7.1). Looped stills always get `-t`, and overlays of looped inputs use
  `shortest=1` (pitfall 9). The join validates `offset + duration <= len(acc)` before running (equality is valid: ffmpeg 8.0.1 renders two 60-frame clips with a 15-frame
  fade to 105 frames, audit note; `>` would silently drop B, pitfall 3). With the per-join trim, len(acc) = start_i + T_i = offset + duration, so every
  planned transition sits exactly on the valid boundary; the check guards against resolver bugs.
  Blend size-matching uses the two-input `scale=rw:rh` form (scale2ref is deprecated since 7.1) followed by `format=gbrp`.
- runner.ts: `renderPlan(plan, {jobs = max(1, cpus/2), signal}): Promise<RenderResult{output; seconds; segments: {id; cached; ms}[]}>`
  runs segments in a bounded pool, then join, then post, then (040) audio mux; writes `<out>.render.json` manifest (plan hash, tool
  versions, timings). Commands: `vid2 compile <timeline> [--profile proxy|final] [--out plan.json] [--json]`,
  `vid2 render <timeline|plan.json> [--profile proxy|final] [-o out.mp4] [--segments ids] [--no-cache] [--hw] [--jobs N] [--json]`.

## Tests

Golden plans (tests/golden/*.plan.json; `UPDATE_GOLDEN=1` rewrites; workDir/paths normalized) for every fixture timeline.
Real renders (tests/e2e/render.test.ts; 320x180 @ 15 fps; sources generated per test via `ffmpeg -f lavfi testsrc2`/`color`):
(1) two-scenes + fade: frames = expected, blend visible at midpoint (signalstats YAVG between the two scene means);
(2) text-anim: ASS file content matches snapshot and the render succeeds (libass present); (3) window: output non-black inside the window
rect and background colour outside (crop + signalstats); (4) effects: motionblur segment frame count still correct; (5) overlay screen:
mean luma increases during the overlay span only; (6) cache: second render of same plan reports cached=true for all segments;
(7) proxy dims = half. All via ffprobe/signalstats reading the output, so they observe the change target.

## Verification (C for wp3)

`npm run typecheck && npm run lint && npm test` (includes golden + e2e renders); `node bin/vid2.js render tests/fixtures/timelines/effects.json
-o /tmp/vid2-effects.mp4 --json` → ok, then `ffprobe` dims/frames match, `blackdetect` no unexpected runs; README gets a "Render a
timeline" section. SoT: structure/compiler.md (IR, math, escaping), structure/render.md (profiles, cache, verify).
