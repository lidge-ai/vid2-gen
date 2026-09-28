Seven blockers remain, so wp3 doesn't pass as written. I checked the plan against HEAD `41252760` and changed no files. The R-1..R-9 amendments settle most of the earlier contradictions (font, WAV vs MP3, `sync`, endpoints, exit codes). What's left is two merge-order problems between workers and five contracts a worker would still have to guess.

1. **W1 needs W2's code before W2 merges.** W1's `src/analyze/run.ts` has to call W2's `src/analyze/audio.ts`, and W1's `tests/e2e/analyze.test.ts` covers accept 1–2 (onset and beat numbers). But W1 merges first, and the doc never defines the `audio.ts` function signature.
   - **Fix:** write the signature into the doc, for example `analyzeAudio(video, shots, {ffmpeg, bpm?, beatOffsetS?}): Promise<AudioAnalysis | null>`, returning `null` when there's no audio stream.
   - Then split W1 so `report.ts` (all types, including the audio block) merges first, W2 merges next, and the rest of W1 (`run.ts`, the analyze command, its e2e test) merges after.
2. **The analyze e2e test can't pass at W1's merge.** W3 owns `src/cli/registry.ts` for both commands, but `vid2 analyze` isn't registered until W3 lands.
   - **Fix:** let W1 add the analyze registration line and W3 add review. The merges are sequential, so the one-line overlap is safe. Say so explicitly, since the doc currently says "no shared files".
3. **The listener reply schema is ambiguous.** G-9b says the reply "follows music2", but R-3 adds `lowEnd[]` and leaves out `genre_fit`. The music2 prompt and validator (`critic.tool.ts:36-72`) require `genre_fit` and have no `lowEnd`.
   - **Fix:** write the exact prompt field list and validator rules into the doc. For example: `lowEnd` is optional and defaults to `[]`; `genre_fit` is ignored if present; a missing required field makes the result `UNHEARD`.
4. **"Low-end listener findings become `info`" can't be tested.** `findings[].category` is free text, so nothing identifies a finding as being about low end.
   - **Fix:** make `category` an enum that includes `lowEnd`. State the rule as `source === "listener" && category === "lowEnd"` forces `severity: "info"`, and test it with the fake server.
5. **Accept 5 and G-9d need a live proxy.** The local proxy at `127.0.0.1:10100` with gpt-6-astra and gemini-3.8-flash is required, and the doc says nothing about what happens when that route is down.
   - **Fix:** mark accept 5 as a live receipt outside the D gate, recording model, route and date. If it's unavailable, report "not fully verified", as 040 already does. Offline acceptance is accept 1–4 plus the fake-server and synthetic-tone tests from G-9.
6. **Missing CLI and schema defaults.**
   - `vid2 analyze` has no default output folder. R-8 only defines `<video>.review`.
   - In scene-detect mode, `shots[].sceneId` is undefined.
   - The image client's API key has no stated absent behavior, while the listener's defaults to `"local"`.
   - **Fix:** default analyze output to `<video>.analyze/` with the same layout as `D/analyze/` in R-8. Set `sceneId: null` when there's no timeline. Use one key rule for both clients, for example "absent key sends no Authorization header".
7. **No one owns the FFmpeg capability check.** analyze and review need `ebur128`, `showspectrumpic`, `signalstats` and scene `select`. `ebur128` and `showspectrumpic` are only optional probe filters today (`src/probe/index.ts:24-25`), and the doc doesn't say what happens when one is missing.
   - **Fix:** give W1's `run.ts` a `requireFeatures` call that raises `E_CAPABILITY` for the video filters. Pick a rule for a missing `showspectrumpic` (skip the spectrogram with a warning, or fail) and give that path a test.

VERDICT: FAIL