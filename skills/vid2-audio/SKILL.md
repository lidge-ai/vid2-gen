---
name: vid2-audio
description: Use for timing and mixing a vid2 soundtrack. Triggers include beat grids, detected BPM, music beds, cue anchors, whooshes, risers, voice ducking, loudness, clipping, and audio QA.
---

# Audio direction

Pick the soundtrack before final cut timing. A declared grid `beat:{"bpm":120,"offset":"0s","meter":4}` gives 0.5 s beats and 2 s bars. Detect an existing track with `vid2 audio beats song.mp3 --json`; review the detected offset/downbeats, then commit a fixed grid in the timeline. Use `vid2 audio snap 12.3 --bpm 120 --offset 0 --json` as a timing aid. Prefer phrase_flow (2–4 s cuts at phrase boundaries) for explanation, beat_cut (0.5–1 s) only for a short energy burst. Do not put every cut on a kick for 30 s.

A cut at 12 s: `impact` and `click` use `anchor:"start"` so onset meets the cut; `whoosh` uses `anchor:"peak"` so the swell peaks at the cut; `riser` uses `anchor:"end"` so its end lands there. Explicit cue example: `{"at":"12s","sfx":"preset:impact","anchor":"start","volume":0.7}`. Cues can also reference a source ID or `elevenlabs:<prompt>`. `autoCues` adds transition/capture cues when the timeline asks for them; inspect them before adding duplicates.

A local bed can be a music source, or a synth: `{"music":{"synth":{"preset":"launch","key":"Am"},"volume":0.7}}`. Generate one with `vid2 audio synth --preset launch --bpm 120 --duration 30 -o music.wav`; preview presets with `vid2 audio sfx whoosh -o whoosh.wav`. Provider assets are explicit (`vid2 audio providers --json`, then `vid2 audio generate timeline.json`), cached before compile. Keep a voice stem separate and leave `duckMusicUnderVoice:true`; audition at normal listening level, because a numerically quiet bed can still mask consonants.

The default master target is −14 LUFS integrated and −1 dBTP. QA checks integrated loudness within ±1 LU and true peak at most target +0.5 dB. A missing audio stream is skipped unless audio was expected. Confirm music license and actual provider readiness before generation.
