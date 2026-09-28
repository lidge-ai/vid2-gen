The last blocker is closed, so wp4 now passes. W-12 has W2 change `checkCapabilities` in `plan.ts` to require the ffv1 encoder and decoder whenever `t.hud` is present. W2 leaves `STAGE_FAMILY` alone, and the HUD-only no-ffv1 test that expects `E_CAPABILITY` stays.

Two older lines still describe the dropped approach: R2-7 at line 46 and the "segment.ts STAGE_FAMILY adds hud" entry in W2's row at line 63. W-12 overrides both under the plan's precedence rule, so they don't block. Remove them when the doc is consolidated.

VERDICT: PASS