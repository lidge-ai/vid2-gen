# Audio

`timeline.audio` becomes an `AudioPlan` (`src/compile/audio-plan.ts`, type in `src/compile/ir.ts`): generated beds and SFX as ffmpeg renders,
stems placed on the **absolute timeline** in 48 kHz samples, a mix graph, a loudness target and the output codec. Compile never touches the
network. The runner renders video-only, then renders the audio, masters it and muxes with an explicit duration.

```text
synth bed / SFX presets ─┐                                            ┌─ loudnorm pass 1 (measure)
music / voice files ─────┼─ stems @ samples ─ mix (ducking, glue, limit) ─ premaster ─┤
provider assets (cache) ─┘                                            └─ loudnorm pass 2 (linear) ─ master ─ mux (AAC | Opus, -t)
```

## Timing

`sample = round(frame / fps × 48000)`. Stems are delayed with `adelay=<N>S` and trimmed with `atrim start_sample/end_sample`, never milliseconds.
Audio follows the timeline, not the segments, so crossfades cannot drift. The beat grid is fixed: `beat: {bpm, offset, meter}` or `{map: "beats.json"}`
whose `offset` is seconds. `vid2 audio beats song.mp3` detects bpm/offset (spectral flux + autocorrelation) and lists beats and downbeats with
confidences for review; "b" literals always index the fixed grid.

## Sources

| Field | Meaning |
|---|---|
| `music: {synth: {preset, key, progression?, sections?}}` | generated bed: `launch` (intro, riser, drop, outro), `minimal`, `tech`, `none` |
| `music: {source: "id"}` | an audio or video source |
| `music: {provider: "elevenlabs" or "acestep", prompt}` | provider music from the cache |
| `cues: [{at, sfx, volume?, anchor?}]` | `sfx` is `preset:<name>`, a source id, or `elevenlabs:<prompt>` |
| `voice: [{source, at}] or [{tts: {text, voice?, language?, provider?}, at}]` | voice-over; music ducks under it |
| `autoCues` | whoosh on transitions, impact on drops, click and typing ticks on capture actions (default on with synth music) |
| `loudness: {target, truePeak}` | default −14 LUFS, −1 dBTP |

SFX presets (pure lavfi, no files): whoosh, riser, click, impact, pop, type, swoosh-up, shimmer. Each has an anchor: `start` (click, impact, pop:
the sound starts on the cut), `peak` (whoosh: its loudest point lands on the cut), `end` (riser: it ends on the cut). A cue's `anchor` overrides it.
Media layers with `volume > 0` contribute their own audio at their timeline position.

## Providers

Provider audio is generated only by `vid2 audio generate <timeline>`, cached under `$VID2_HOME/cache/audio` with a manifest keyed by a hash of
the request. A render with a missing asset stops with `E_INPUT` and that command as the fix. ElevenLabs (music, SFX, TTS with alignment) needs
`ELEVENLABS_API_KEY`; ACE-Step runs locally at `ACESTEP_URL` (default `http://127.0.0.1:8001`). Errors: not configured → `E_CAPABILITY`, 401/403 →
`E_ACCESS`, bad responses or failed tasks → `E_PROVIDER`, timeouts → `E_TIMEOUT`. Suno is not supported (no public API).

## Mastering

Explicit `amix normalize=0` weights, sidechain ducking of music under voice, a glue compressor and a pre-limiter, then two-pass `loudnorm` to
the target and a re-measure after the codec (warning when the delivered true peak exceeds the target by 0.5 dB). The render manifest and the
`render` JSON report master and delivered loudness and the audio/video duration difference.
