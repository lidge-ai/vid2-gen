**REFLECTION: CHANGES.** Three workers can build WP3 in parallel, but only after the plan gives the command registry, the end-to-end test and the docs a single owner each. As written, `src/cli/registry.ts`, `tests/e2e/analyze-review.test.ts` and the four docs are shared. The analysis report schema also has to be committed first so the other two workers can build against it. The full reflection (39 lines) is in [reflection-wp3.md](/tmp/vid2-research/reflection-wp3.md); I changed no repository file.

**Worker split:**

| Worker | Owns |
|---|---|
| W1: visual analysis and the `analyze` command | `src/analyze/{shots,metrics,artifacts,sheet,report,run}.ts` and tests; `src/cli/commands/analyze.ts`; `extractStill` exported from `src/qa/artifacts.ts`; `tests/e2e/analyze.test.ts`. `report.ts` holds the whole report schema, including the audio block, and lands first. |
| W2: audio analysis | `src/analyze/audio.ts`; `src/audio/index.ts` (exports `onsetTimes`); a `decodeMono22k` helper split out of `detectBeats` in `src/audio/beats.ts` |
| W3: review, registry and docs | `src/review/*` including `listen.ts`; `src/cli/commands/review.ts`; `registry.ts` (registers both commands); `tests/e2e/review.test.ts`; the four docs, written last on the merged tree |

Merge order is W1, then W2, then W3.

**Contract conflicts that need fixes before dispatch:**

- **Two different URL rules.** 006 D3.3 had the image endpoint's base URL include `/v1`, and G-8 never restates that. G-9b adds `/v1/responses` to a bare host. Both env vars should be bare hosts, and the client adds the path. The audio endpoint must not default to the local proxy the way music2 does, because model calls are opt-in.
- **Error handling disagrees.** G-9b turns any listener failure into `UNHEARD`, while G-8 turns auth failures and timeouts into error exits. Listener failures should never change the exit code; G-8's rules should apply only to the image model. The plan also needs a table of outcomes, for example no image model while listening is configured.
- **The review report schema lacks the G-9 fields.** It has no `listen` block, no `findings[].source`, and no `--listen` options in the usage line.
- **Listener remarks can't become findings as specified.** Findings require a time and a scene, and the listener's remarks have neither. They should stay in `listen.reply` and reach findings only through the image model's prompt. The "low-end remarks are info" rule needs a `lowEnd[]` array in the listener's reply to work. `sync[]` conflicts with "DSP owns sync" and should be info-only or dropped.
- **"Decode once" contradicts the loudness pass.** True peak needs the original audio, so this takes two passes: one loudness pass on the source (also giving per-shot values), and one decode at 22.05 kHz for onsets and frequency bands.
- **Per-shot loudness is undefined for short shots.** Shots under 0.4 s (a half-beat at 132 BPM is 227 ms) should report `null`. The sub-bass band also needs an FFT of at least 4096 points to have enough frequency resolution.
- **The audio upload has no size limit.** 120 s of WAV is about 23 MB before encoding. Follow music2: mp3 at 64 kbps when available, otherwise mono 22.05 kHz WAV, with an 8 MB cap. The excerpt should default to the 30 s around the loudest point.
- **The evidence folder layout is unspecified.** QA writes to `<video>.qa` by default. Review should write `analyze/`, `qa/`, `evidence.json` and `review.json` inside its own output folder.
- **Some ownership details are unclear.** `artifacts.ts` should make one keyframe per shot and `sheet.ts` the pages. The sheet labels need a pinned font file. QA and analyze would each make a spectrogram; review should use only analyze's. The trust rules belong in `skills/vid2-cli/SKILL.md`, because the rubric reference file is WP4 work. The privacy test should also cover error details.