# 040 — wp5 Audio (beat grid, synth presets, SFX, voice/music providers, mix, loudness)

Consumes 010/020 (AudioPlan hook, runner), 030 (capture events for auto cues via decorateCaptureLayers). Research: 005_audio_research.md (digest of Aside 040-audio.md,
commands marked TESTED there were run on this Mac's ffmpeg 8.0.1), prototype music.mjs. ARCH-07.

## wp5 architect consultation

Architect Gibbs W5-01..W5-06 (2026-09-28), measured on ffmpeg 8.0.1 **and** 6.1: an 8 s four-bar 120 BPM aevalsrc loop at 48 kHz and five
lavfi SFX (whoosh, riser, click, impact, pop) render on both; `amix normalize=0` peaks 0.3812 vs 0.1906 normalized (explicit weights needed);
sidechain ducking drops music RMS 0.0884 → 0.0290 under voice; two-pass loudnorm JSON parses and lands at −13.95 LUFS, ebur128 reads −14.0;
`aeval=exprs=val(0):c=same` + `-ac 2` segfaults (signal 11) on both. `silencedetect`/`ebur128` give no beat positions for dense music.
Dispositions:

- W5-01 accept. **AudioPlan (ir.ts, main-first):** `{version: 1; sampleRate: 48000; durationSamples; renders: AudioRender[]; stems: Stem[];
  graph: string; target: {I, TP, LRA}; codec: "aac" | "opus"; premaster: string; master: string; provenance: ProvenanceEntry[]}` where
  `AudioRender = {id; kind: "synth" | "sfx"; args: string[]; out: string; hash}` (an ffmpeg command the runner materializes to a cached 48 kHz
  WAV) and `Stem = {id; role: "music" | "sfx" | "voice" | "media"; path; atSample; trimSamples?; gain; fadeOutSamples?}`. Compile is pure (no
  network): provider audio must already be a cached local file produced by `vid2 audio generate <timeline>` (the single authoritative command); a missing asset → E_INPUT with that
  command as the fix. The runner renders video-only as before, then renders `renders`, mixes stems on the **absolute timeline** to the premaster,
  runs two-pass loudnorm to the master, and muxes with explicit `-t`: AAC 256k for mp4/mov, Opus 192k for webm. `audio: null` keeps the
  video-only path unchanged.
- W5-02 accept (lanes below).
- W5-03 accept: weights always explicit; generated graphs never contain `aeval … c=same`. CI tests whatever ffmpeg each runner installs and
  logs its version (`ffmpeg -version` step; Ubuntu 24.04 currently ships 6.1.x); the 6.1 behaviour above was also checked locally with a 6.1 build.
  Placement is sample-accurate (reflection wp5): delays use sample units `adelay=delays=<N>S:all=1` and trims `atrim=start_sample/end_sample`,
  never milliseconds.
- W5-04 accept: every SFX preset declares `{durationS, peakS (onset/peak offset used for placement), gainDb, seed}`; whoosh/riser quality is
  judged by listening in wp8, render success only proves compatibility.
- W5-05 accept: **v1 beat grid is fixed BPM + offset + meter.** `beats.json` supplies bpm/offset/meter (declared or detected); its `beats`/
  `downbeats` arrays and confidences are review data for agents (`vid2 audio beats`), not a variable-tempo grid. "b" literals index the fixed grid.
- W5-06 accept: tests for cue alignment in samples, ducking RMS before/during/after, weights, loudnorm JSON parse, post-codec loudness, and
  audio duration = video duration ± 1 frame; providers tested against local HTTP mocks (missing key, server down, malformed body, timeout, failed
  task → the error mapping in the audit folds below: E_CAPABILITY, E_ACCESS, E_PROVIDER or E_TIMEOUT); live providers are opt-in.
  Test: a cue `elevenlabs:<prompt>` is materialized by `audio generate` against the mock, resolves from the manifest, and renders with the provider stubbed to throw.

| Lane | Owner | Exclusive write scope |
|---|---|---|
| 0 (first) | main | AudioPlan types in `src/compile/ir.ts`, `src/audio/providers/port.ts`, `src/audio/index.ts` stub |
| Beat+synth | sol | `src/audio/{beats,fft,grid,chords}.ts`, `src/audio/synth/**` + tests |
| SFX+cues | sol | `src/audio/cues.ts`, `src/audio/sfx/**` + tests |
| Mix+master | sol | `src/audio/{mix,loudness,mux}.ts` + tests |
| Providers | sol | `src/audio/providers/{file,elevenlabs,acestep,manifest}.ts` + mock-server tests |
| Integration (last) | main | (also `src/capture/decorate.ts` captureEvents, `src/audio/index.ts` final exports) `src/timeline/{schema,types,resolve,validate}.ts` + schema JSON, `src/compile/plan.ts` (+ `src/compile/audio-plan.ts`), `src/render/runner.ts`, `src/cli/commands/audio.ts`, registry, CI, `structure/audio.md`, README, `tests/e2e/audio.test.ts`, fixtures |

## Scope

IN: beat grid resolution (declared BPM/offset/meter, imported beats.json, or detected from an audio file); `vid2 audio beats <file>`;
synthesized music presets and SFX presets rendered by ffmpeg `aevalsrc`/`anoisesrc` graphs; cue placement (riser end / impact start
on the cut, whoosh peak on the cut, click on event); voice and music from files or providers; mixing with explicit weights
(`amix normalize=0`), sidechain ducking (music under voice, optional kick pump), send reverb via generated IR + `afir`; two-pass
loudnorm to target LUFS/TP with `-ar 48000`; mux into the render with exact duration; audio QA numbers (integrated LUFS, TP, LRA).
Providers: file (default), ElevenLabs (music / SFX / TTS with timestamps), ACE-Step 1.5 REST (local). CLI: the `vid2 audio` subcommands in the file map (mixing stays internal to render).
OUT: Suno (no public API contract verified), Stable Audio (python sidecar; documented as future provider), stem separation.

## Timing contract

The video timeline is the master clock. Scene cuts are resolved frames (010). For audio, positions are samples at 48 kHz:
`sample = round(frame / fps * 48000)`. Transitions in the video are crossfades; audio follows the **timeline**, not per-segment audio,
so the xfade/concat drift pitfall (research: +1.0 s over two joins) cannot occur: per-segment media audio (MediaLayer.volume > 0) is placed
at its absolute timeline position with `adelay` and trimmed/faded to the layer span, never concatenated per segment.
Beat grid: `beatTime(k) = offset + k * 60 / bpm`; `downbeat = k % meter == 0`. `snapToBeat(t, grid, {win: 0.12s, leadFrames: 1})` from
research 2.4 is exposed to the timeline as literal "b" units (already in 010) plus `vid2 audio snap` for agents that author in seconds.

## Beat detection (src/audio/beats.ts)

Decode with `ffmpeg -v error -i <file> -ac 1 -ar 22050 -f f32le -`; spectral flux (N=1024, H=256, Hann, log-magnitude `log1p(100·|X|)`),
local-mean subtraction (±0.1 s) + half-wave rectification; tempo by autocorrelation over 60–180 BPM in 0.5 steps with a log-Gaussian prior
at 120 (σ = 0.9 octave); phase by comb sum; downbeat by low-band (≤ 260 Hz) energy phase over 4 candidates (flagged `downbeatConfidence`
low when phases score within 5%). Output `beats.json`: `{version:1, bpm, offset, meter: 4, beats: number[], downbeats: number[],
confidence: {tempo, downbeat}, source: {path, sha256}, method: "spectral-flux-v1"}`. Own radix-2 FFT (no dependency). Tests: synthetic
click track at 100/120/140 BPM generated with ffmpeg → bpm within ±1, first beat within ±20 ms; performance < 2 s for 60 s audio.

## Synth (src/audio/synth/*)

Engine (engine.ts): builds per-instrument `aevalsrc=exprs='…':s=48000:d=<D>` inputs (mono), filter chains, and an `amix` bus. Always set
`s=48000` (aevalsrc/sine default 44.1 kHz, anoisesrc 48 kHz) and `-ac 2` only at the bus via `aformat=channel_layouts=stereo` — never
`aeval c=same` with `-ac 2` (segfault on 8.0.1, research 6). Expressions use `st/ld` for chord state (prototype music.mjs).
Instruments (instruments.ts, each `(ctx: {bpm, key, progression, sections, duration}) => {expr, filters, weight}`): kick (pitch-swept sine
150→48 Hz), snare/clap (noise burst + 190 Hz body), hats (8ths/16ths by energy), bass (saw + octave sine, 8th plucks, lowpass 420),
pad (detuned tri/saw per chord, lowpass 1500, slow attack), arp (16th chord tones, pluck env, dotted-8th echo), riser (chirp + noise,
quadratic swell, ends on the next drop), impact (sub drop + noise crack), crash (noise, long decay, highpass 5k), whoosh (noise, sin³ bell,
band-pass), click (2.2 kHz blip), type (short filtered ticks). Keys/progressions: `Am` → [Am,F,C,G], `C` → [C,G,Am,F], `Dm`, `Em`, custom
chord names parsed by chords.ts (root + quality maj/min/7/sus2/sus4 → three frequencies in octave 3–4).
Presets (presets.ts): `launch` (intro pad+riser, groove, build with snare roll, drop at the first "drop" section, outro reverb tail —
the prototype's 30 s structure generalized to any length by sections), `minimal` (pad + soft kick + hats), `tech` (arp-forward), `none`.
Sections come from `audio.music.synth.sections`; default: intro 0–12% / build to first 30% / drop until 85% / outro. Energy gates are
expression windows `between(t,a,b)`.
Mix bus: sidechain pump (`[music][kick]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=120`) optional per preset; send reverb
`afir=gtype=peak` with an IR generated by aevalsrc (`(2*random(0)-1)*exp(-3.2*t)`, L/R decorrelated, lowpass 7k, d 2.2 s) at 25–35 % wet.

## Cues (src/audio/cues.ts)

Cue `at` (Time incl. EventRef) → sample. Placement per SFX kind: impact/click start at the cut; whoosh anchored on its preset peak (see audit folds; formerly start = cut −
length/2); riser ends at the cut (start = cut − length). Auto cues (`audio.autoCues: true`, schema addition, default true when synth music is
used): whoosh at every non-cut transition midpoint, impact at scenes whose transition is `fadewhite` or at section "drop", click at capture
click actions inside visible spans, typing ticks during capture `type` actions. Each placed with `adelay=delays=<N>S:all=1` (samples).
SFX sources: synth preset name, file path/source id, or provider (`elevenlabs:<prompt>` — the single canonical form, cached by requestHash).

## Voice + providers (src/audio/providers/*)

Port: `interface AudioProvider { id; capabilities(): Promise<{music?: boolean; sfx?: boolean; tts?: boolean; reason?: string}>;
music?(req: {prompt?; plan?; durationMs; bpm?; seed?}): Promise<AudioAsset>; sfx?(req: {text; durationS; loop?}): Promise<AudioAsset>;
tts?(req: {text; voiceId?; language?; model?}): Promise<AudioAsset & {alignment?: {chars: string[]; start: number[]; end: number[]}}> }`,
`AudioAsset = {path; durationS; sampleRate; provenance: {provider; requestId?; params; createdAt}}`, cached by hash(params) under
`cacheDir("audio")`.
- elevenlabs.ts: key from `ELEVENLABS_API_KEY`; music `POST /v1/music?output_format=mp3_48000_192` with `model_id` default `music_v2_5` and a
  `composition_plan` built from timeline sections (chunk durations in whole bars at the declared BPM, styles English), SFX
  `POST /v1/sound-generation` (`eleven_text_to_sound_v2`, 0.1–30 s), TTS `POST /v1/text-to-speech/{voice}/with-timestamps`
  (`eleven_multilingual_v2`, `language_code`), alignment → optional ASS captions (060 uses it). Missing key → capability false with reason.
- acestep.ts: base URL `ACESTEP_URL` (default http://127.0.0.1:8001); `POST /release_task` {prompt, lyrics:"[instrumental]", bpm,
  key_scale, time_signature:"4", audio_duration, inference_steps:8, batch_size:1, audio_format:"wav", seed}; poll `/query_result`
  (status 1 ok / 2 failed; result is a JSON string) with backoff up to a timeout; download `/v1/audio?path=…`; beat phase re-detected
  with beats.ts. Health probe `GET /health`.
- file.ts: probe + resample.
Field chains (audit blocker 3; each goes schema.ts → regenerated schema/timeline.v1.json → resolve.ts resolved form → consumer → tests for parse,
unknown key, drift and resolve): `audio.music.provider` → ResolvedAudio.music {kind:"provider"} → providers/*.ts via mix.ts; `audio.voice[].tts` →
ResolvedAudio.voice[] {kind:"tts", atFrame} → provider tts → mix.ts; `audio.autoCues` → ResolvedAudio.autoCues → cues.ts; `Cue.sfx` prefixes →
ResolvedCue {kind: preset|source|provider, ref, atSample} → cues.ts. Tests in src/timeline/resolve.test.ts and src/audio/cues.test.ts.
Timeline additions (MODIFY src/timeline/schema.ts, additive): `audio.music` union gains `{provider: string, prompt: z.string().optional(),
plan: z.unknown().optional(), volume}`; `Cue.sfx` accepts "preset:<name>", "<sourceId>", "elevenlabs:<prompt>"; each `audio.voice[]` entry
becomes a strict union (audit round 2): `{source, at, volume}` (file) **or** `{tts: {provider, text, voice?, language?}, at, volume}` (TTS);
`Cue` gains `anchor: z.enum(["start","peak","end"]).optional()` (overrides the preset anchor); `audio.autoCues: boolean`.
Each addition ships with the regenerated JSON Schema, resolved types (`ResolvedVoice.kind: "file"|"tts"`, `ResolvedCue.anchor`) and parse/
unknown-key/drift/consumer tests (a TTS-only voice and an anchored cue must parse; a voice with both source and tts must fail).

## Mix + master + mux (src/audio/mix.ts, loudness.ts)

AudioPlan: see the consultation section (W5-01) — ir.ts is authoritative.
Premaster graph: every stem `aresample=48000`, placed (`adelay`), padded (`apad=whole_dur=D`), trimmed (`atrim=end_sample=N`), weights in
`amix=inputs=K:normalize=0:duration=longest:weights='…'`, voice-key sidechain ducking of music when voice exists
(threshold 0.03, ratio 6, attack 20, release 400), glue `acompressor=threshold=0.1:ratio=3:attack=10:release=150:makeup=2`,
pre-limit `alimiter=limit=0.7:level=false`. loudness.ts: pass 1 `loudnorm=I:TP:LRA=11:print_format=json` (parse the JSON block from
stderr), pass 2 with measured values `linear=true` and `-ar 48000 -c:a pcm_s24le`; report `normalization_type`; verify with
`ebur128=peak=true` → `{integrated, truePeak, lra}`; (music.fadeOut is a music-stem fade before the mix, audit round 1 blocker 5). Mux (mux.ts): `-map 0:v -map 1:a
-c:v copy -c:a aac -b:a 256k -ar 48000 -t <videoSeconds>` (webm: `-c:a libopus -b:a 192k`, W5-01) (explicit `-t`, never `-shortest`), then re-measure TP after AAC and warn if
> target + 0.5 dB. Render manifest records the numbers.

### Audit wp5 round 1 folds

- Beat phase (blocker 1): `beats.json.offset` is **seconds**; `beatGrid()` in resolve.ts converts it with `offsetFrames = round(offset × fps)`
  (a legacy `offsetFrames` key is still read). Test: a beats file with bpm 120, offset 0.25 s at 30 fps → `"2b"` resolves to frame 38.
- Capture auto cues (blocker 2): `decorateCaptureLayers` (030) also emits `ResolvedTimeline.captureEvents: {frame (absolute timeline), kind,
  sourceId, label?}[]` for actions inside each capture layer's visible span (same clock rule as the camera). `src/compile/audio-plan.ts` reads
  them for click/typing auto cues. Tests: a click inside the span yields a cue at its sample; a click after the layer end yields none.
- Provider assets (blocker 3): request key `requestHash = hashJson({provider, kind, params})` (params normalized: prompt, durationS, voice, seed,
  model, plan); manifest `cacheDir("audio")/manifest.json` maps requestHash → `{path, provenance}`. `ProvenanceEntry = {stemId, provider,
  kind, requestHash, requestId?, model?, createdAt, path}` (JSON-safe). Compile looks assets up by hash only; a miss → E_INPUT
  "run vid2 audio generate <timeline>" (that command calls providers for every missing request and fills the manifest). Render never calls a
  provider (test: provider fetch stubbed to throw, cached plan renders). Error mapping: missing key/server not configured → E_CAPABILITY;
  HTTP 401/403 → E_ACCESS; other 4xx, malformed body, failed task → E_PROVIDER; connection refused → E_PROVIDER (retryable); timeout → E_TIMEOUT
  (retryable).
- Cue anchors (blocker 4): each preset declares `anchor: "start" | "peak" | "end"` with `peakS`; start = cut (start anchor: click, impact, pop),
  `cut − round(peakS × 48000)` (peak anchor: whoosh), `cut − round(durationS × 48000)` (end anchor: riser). File/provider SFX default to
  "start" (override `anchor` on the cue). Test: render each anchor kind against a known cut and detect the onset/peak in the decoded PCM within
  ±2 ms.
- Fade and loudness order (blocker 5): `music.fadeOut` is applied to the music stem **before** the mix; the master is measured after loudnorm and
  again after codec encoding (warning if TP > target + 0.5 dB). Test: an SFX that starts during the music fade stays at full level.
- Ownership (blocker 6): see the file map below.

## File map

NEW src/audio/{beats,fft,grid,cues,mix,loudness,chords}.ts, src/audio/synth/{engine,instruments,presets}.ts,
src/audio/providers/{port,file,elevenlabs,acestep}.ts, src/audio/index.ts, src/cli/commands/audio.ts (subcommands listed below);
tests: beats (synthetic click tracks), fft, chords, grid/snap, cues placement math, engine expression snapshots, loudness JSON parser,
providers with a local node:http mock (ElevenLabs + ACE-Step shapes); tests/e2e/audio.test.ts renders a 6 s `launch` preset and checks
ebur128 integrated −14 ± 0.5 LUFS and TP ≤ −0.9 dBTP, and a 2-scene video+audio render where audio duration = video duration ± 1 frame.
MODIFY src/compile/ir.ts (AudioPlan fields below replace the opaque 020 declaration), src/compile/plan.ts (AudioPlan build),
src/render/runner.ts (audio stage + mux), src/timeline/schema.ts + src/timeline/resolve.ts (field chains), README (Audio section),
structure/audio.md NEW.
Also NEW: src/audio/sfx/{presets,render}.ts (SFX lane), src/audio/mux.ts (mix lane), src/audio/providers/manifest.ts (providers lane),
src/compile/audio-plan.ts and src/cli/commands/audio.ts — the one authoritative subcommand set: `beats <file>`, `snap`, `synth` (render a
preset to WAV), `sfx <preset>` (render one SFX), `generate <timeline>` (materialize every missing provider asset: music, SFX, TTS),
`providers` (capabilities) (integration). E2E: the cache-miss `fix` command, run against local mock providers, fills music, SFX and TTS
assets and the next render succeeds with no network,
tests/e2e/audio.test.ts, tests/fixtures/timelines/audio-*.json. MODIFY (integration): src/timeline/{types,schema,resolve,validate}.ts,
schema/timeline.v1.json (regenerated), src/capture/decorate.ts, src/cli/registry.ts, .github/workflows/ci.yml (ffmpeg -version log), README.

## Verification (C for wp5)

`npm test` including audio e2e; manual: `vid2 render tests/fixtures/timelines/launch-audio.json -o /tmp/a.mp4 --json` then
`ffmpeg -i /tmp/a.mp4 -af ebur128=peak=true -f null -` shows I ≈ −14, TP ≤ −1; `vid2 audio beats` on the synthesized bed returns the
declared BPM ± 1.

