wp4 doesn't pass yet: four blockers remain, all in the shared contracts that main owns. The W-1..W-7 section does settle the old conflicts in the doc body (blend vs parameter scaling, palette PNG vs in-graph swatch, `requirements.ts`, post order). Nothing blocks on CI FFmpeg versions: every look filter exists in ubuntu's FFmpeg 6.1, and the determinism checks run twice in one job with no committed golden files. I made no edits.

1. **The resolved timeline has no agreed shape for the look and the HUD.** `ResolvedTimeline` in `src/timeline/types.ts:72-90`, which W1 owns, has no `look` field, and `overlays` is typed `ResolvedLayer[]` (`:83`). W2's `plan.ts` reads the look and HUD from it (`plan.ts:51`, `:79`), and W3's `hudRenders` takes the whole `ResolvedTimeline`. Since the workers run at the same time, both would be guessing:
   - what the look field is called, and whether it is present when strength is 0;
   - whether the HUD sits inside `overlays` or in its own field.
   - **Fix:** before dispatch, main adds `look?: LookSpec` and `overlays: (ResolvedLayer | ResolvedHud)[]` (or a separate `hud?: ResolvedHud`) to `types.ts`, and states which one W1's resolver produces.
2. **One HUD or many?** The schema lets root `overlays` hold any number of `{type:"hud"}` entries, but `PostPlan.hud?: HudOp` holds exactly one, and `placeHud` takes a single `ResolvedHud`.
   - **Fix:** either have W1's `validate-hud.ts` reject a second HUD (issue path `overlays.<i>`) and test it, or make it `hud?: HudOp[]`, composited in authored order.
3. **The elapsed timecode restarts in every chunk.** The `TextNode.timecode` comment in `src/stage/types.ts` counts elapsed time "from stage frame 0". W-5 counts it from the HUD start. With chunking (default 20 s, 1 s in the test), each chunk has its own frame 0, so the clock would reset at every chunk and the "chunked equals unchunked" test would fail. `keyed` keys are also documented "in stage frames" with no rule for shifting them per chunk.
   - **Fix:** in `types.ts`, define `base` as the output frame where the chunk starts, and add `origin` as the HUD's start frame. Then elapsed time is `base + frame − origin`, and frames mode is `base + frame`.
   - State that `hudRenders` shifts each key to `absoluteFrame − chunkStartFrame`, and that the evaluator treats keys before frame 0 as "before the first key".
4. **The HUD's post-plan wiring is left to guesswork.**
   - It's unclear whether `HudOp.renders: string[]` holds `StageRender` ids or output paths.
   - It's unclear who adds the chunks to the compile stages map: `placeStage` registers its own (`src/compile/layers/stage.ts:80-83`), but B4 has `plan.ts` do it.
   - W-7 needs the e2e test to render with `chunkSeconds 1`, but `plan.ts` calls `hudRenders` with no setting a test can reach.
   - **Fix:** make `renders` the chunk ids, in time order. Have `hudRenders` register the chunks itself, as `placeStage` does, and have `plan.ts` only store the ids.
   - Add `hudChunkSeconds?: number` to `CompileOptions` (W2 passes it through to `hudRenders`), so `tests/e2e/looks-hud.test.ts` can force 1 s chunks.

Two smaller notes don't block. For the ΔE test, `rawvideo` rgb24 read from ffmpeg's stdout is easier than decoding a PNG in pure JS. And `resolveFont` takes `(fontId, weight, ctx)` (`src/compile/text/fonts.ts:50`), so W-4's two-argument call is missing `ctx`.

VERDICT: FAIL