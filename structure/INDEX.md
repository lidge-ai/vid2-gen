# Structure index

Current implementation contracts live here. Read the owning document before changing code, and update it in the same change.

1. [Overview](overview.md) — package boundaries, pipeline, dependency policy.
2. [CLI contract](cli-contract.md) — commands, JSON envelope, exit codes.
3. [Timeline](timeline.md) — schema v1, timing, validation, resolution.
4. [Probe](probe.md) — ffmpeg discovery, capabilities, doctor.
5. [Compiler](compiler.md) — render IR, segments, layers, motion, joins, escaping.
6. [Render](render.md) — profiles, cache, runner, verification.
7. [Text](text.md) — libass and raster text backends.
8. [Capture](capture.md) — sessions, surfaces, clock rule, auto camera and cursor.
9. [Audio](audio.md) — AudioPlan, synth beds, SFX anchors, providers, mastering.
10. [Assets](assets.md) — generated sources, cache, ima2-gen adapter.
11. [QA and preview](qa.md) — checks, severities, preview fidelity, placeholders.
12. [Skills](skills.md) — packaged agent skills and install.

The [completed 0.1 roadmap](../devlog/_fin/260927_vid2_roadmap/000_plan.md) records future work; these documents describe the current implementation.
