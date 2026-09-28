All four of my blockers are closed, so wp5 passes. I checked V-10..V-13 and the updated contract comments without editing anything.

- **Background clips (V-10):** closed. A scene `background` naming a generated video now counts as a read in `hold.ts` (in 0, speed 1, whole scene length, that scene's id), and `hold.test.ts` covers it.
- **Path order (V-11):** closed. `requestFor` resolves seed and reference paths against the timeline folder, and `assets gen` resolves `--ref` against cwd. Then the guard runs, and file existence is checked last. The comment in `video-options.ts` says the same.
- **Windows probe (V-12):** closed. The probe reuses the `ima2.ts` launch prefix without `--json` and goes through `ctx.runner`, so the fake CLI works on Windows and tests can intercept it.
- **Offline example (V-13):** closed. The test generates a 5 s `testsrc2` clip at test time, so nothing is committed, and expects exactly one `W_GENERATED_CLIP_HOLD`.

One note that doesn't block: W3 owns both the offline timeline and its test, so W3 just has to keep them consistent. The simplest way is for the test to copy the example into its temp dir, as the other example tests do, and write the clip at the path `timeline.offline.json` names. That media path should be gitignored.

VERDICT: PASS