All three remaining blockers are closed, so wp3 passes. I checked the new A-8..A-10 section against the plan and the shared types, and changed no files.

- **Merge order (A-8):** closed. W2 now merges before W1, then W3. `run.ts` receives `analyzeAudio: AnalyzeAudioFn` as a parameter, so W1's tests can pass a fake. The real import is wired in `src/cli/commands/analyze.ts` and in review, and W3 merges last, after `audio.ts` exists. The old "merge W1 → W2 → W3" line at doc line 70 is overridden by the 000 precedence rule; tidy it when the doc is consolidated.
- **Spectrogram owner (A-9):** closed. W1's `artifacts.ts` writes `<out>/spectrogram.png`, and `run.ts` sets `artifacts.spectrogram` or `null` plus `SPECTROGRAM_UNAVAILABLE`. This matches `AnalyzeArtifacts.spectrogram: string | null` in the types.
- **No-audio warning (A-10):** closed. `run.ts` emits `NO_AUDIO` when `analyzeAudio` returns `null`, and a missing BPM only nulls the beat fields with no warning.

One non-blocking note for W1: when `NO_AUDIO` fires, `showspectrumpic` has no audio to draw. The spectrogram should be skipped and left `null`, and the no-audio test for accept 2 will catch it if it isn't.

VERDICT: PASS