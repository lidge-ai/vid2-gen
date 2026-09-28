Four of my seven blockers are fully closed. Three gaps remain: A-1 leaves the merge order contradictory, and A-1/A-7 leave two new ownership and naming gaps. I checked the A-1..A-7 section and both type files without editing anything, and took your word that typecheck passes.

**Closed:**

- **A-2 (registry):** closed. W1 adds analyze and W3 adds review, a two-line overlap.
- **A-3 (listener reply):** closed. `ListenReply` and `ListenReason` include `lowEnd` and `malformed_reply`.
- **A-4 (low-end findings):** closed. `FINDING_CATEGORIES` includes `lowEnd`, so the `info` rule can be tested.
- **A-5 (live proxy run):** closed. Accept 5 is now a live receipt outside the gate.
- **A-6 (defaults):** closed. `sceneId: string | null`, the `<video>.analyze/` default, and the no-key rule are all in place.
- **A-7 (capability check):** closed. `requireFeatures` checks against the full `ffmpeg -filters` set (`src/probe/ffmpeg.ts:69`), so `scale`, `select` and `signalstats` can be required.

**Remaining blockers:**

1. **Merge order still contradicts A-1.** The worker table still says "merge W1 → W2 → W3". But A-1 has W1's `run.ts` import `analyzeAudio` from W2's `src/analyze/audio.ts`. If W1 merges first, typecheck fails on a missing module, and `run.test.ts` can't even load before W2 exists.
   - **Fix:** change the table to W2 → W1 → W3.
   - Have `run.ts` accept an `analyzeAudio: AnalyzeAudioFn` parameter, with the real import wired in `src/cli/commands/analyze.ts`, so W1's unit tests can pass a fake.
2. **No one owns the spectrogram.** G-9a puts it under the audio pass, R-8 puts it at `D/analyze/spectrogram.png`, and A-7 makes `run.ts` handle a missing `showspectrumpic`. But `AnalyzeAudioInput` has no output folder and `AudioAnalysis` has no spectrogram path, so W2 can't write it. W1's ownership row doesn't list it either.
   - **Fix:** assign it to W1's `artifacts.ts`, which writes `<out>/spectrogram.png` with `showspectrumpic=s=1280x320:legend=0`.
   - `run.ts` then sets `artifacts.spectrogram`, or `null` plus the `SPECTROGRAM_UNAVAILABLE` warning.
3. **The no-audio warning has no name.** Accept 2 requires a warning when there's no audio. `AnalyzeReport.warnings` is `string[]`, and `AudioWarning` has no member for it, so W1's test would have to invent a string.
   - **Fix:** name it (for example `NO_AUDIO`, emitted by `run.ts` when `analyzeAudio` returns `null`).
   - Also say whether a missing BPM warns or only nulls the fields.

VERDICT: FAIL