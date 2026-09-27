# 004 — capture digest

Full research (read-only Aside run, 2026-09-27): <aside-artifacts>/vid2-research/020-capture.md. This digest keeps only what the phase docs rely on;
claims marked TESTED were run on this Mac (ffmpeg 8.0.1) by the research agent, UNVERIFIED ones stay unverified.

- Architecture: agent action log (monotonic clock, target bbox, DPR) is the source of truth; record pixels with the OS cursor hidden; re-render cursor, ripples and camera deterministically; ffmpeg encodes.
- macOS: avfoundation works (pass -framerate before -i, explicit pixel_format e.g. bgr0, capture_cursor 0); ScreenCaptureKit is Apple's current API (future helper). Screen Recording permission belongs to the launching binary and needs an app restart; denial yields black frames.
- Windows: ddagrab (draw_mouse=0, hwdownload,format=bgra for software encoders, dup_frames holds CFR); gfxcapture per-window only in ffmpeg ≥ 8.1 (add fps= for CFR); gdigrab fallback. No permission prompt; WGC yellow border; DRM content black.
- Linux: x11grab (-draw_mouse 0); Wayland only via xdg-desktop-portal + PipeWire (no stock ffmpeg input) → documented unsupported; kmsgrab needs CAP_SYS_ADMIN, no cursor.
- Playwright ≥ 1.59 has page.screencast (onFrame, showActions); raw CDP startScreencast is VFR, needs ack per frame, maxWidth/Height bound output, metadata reports CSS px; set bounds to CSS×DPR and calibrate (prototype: --force-device-scale-factor=2 + viewport:null produced 2880×1800).
- Input hooks: uiohook-napi (needs macOS Accessibility/Input Monitoring; no Wayland); log key codes only.
- Cap (AGPL) documented constants used as reference values (re-implemented): camera spring stiffness 200 / damping 40 / mass 2.25, 8 ms steps, cluster box 0.5/Z × 0.7/Z; cursor spring 530/1/40 with 500 ms click lookahead and friction/tension phase lead; click shrink 0.8 for 130 ms; idle fade after 500 ms over 400 ms; ≤ 6 ripples, radius 1.25 × cursor height, 0.6 s.
- Auto-zoom defaults from the synthesis: pad target rect 8-15 %, scale so it fills 35-60 % width clamped 1.15-2.2, merge actions < 0.7 s apart, lead-in 180-260 ms, hold 350-700 ms, lead-out 220-320 ms.
- Terminal: VHS tapes for scripted demos; asciinema cast (v2 absolute times) + agg for recorded sessions.
- Licensing: copy ideas not code from Cap (AGPL) and Screenity (GPL); Kap and OpenScreen are MIT.

