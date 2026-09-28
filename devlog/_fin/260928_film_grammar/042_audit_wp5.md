Three contracts would still make a worker guess, and one offline test has no media source, so wp5 doesn't pass yet. The V-1..V-9 section does settle the reference-image chain, hash stability, warning text and write scopes. I made no edits.

1. **Hold warnings miss generated clips used as scene backgrounds.** `holdWarnings` only walks scene media layers and root overlays in the resolved timeline. But a scene's `background` can be a video source (`validate.ts:31`), and `segment.ts:99-107` turns it into a media layer only at compile time. So a generated clip used as a background can freeze with no warning.
   - **Fix:** state in the `hold.ts` contract that a scene background counts as a read with in 0, speed 1 and the full scene length, under that scene's id.
   - Add that case to `hold.test.ts`, or record the exclusion in V-9 as a known limit.
2. **Reference and seed paths: are they resolved before the guard or after?** `checkIma2VideoOptions` requires absolute `referenceImages` paths, but authored paths are relative to the timeline file, and `assets gen --ref` paths are relative to cwd. V-3 says only "inside requestFor before hashing", so a worker could run the guard on raw relative paths and reject every authored timeline.
   - **Fix:** state that `requestFor` resolves `seedImage` and `referenceImages` against the timeline's folder first, and `generateOne` resolves `--ref` against cwd. Only then is the guard called.
   - Missing files are checked after the guard (the "status" mode behavior from R2-1).
3. **The capability probe may not run on Windows CI.** V-7 says "run the ima2 executable directly… bypass call()". The fake CLI works on Windows only because `ima2.ts:92` builds a launch prefix: `ctx.bin`, or `[process.execPath, script]` for `.mjs` files. Spawning the configured path directly fails on Windows.
   - **Fix:** say the probe reuses that same prefix with `[...prefix.slice(1), "video", "--help"]` and no `--json`, and goes through `ctx.runner` so tests can intercept it.
4. **The offline example has no media.** `examples/generated-video/timeline.offline.json` has to use the file provider with a local clip, but generated media isn't committed, and V-1/V-8 don't say where that clip comes from on CI.
   - **Fix:** name the clip. Either generate it in the test with an ffmpeg command from a test pattern, for example `testsrc2` for 5 s at 320×180, or commit a fixture under 200 KB.
   - State that W3's case in `tests/e2e/examples.test.ts` renders at proxy with that clip on a 7 s layer and expects exactly one `W_GENERATED_CLIP_HOLD`.

VERDICT: FAIL