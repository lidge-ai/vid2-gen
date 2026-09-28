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
