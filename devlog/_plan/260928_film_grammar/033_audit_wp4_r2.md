All four of my blockers are closed, but moving the HUD out of `overlays` opened one new gap. So wp4 still doesn't pass. I checked the W-8..W-11 section and the shared-contract diffs without editing anything, and took your word that typecheck passes.

**Closed:**

- **Resolved timeline shape (W-8):** closed. `src/timeline/types.ts` now has `look?: LookSpec` (present even at strength 0) and `hud?: ResolvedHud`, and `overlays` holds only type `"overlay"`.
- **One HUD (W-9):** closed. A second HUD is the `HUD_DUPLICATE` issue at `overlays.<i>`.
- **Chunk timecode (W-10):** closed. `TextNode.timecode` now has both `base` and `origin`. Keyed counter keys are chunk-relative and may be negative, so a chunk halfway through still interpolates correctly.
- **HUD wiring (W-11):** closed.
  - `HudOp.renders` holds `StageRender` ids in time order.
  - `hudRenders` registers the chunks in the stages map itself.
  - `CompileOptions.hudChunkSeconds` lets the e2e test force 1 s chunks.
  - The `resolveFont` arguments and the rawvideo-based ΔE test are fixed.

The ticker needs nothing new: a stage spec has `tracks` (`src/stage/types.ts:97`), so W3 can switch ticker items with opacity tracks.

**Remaining blocker:**

1. **The ffv1 capability check can no longer see the HUD.** R2-7 plans to require ffv1 by adding `"hud"` to `STAGE_FAMILY`. But `checkCapabilities` only looks at scene layers plus `t.overlays` (`src/compile/plan.ts:53`, `:59`), and W-8 moves the HUD into `t.hud`. On a HUD-only timeline, the check would pass without ffv1 and the failure would come at render time. The B4/R2-7 test that expects `E_CAPABILITY` would then fail in CI.
   - **Fix:** state in the doc that W2 changes `checkCapabilities` to require the ffv1 encoder and decoder when `t.hud` is present.
   - Drop the "segment.ts adds hud to STAGE_FAMILY" line from W2's scope, since that set no longer sees the HUD.
   - Keep the HUD-only no-ffv1 test.

VERDICT: FAIL