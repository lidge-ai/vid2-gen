# 010 — WP2: timing and render correctness (G1–G4)

Decisions D2.1–D2.4 (006). Re-verify line numbers at this phase's P.

## File change map

| File | Change |
|---|---|
| src/shared/time.ts | MODIFY: \`TimeUnit\` adds \`"bar"\`; \`LITERAL\` accepts \`bar\`; new \`toSeconds(lit, ctx)\` (unrounded); \`toFrames\` handles bar = value·meter beats. |
| src/timeline/primitives.ts, src/timeline/schema.ts | MODIFY: \`TimeLiteral\`/\`SignedOffset\` regexes accept \`bar\`. |
| src/cli/commands/preview.ts | MODIFY: token recognizer accepts \`bar\`. |
| src/timeline/resolve.ts | MODIFY: scene loop accumulates exact seconds; boundaries quantized once. |
| src/timeline/validate.ts | MODIFY: \`out <= in\` on moving media is an issue; transition quantizing to 0 or ≥ scene length is an issue. |
| src/compile/layers/media.ts | MODIFY: \`sourceInput(..., {inSeconds, outSeconds, speed})\` caps \`-t\`; records \`pretrim\` metadata. |
| src/compile/ir.ts | MODIFY: \`InputSpec.pretrim?\`. |
| src/compile/segment.ts | MODIFY: mark repeated-path reads for pretrim. |
| src/render/pretrim.ts | NEW: materialize FFV1/MKV cuts (atomic, cached, locked). |
| src/render/runner.ts, src/render/cache.ts | MODIFY: substitute pretrimmed inputs; cache key includes source identity. |
| src/capture/camera.ts, src/capture/decorate.ts | MODIFY: merge by authored hold; simplify to ≤24 keys; \`E_INPUT\` beyond tolerance. |
| structure/timeline.md, compiler.md, render.md, capture.md; skills/vid2-timeline/references/time.md; schema json | SoT sync. |

## Key diffs

time.ts:
~~~ts
-export type TimeUnit = "s" | "f" | "b";
+export type TimeUnit = "s" | "f" | "b" | "bar";
-const LITERAL = /^(\d+(?:\.\d+)?)(s|ms|f|b)$/;
+const LITERAL = /^(\d+(?:\.\d+)?)(s|ms|f|bar|b)$/;
+/** Unrounded seconds for a literal; frames stay integral. */
+export function toSeconds(lit: TimeLiteralValue, ctx: { fps: Fps; beat?: BeatGrid }): number {
+  if (lit.unit === "s") return lit.value;
+  if (lit.unit === "f") return framesToSeconds(Math.round(lit.value), ctx.fps);
+  if (!ctx.beat) throw new Vid2Error("E_SCHEMA", "beat units need a beat grid", { fix: 'add "beat": {"bpm": 120} to the timeline' });
+  const beats = lit.unit === "bar" ? lit.value * ctx.beat.meter : lit.value;
+  return (beats * 60) / ctx.beat.bpm;
+}
~~~

resolve.ts scene loop:
~~~ts
+  let exactStart = 0;
   for (const [index, scene] of t.scenes.entries()) {
-    const frames = frame(scene.duration, ctx, "duration");
-    const prior = scenes.at(-1);
-    const transitionIn = prior?.transitionOut ?? null;
-    const startFrame = prior ? prior.startFrame + prior.frames - (transitionIn?.frames ?? 0) : 0;
+    const prior = scenes.at(-1);
+    const transitionIn = prior?.transitionOut ?? null;
+    const exactEnd = exactStart + seconds(scene.duration, ctx);
+    const startFrame = prior ? prior.startFrame + prior.frames - (transitionIn?.frames ?? 0) : 0;
+    const frames = secondsToFrames(exactEnd, fps) - startFrame;
     ...
+    exactStart = exactEnd - (transitionOut ? seconds(scene.transition.duration, ctx) : 0);
~~~
(transition frames derived so \`next.startFrame = round(exactNextStart·fps)\`.)

media.ts:
~~~ts
-  return ctx.inputs.add({ kind: "video", path, args: ["-ss", num(opts.inSeconds ?? 0), "-t", num(seconds * speed), "-i", path] });
+  const read = opts.outSeconds === undefined ? seconds * speed : Math.min(seconds * speed, opts.outSeconds - (opts.inSeconds ?? 0));
+  return ctx.inputs.add({ kind: "video", path, args: ["-ss", num(opts.inSeconds ?? 0), "-t", num(read), "-i", path],
+    pretrim: { sourcePath: path, inSeconds: opts.inSeconds ?? 0, durationSeconds: read, speed } });
~~~

## Accept criteria (with activation scenarios)

1. At 132 BPM / 30 fps, 22 scenes of \`"0.25bar"\`…\`"3bar"\` resolve with every scene start within 0.5 frame of the exact grid (unit test over resolveTimeline); \`"1bar"\` without a beat grid yields E_SCHEMA with the fix text. Re-rendered examples/opencodex-mix: analyzer shows every authored cut within 1 frame of the bar grid.
2. A media layer with \`in: "1s", out: "2s"\` on a two-color fixture (red 0–2 s, blue 2–4 s) over a 3 s span renders red for the full span (held last frame), never blue (pixel test). \`out <= in\` fails validate with a pathful issue.
3. A segment with the same file read three times at different \`in\` completes, the plan marks all three reads \`pretrim\`, a second render reuses the cached cuts (cache hit reported), and output frames match a render of pre-cut files.
4. A capture layer with 200 synthetic type events and \`camera.auto\` compiles to ≤24 camera keys and an expression under 20,000 characters; a pathological case beyond tolerance yields E_INPUT at \`scenes.i.layers.j.camera\`.
5. typecheck, lint, npm test pass; schema JSON regenerated (drift test passes).

## Amendments from reflection (006 G-1–G-5)

- G-1: `transition()` no longer rounds its own duration for joins: `transitionOut.frames = round(exactEnd·fps) − round((exactEnd − tS)·fps)`. Validate rejects a non-cut overlap that quantizes to 0 frames or to ≥ either scene's frames (accept 1b: two-scene timeline with a 0.01 s fade at 30 fps fails with a pathful issue). Accept 1c: 30000/1001 fps, 64 bars at 132 BPM, every start within 0.5 frame of exact.
- G-2: both capture and video branches of `sourceInput` receive `outSeconds` from `prepareMedia`; the read is floored to whole source frames minus a 1 ms guard so no frame at/after `out` decodes (accept 2 covers a capture fixture too).
- G-3: validate also rejects `out` on image/color sources and reads shorter than one frame.
- G-4: pretrim key = canonical path + size + mtimeNs + in + duration + speed + ffmpeg version; `--no-cache` bypasses reuse; a failed cut raises E_RENDER with source path and segment id; capture reads pretrim too; `segment.ts` enables pretrim only when a path repeats within the segment.
- G-5: file map adds src/compile/motion.ts (expression assembly, length measured there) and src/cli/commands/plan-shared.ts (E_INPUT after capture decoration). The 20,000-character bound applies to the final `perspective` expression per layer in the compiled plan.
- Tests: src/shared/time.test.ts (bar), src/timeline/resolve.test.ts, src/timeline/validate.test.ts, src/compile/layers/media.test.ts (new), src/render/pretrim.test.ts (new), src/capture/camera.test.ts, tests/e2e/render.test.ts (duplicate reads).

## Amendments from audit round 1 (blockers 3, 9)

- B3: the pretrim key is `hashJson({ source: await hashFile(sourcePath), inSeconds, durationSeconds, speed, ffmpegVersion })` — the same full-content identity `segmentCacheKey` uses (src/render/cache.ts:13-25) — so a same-size, same-mtime overwrite misses. A cut is accepted only after ffprobe confirms a nonzero video stream and the expected frame count ±1; otherwise E_RENDER with source and segment id. Regression test: overwrite a fixture with different pixels, restore its mtime with `utimes`, render again → new cut, new pixels.
- B9: camera simplification tolerance = max positional error 1.5 % of output width and max zoom error 0.02 against the dense spring path. Failure fixture: 120 events alternating between opposite corners every 2 frames with `hold: "0s"` (cannot be represented by 24 keys) → E_INPUT at `scenes.0.layers.0.camera` from planFromTimeline after capture decoration. Separate test: the 200-event typing trace compiles and every final `perspective` expression is ≤ 20,000 characters.

## Amendments from audit round 2 (R2-2, R2-8, R2-9)

- R2-2: the camera failure fixture is 30 non-overlapping click groups 1 s apart alternating between opposite corners (beyond the 0.7 s merge window), with a pre-check that the dense path breaches 1.5 % width before simplification; `groupsFor` merge window becomes `hold` when authored (default stays 0.7 s) with its own unit test.
- R2-8: the eslint ignore for `examples/opencodex-*/**` moves into this phase's file map (eslint.config.js MODIFY), so every later D gate runs lint over tracked code only.
- R2-9: file map adds NEW exports `secondsToFrames` (already exported from time.ts; import it in resolve.ts) and a local `seconds(value, ctx)` helper in resolve.ts built on `toSeconds`. Backslash-escaped code spans are cleaned when P consolidates.

## Consolidated contract for B (wp2 P, re-verified against 0b18b747)

Continuity: wp1 D locked the roadmap; this cycle implements G1–G4 exactly as below. Line anchors re-checked; no code moved since 13a0e45a.

1. **Time units** — src/shared/time.ts: `TimeUnit` adds "bar"; `LITERAL = /^(\d+(?:\.\d+)?)(s|ms|f|bar|b)$/`; `toSeconds(lit, ctx)` returns unrounded seconds (bar = value·meter beats); `toFrames` uses `toSeconds` for b/bar. src/timeline/primitives.ts and schema.ts regexes accept "bar"; src/cli/commands/preview.ts token accepts "bar".
2. **Cumulative scene placement** — src/timeline/resolve.ts: `exactStart` accumulates `seconds(scene.duration)`; `startFrame = round(exactStart·fps)`, `frames = round(exactEnd·fps) − startFrame`; non-cut `transitionOut.frames = round(exactEnd·fps) − round((exactEnd − tSec)·fps)`; `exactStart = exactEnd − tSec`. src/timeline/validate.ts: a non-cut transition resolving to 0 frames or ≥ either scene's frames is an issue at `scenes.i.transition.duration`.
3. **Media out** — src/compile/layers/media.ts `sourceInput` takes `outSeconds` for video and capture: `read = out === undefined ? span·speed : min(span·speed, out − in − 0.001)`; `prepareMedia` passes `outSeconds`. validate.ts rejects `out ≤ in`, `out` on image/color sources, and reads shorter than one output frame.
4. **Pretrim** — src/compile/ir.ts `InputSpec.pretrim?: {sourcePath, inSeconds, durationSeconds}`; `sourceInput` records it for every video/capture read; `compileSegment` keeps it only on paths read more than once in the segment. src/render/pretrim.ts: key = `hashJson({source: await hashFile(path), inSeconds, durationSeconds, ffmpegVersion})`, output `cacheDir("pretrim")/<key>.mkv` (FFV1, `-an`), temp + ffprobe frame-count check (expected ±1) + atomic rename, in-process lock per key; `--no-cache` recuts; failure → E_RENDER {source, segment}. src/render/runner.ts `renderSegment` swaps each pretrimmed input's args for `["-i", cutPath]` just before spawning ffmpeg (segment cache key still hashes originals).
5. **Camera** — src/capture/decorate.ts `cameraKeys` parses the authored `hold` time literal (bug: strings were ignored) and passes it as both `hold` and `merge`; src/capture/camera.ts `planCamera` simplifies dense keys with Ramer–Douglas–Peucker (tolerances x 0.015, y 0.015·width/height, zoom 0.02, first/last kept); if more than 24 keys remain it throws E_INPUT naming the layer (source id, scene id) with a fix hint (split the layer, raise hold, or author manual keys). Test: a 200-event typing trace yields ≤ 24 keys and every perspective expression ≤ 20,000 chars; 30 click groups 1 s apart alternating corners → E_INPUT.
6. **Lint scope** — eslint.config.js ignores `examples/opencodex-*/**`; .gitignore adds `examples/opencodex-*/`.
7. **Docs** — structure/timeline.md, compiler.md, render.md, capture.md; skills/vid2-timeline/references/time.md (bar unit, cumulative rounding); schema JSON regenerated (`node scripts/schema-json.mjs`, `npm run build`).

Tests: src/shared/time.test.ts (new or extended), src/timeline/resolve.test.ts, src/timeline/validate.test.ts, src/compile/layers/media.test.ts (new, pixel fixture), src/render/pretrim.test.ts (new), src/capture/camera.test.ts, tests/e2e/render.test.ts (duplicate reads). Gates: npm run typecheck, npm run lint, npm test, npm run skills:check.

## Amendments from wp2 reflection (ALIGNED, 7 gaps folded)

- R1: the hold fix changes every auto-camera render (schema default "0.8s" was always ignored; planCamera used 0.5 s hold / 0.7 s merge). CHANGELOG behavior-change entry. src/capture/decorate.test.ts: default hold → planCamera receives 0.8 s; `"2b"` with a beat grid → 2 beats in seconds (parsed with the resolved timeline's beat grid).
- R2: decorateCaptureLayers throws E_INPUT with `details.path = "scenes.i.layers.j.camera"`; it surfaces from resolve/compile/render, not from `vid2 validate` (documented in structure/capture.md).
- R3: E_INPUT when, after simplification, more than 24 keys remain **or** any generated perspective expression exceeds 20,000 characters; both measured in one test. RDP error = max over axes of normalized error (|Δx|/0.015, |Δy|/(0.015·w/h), |Δzoom|/0.02) ≤ 1. The cursor track keeps using the same simplified keys via cameraAt.
- R4: pretrim acceptance = at least one video frame and probed duration within one source frame of durationSeconds (VFR-safe); FFV1 keeps the source pix_fmt and color range (test asserts ffprobe pix_fmt and color_range match the source).
- R5: pretrim runs only after the segment cache misses (inside renderSegment after the cacheExists branch); hashFile(source) is memoized per path for the render.
- R6: regression: a timeline with only frame (`f`) durations and transitions resolves to the same frames as before; `offsetFrames` still added once for positions in b and bar; a 30000/1001 fps case; skills/vid2-timeline/references/schema.md units line gains bar.
- R7: only the 0-frame non-cut transition issue is new (transition_length already exists at validate.ts:62-63).

## Amendments from wp2 audit (round 3, GO-WITH-FIXES 9; all folded)

- A1 (High, expression budget): measured with manual camera keys at 1080p (2026-09-28, ffmpeg 9.0.2): 24 keys → 55,042 chars renders; 48 → 111,138 renders; 72 → 167,234 renders; 96 → 223,330 fails with ENOMEM (the auto-camera failure was 167,842). Governing limits: after RDP at most 24 keys **and** every perspective expression ≤ 100,000 chars (≈ 60 % of the observed failure). The 20,000 figure is withdrawn. A 200-event typing trace must simplify to ≤ 24 keys (≈ 55 k chars).
- A2: src/compile/motion.ts (MODIFY) measures the assembled perspective expression and throws E_INPUT `details.path = scenes.i.layers.j.camera` when it exceeds 100,000 chars — for manual arrays too (fix hint: fewer keys or split the layer); decorate.ts enforces the 24-key cap for auto cameras with the same path.
- A3: `bar` reaches every consumer: src/compile/audio-plan.ts:73 and src/compile/motion.ts:16 pass the beat grid; src/compile/text/ass.ts:36 converts b/bar through `toSeconds`; src/compile/layers/kinetic.ts:37 converts glyphStagger through `toSeconds` (not raw value). Tests: ASS animationDuration "1bar" = meter beats; camera key at "1bar" with a grid; glyphStagger in bar.
- A4: transition frames may differ by ±1 depending on position (documented in structure/timeline.md and CHANGELOG); the 0-frame fixture pins its first scene to "1s" with a "0.01s" fade.
- A5: the short-read issue is `(out − in)/speed < 1/fps`, computed before the 1 ms guard.
- A6: bypass ledger — tier E3 (relational validation), surface validateTimeline + compile; known bypasses: a `.plan.json` replay keeps its old frames and uncapped reads; a `generate` source of kind image with `out` passes validate and fails at compile; residual: stale plans render old behavior; wording: "validation", not enforcement.
- A7: wp2 gates add `npm run build` and `npm run privacy:scan`.
- A8: pretrim cache has no automatic prune in 0.3.0; structure/render.md documents `rm -r "$VID2_HOME/cache/pretrim"` as manual cleanup.
- A9: items 1–7 are read together with R1–R7 and A1–A8 (R4 duration check replaces "frame-count ±1"; R2-2 dense-path breach pre-check applies to the corner fixture). skills time.md notes that `"2bar"` as a position is the start of bar 3 (plus offset) while `{bar:2, beat:1}` is the start of bar 2.
