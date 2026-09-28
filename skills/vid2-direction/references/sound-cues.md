# Sound cues

Write a cue sheet before final cut timing: scene/time, visible event, source or preset, `anchor`, intended onset/peak/end frame, and whether an automatic cue already exists. An impact/click starts on a real hit (`anchor:"start"`); a whoosh peaks at the motion seam (`"peak"`); a riser ends at the reveal (`"end"`). These anchor names are vid2 behavior. Keep ambience and music less rigidly synced; silence or pullback can make one meaningful hit stronger. Theory digest (`devlog/_plan/260928_film_grammar/003_theory_digest.md`).

Example: `{"at":"12s","sfx":"preset:impact","anchor":"start","volume":0.7}`. Resolve the timeline to check the output frame. Avoid layering an authored impact over `autoCues` for the same event. A sub drop needs a mid/high transient to read on a phone, but the listener alone cannot validate sub-bass. Theory digest (`devlog/_plan/260928_film_grammar/003_theory_digest.md`), [review rubric](review-rubric.md).

Keep voice, bed and effects as separate stems. Duck music under voice, then listen for consonants at ordinary volume. The project's default −14 LUFS / −1 dBTP is an export target, not a platform-wide law. Measure the encoded output with DSP; use the optional listener for timbre, groove, arrangement and mood. See the [audio skill](../../vid2-audio/SKILL.md) and [review trust rules](review-rubric.md).
