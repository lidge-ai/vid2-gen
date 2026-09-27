# 003 — ffmpeg techniques digest

Full research (read-only Aside run, 2026-09-27): <aside-artifacts>/vid2-research/010-ffmpeg-techniques.md. This digest keeps only what the phase docs rely on;
claims marked TESTED were run on this Mac (ffmpeg 8.0.1) by the research agent, UNVERIFIED ones stay unverified.

- Text: animate with libass (\t, \move, \fad, \fscx/\fscy, \blur, \clip, karaoke); animated drawtext fontsize segfaults on 8.0.1 (TESTED) → 020 uses ASS.
- Keyframes on any command-capable filter: sendcmd [expr] with TI 0..1 (TESTED); used later for overlay/eq automation.
- xfade: 58 built-ins + custom expr where P runs 1→0 (TESTED); offset ≥ len(A) silently yields only A (TESTED) → join validation; inputs must share size, timebase (settb=AVTB), fps, pix_fmt.
- Ken Burns smoothness (mean |accel| px): zoompan 0.288, zoompan after 4× upscale 0.066 (7× slower), scale+crop 0.340, perspective cubic 0.0155, perspective on 2× oversample + area downscale 0.0043 (TESTED) → 020 motion.ts uses perspective; perspective has no t, use in/on.
- Motion blur: render synthetic motion at N×fps then tmix=frames=N,fps=out (physically plausible); minterpolate blend for footage.
- Grading chain lut3d/curves/eq/colorbalance/colortemperature/vignette/noise; JPEG/PNG inputs stay full range with libx264 unless scale=out_range=tv (TESTED).
- Compositing: static mask PNG + alphamerge ~3× faster than per-frame geq (TESTED); blend needs equal size/format, use gbrp; two-input scale=rw:rh replaces scale2ref.
- Performance: parallel chunk renders + concat demuxer copy + audio encoded once over the whole timeline (TESTED); probe hw encoders with a 1-frame test encode.
- Pitfalls table 1-18 (drawtext crash, xfade P direction, silent offset, timebase, yuvj420p, perspective t, zoompan defaults, crop integer, looped inputs, blend, -vsync legacy, removed options, scale2ref, concat SAR/audio, -shortest, VFR ingest, libass silent font fallback, escaping differences → graph files via -/filter_complex).
- Borrow: auto-editor v3 rational timebase IR, MLT/OpenShot per-property keyframes with named easings, editly's frame-server escape hatch (not in 0.1).

