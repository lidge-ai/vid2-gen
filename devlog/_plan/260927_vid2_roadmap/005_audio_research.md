# 005 — audio digest

Full research (read-only Aside run, 2026-09-27): <aside-artifacts>/vid2-research/040-audio.md. This digest keeps only what the phase docs rely on;
claims marked TESTED were run on this Mac (ffmpeg 8.0.1) by the research agent, UNVERIFIED ones stay unverified.

- Pure-ffmpeg synthesis of kick/snare/hat/bass/pad/arp/riser/impact/whoosh/click with aevalsrc (TESTED); set s=48000 explicitly (aevalsrc/sine default 44.1k, anoisesrc 48k).
- Mixing: amix normalize=0 with explicit weights; sidechaincompress (linear threshold; input 0 compressed, input 1 key) for kick pump and voice ducking; reverb via aevalsrc-generated decaying-noise IR + afir gtype=peak (TESTED).
- Mastering: acompressor + alimiter(level=false) pre-limit, two-pass loudnorm I=-14 TP=-1 with measured values, -ar 48000 (loudnorm upsamples to 192k), verify with ebur128=peak=true; result -13.98 LUFS / -1.0 dBTP (TESTED). Linear vs dynamic mode depends on LRA and TP headroom; report normalization_type.
- Beat detection in Node: dependency-free spectral flux + autocorrelation tempo + comb phase (TESTED: 120 BPM exact on a synthetic loop, 0.43 s); downbeat heuristic weak on four-on-the-floor → prefer known grids from synthesized or planned music.
- Cut snapping: search ±0.12 s, prefer downbeats, quantize to frames, 1-frame lead (convention, UNVERIFIED as universal).
- ElevenLabs: POST /v1/music (prompt or composition_plan; v2/v2.5 chunks 3-120 s each, English styles), POST /v1/sound-generation (0.1-30 s), TTS with-timestamps (Korean on multilingual_v2 / flash_v2_5 / turbo_v2_5 / v3). ACE-Step 1.5 local REST :8001 release_task → query_result → /v1/audio, MIT. Stable Audio Open community license; Kokoro no Korean; Suno official API unverified.
- Sync pitfalls (reproduced): xfade video + concat audio drifts by overlap total → place audio on the timeline; mixed 44.1/48k → aresample; -shortest can drop audio → apad + explicit -t; AAC priming only in MP4; aeval c=same with -ac 2 segfaults on 8.0.1.

