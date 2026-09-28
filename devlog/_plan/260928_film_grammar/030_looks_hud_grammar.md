# 030 — WP4: looks, HUD, beat ergonomics, film-grammar references (G6–G9)

Decisions D4.1–D4.4 (006).

## File change map

| File | Change |
|---|---|
| src/timeline/schema.ts, types.ts, resolve.ts | MODIFY: root \`look\` \`{preset:"film"|"riso"|"paper", palette?:Color[2..6], strength:0..1=1, seed:int=0}\`; root \`overlays\` union adds \`HudOverlay\`. |
| src/compile/looks.ts | NEW: look → post-join filter chain. film: \`eq\`+\`colorbalance\` grade, halation (split → gblur on thresholded highlights → screen blend), \`noise\` grain, subtle weave via \`crop\` offsets keyed by frame; riso: palette PNG from colors → \`paletteuse=dither=bayer:bayer_scale=2\`, \`noise\` paper, channel offset misregistration; paper: warm \`colorchannelmixer\`, fibre noise, soft vignette. \`strength\` blends with the source (\`blend=all_mode=normal:all_opacity=s\`); 0 = passthrough. |
| src/compile/plan.ts | MODIFY: apply look after join, before HUD/overlays. |
| src/stage/presets/hud.ts | NEW: full-timeline HUD stage clip (corners, label, keyed counter, timecode, ticker strip). |
| src/stage/types.ts, scene.ts | MODIFY: keyed numeric text (multi-key counter). |
| src/probe/requirements.ts | MODIFY: look filters required only when used. |
| skills/vid2-direction/references/edit-rhythm.md, color-script.md, review-rubric.md, sound-cues.md, reference-films.md | NEW: rule-shaped references (003, 001). |
| skills/vid2-direction/SKILL.md, skills/vid2-timeline/references/time.md, recipes.md, schema.md | MODIFY: links, bar unit, beat ladder, look/hud schema. |
| structure/timeline.md, compiler.md, stage.md, skills.md | SoT sync. |

## Accept criteria

1. \`look.strength = 0\` renders pixel-identical to no look (PSNR ∞ / md5 of raw frames) for each preset; each preset renders deterministically for a fixed seed (two renders equal).
2. riso with a 4-color palette: analyzer palette of a rendered still contains only colors within ΔE small of the palette (+ dither mixes).
3. HUD counter keyed 30→99.9 over a 3-scene timeline with a hard cut and a fade shows the exact value at frame boundaries and persists across the cut (stage frame test); timecode frames mode prints the output frame.
4. \`npm run skills:check\` passes; references cite 003/001 sources.
5. A sample render (examples/looks-hud) proves film + riso + HUD visually; analyzer summary recorded.
6. typecheck, lint, tests pass.

## Amendments from reflection (006 G-9–G-12)

- G-9: `strength` scales parameters, not a whole-frame blend: grade/texture opacity × strength, weave and misregistration offsets × strength; `strength = 0` skips the look chain entirely (accept 1 true by construction). riso palette comes from an in-graph `color` sources + `hstack` swatch strip fed to `paletteuse` (no file; deterministic).
- G-10: post order is look → root effects → overlays → HUD, so grain/vignette never hit the HUD; documented in structure/compiler.md. File map adds src/timeline/validate.ts, src/compile/ir.ts (PostPlan), src/stage/presets/builder.ts, and `npm run schema:json` (drift test src/timeline/json-schema-drift.test.ts). Accept 2 metric: ≥95 % of sampled pixels within ΔE2000 ≤ 6 of a palette color or of a 50 % mix of two palette colors.
- G-11: HudOverlay fields: `{type:"hud", start?, end?, font:"mono"|fontId="mono", size=28, color="#F5F5F2", accent?, margin=48, corners=true, label?, counter?:{keys:[{at,value}] (≥1, sorted, unique, within span), mode:"hold"|"linear"="linear", decimals=0, pad=0, prefix="", suffix=""}, timecode?:{mode:"elapsed"|"frames"="elapsed", prefix=""}, ticker?:{items:[{at,text}] (≥1, sorted), height=44, background="#000000B3"}}`; times are absolute timeline time. plan.ts gets a hud branch and a stages-map entry in compileTimeline; keyed counter implemented as a multi-key text evaluator (TextNode.counter stays single-interval). Benchmark a 60 s 1080p HUD clip; if render time exceeds 2× the segment time, fall back to rendering the HUD per segment span.
- G-12: SoT list adds skills/vid2-audio/SKILL.md and README.
- Tests: src/timeline/schema.test.ts, validate.test.ts, src/compile/looks.test.ts (new), src/compile/plan.test.ts, src/stage/presets/hud.test.ts (new), tests/e2e/render.test.ts (look strength 0 equality).

## Amendments from audit round 1 (blockers 4, 5, 8)

- B4: src/timeline/validate.ts `checkReferences` checks `source` only for `type:"overlay"`; HUD spans/keys validate in a separate function. src/compile/plan.ts `postPlan` early return considers HUD (`overlays.some(o => o.type === "overlay" || o.type === "hud") || effects.length || look`), and the HUD stage spec is registered in the compile stages map before returning. Test: a timeline whose only root overlay is `{type:"hud", label:"REC", counter:{keys:[{at:"0s",value:30},{at:"3s",value:99.9}]}}` with a hard cut and a fade passes validate → compile → serialized plan → render, and the counter reads 30 at frame 0 and 99.9 at the last frame.
- B5: the long-HUD fallback renders absolute-time chunks (each ≤ 20 s) that are concatenated into one HUD stream and composited after the join in post — never inside scene segments — so transitions never blend two HUD copies. Test forces the fallback with a 2 s chunk size and asserts exact counter/timecode values on both sides of a cut and inside a fade.
- B8: the riso palette is a 256×1 swatch built in-graph: each of the n authored colors (2–6) is a `color=c=<hex>:s=<k>x1:d=1` source with k = floor(256/n) (the first color takes the remainder), joined with `hstack=inputs=n`, `format=rgb24`, `trim=end_frame=1`, fed to `paletteuse=dither=bayer:bayer_scale=2:new=0`. The ΔE verifier runs on a look-only render of a fixed gradient test pattern with texture/grain/misregistration strength 0 (palette stage isolated): ≥ 95 % of 2,000 seeded sample pixels are within ΔE2000 ≤ 6 of a palette color or of a 50 % mix of two palette colors. Final-output texture is verified visually in the example, not by this metric.

## Amendments from audit round 2 (R2-3, R2-6, R2-7, R2-10)

- R2-3: HUD spans are half-open [start, end). The B4 test uses `decimals: 1`, keys at `"0s"` → 30 and at the last frame time (`"89f"` on a 90-frame timeline) → 99.9, and asserts "30.0" at frame 0 and "99.9" at frame 89; a key at or after the span end is a validation issue.
- R2-6: the ΔE sample is read from an rgb24 PNG of the post graph before the yuv420p encode; the 50 % mix is the sRGB channel average.
- R2-7 (superseded by W-12: plan.ts checkCapabilities requires ffv1 when t.hud exists), so a missing ffv1 encoder fails at compile with E_CAPABILITY; added to the B4 test matrix.
- R2-10: chunked HUD rendering ships with an internal `hudChunkSeconds` setting (default 20) regardless of the benchmark, so the forced test exercises real code.

## Amendments from wp4 reflection (031, supersede conflicting text above)

- W-1 no local tests (user, 260928): workers run typecheck and eslint only; every test runs first in PR CI. Merge W1 → W2 → W3 in one PR and budget one CI fix round. Test files stay per-worker so a failure names its owner.
- W-2 shared contracts written by main before dispatch, never edited by workers: src/timeline/film.ts (Look, RISO_DEFAULT, HudOverlay, LookSpec, Hud, ResolvedHud), src/compile/ir.ts (LookOp, HudOp, optional PostPlan.look/hud), src/stage/types.ts TextNode.keyed/timecode, and stub signatures in src/compile/looks.ts (lookRequiredFilters, applyLook) and src/compile/layers/hud.ts (hudRenders, placeHud). src/probe/requirements.ts needs no change.
- W-3 post order is look → overlays → root effects → HUD (supersedes G-10). Existing timelines render identically. strength 0 → post.look undefined, chain skipped. The postPlan early return tests overlays, effects, post.look and hud.
- W-4 HUD layout: four L-brackets inset by margin, arm size×1.5, stroke max(2, size/14), in color. label top-left inside the brackets; counter top-right right-aligned in accent ?? color; timecode bottom-left, above the ticker strip when a ticker exists. Ticker: full-width strip of height at the bottom, text left at margin, hard switch per item, no scroll. Font via resolveFont(font, "regular") (mono = GeistMono). The HUD emits no stage events.
- W-5 formatting: counter value.toFixed(decimals), integer part zero-padded to pad digits with the sign before the padding; hold keeps the previous key, linear interpolates; first value before the first key, last after the last key. timecode elapsed = HH:MM:SS:FF non-drop from the HUD start with FF base round(fps); frames = absolute output frame integer. TextNode evaluation order: counter, keyed, timecode, scramble.
- W-6 riso palette defaults to RISO_DEFAULT; a palette on film or paper is a validation issue (look.palette). Key/item frames are absolute, sorted, unique, inside [startFrame, endFrame).
- W-7 CI budgets (all tests under 60 s; ubuntu ffmpeg is apt 6.1): look determinism on testsrc2 320×180 1 s via framemd5 of rgb24 twice in one run, never committed goldens; ΔE check on one frame with 2,000 samples in pure JS; strength 0 checked at plan level (graph string equals no-look graph). HUD tests at 320×180, 30 fps, 3 s; counter/timecode asserted through the stage evaluator, no OCR; chunking proved by chunkSeconds 1 vs unchunked equal framemd5. The 60 s 1080p HUD benchmark is not a CI test. tests/e2e/looks-hud.test.ts is its own file (≤ 40 s on Windows).
- Worker split:

| Worker | Owns |
|---|---|
| W1 timeline + docs | src/timeline/{schema,types,resolve,validate}.ts, new validate-hud.ts, schema.test.ts, validate.test.ts, schema/timeline.v1.json (npm run schema:json), skills/vid2-direction/SKILL.md and references/{edit-rhythm,color-script,review-rubric,sound-cues,reference-films}.md, skills/vid2-timeline/references/{time,recipes,schema}.md, skills/vid2-audio/SKILL.md, structure/{timeline,skills}.md, README.md |
| W2 looks + post plan | src/compile/looks.ts (+ test), plan.ts (+ plan.test.ts), src/cli/commands/compile.ts post summary, tests/e2e/looks-hud.test.ts, structure/compiler.md, CHANGELOG Unreleased |
| W3 HUD stage | src/stage/scene.ts (keyed, timecode), src/stage/presets/hud.ts (+ test), src/compile/layers/hud.ts (+ test), structure/stage.md |

After merge main owns examples/looks-hud and the skills manifest build.


## Amendments from wp4 audit round 1 (W-8..W-11)

- W-8 resolved shape (main wrote it in src/timeline/types.ts): `ResolvedTimeline.look?: LookSpec` present whenever authored, including strength 0; `ResolvedTimeline.hud?: ResolvedHud`; `overlays` keeps only type "overlay". W1's resolver moves the authored HUD out of overlays.
- W-9 one HUD per timeline: a second `{type:"hud"}` is validation issue HUD_DUPLICATE at `overlays.<i>` (W1, tested).
- W-10 chunk time: TextNode.timecode gains `origin`; base = absolute output frame of the chunk's stage frame 0, origin = HUD start. elapsed shows base + frame − origin; frames shows base + frame. hudRenders shifts counter keys and ticker items to absolute − chunkStart; keys before frame 0 act as "before the first key" only when no earlier key exists (the evaluator uses all keys, so a chunk mid-way shows the correct interpolated value).
- W-11 wiring: HudOp.renders are StageRender ids in time order; hudRenders registers the chunks in base.stages itself (as placeStage); plan.ts stores the ids and calls placeHud last in post. CompileOptions.hudChunkSeconds (default 20) is passed by W2 to hudRenders; tests/e2e/looks-hud.test.ts forces 1. resolveFont takes (fontId, weight, ctx). The ΔE test reads rawvideo rgb24 from ffmpeg stdout.


## Amendment from wp4 audit round 2 (W-12)

- W-12 capability: checkCapabilities in plan.ts (W2) requires the ffv1 encoder and decoder when `t.hud` is present, since the HUD no longer sits in overlays. W2 does not touch STAGE_FAMILY in segment.ts. The HUD-only timeline without ffv1 → E_CAPABILITY test stays.

