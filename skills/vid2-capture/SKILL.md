---
name: vid2-capture
description: Use for recording real web, Electron, desktop, or terminal product actions for a vid2 demo. Triggers include steps.json, action labels, event-based camera moves, capture permissions, cursor behavior, and claims about real UI.
---

# Real product capture

Capture an actual runnable product state. Do not fabricate controls, metrics, or features, or label a mock as footage. If the real UI is visually noisy, crop or frame the relevant part; keep its true labels and behavior.

For web, make `steps.json` with ordered `goto`, `click`, `type`, `press`, `hover`, `scroll`, `wait`, `waitFor`, `mark`, or `eval` actions. Use `vid2 schema --steps --json` for the exact shape. Put stable labels on story events (`open-settings`, `save`, `result`) so timeline EventRefs survive retiming. Run `vid2 capture web --steps steps.json --url http://127.0.0.1:3000 -o demo.vid2cap` or `--serve site/` for a local static site. Inspect with `vid2 capture inspect demo.vid2cap --json`; the session contains footage.mp4, actions.jsonl, and session.json. Typed text stays redacted unless `--record-text` is deliberately used.

For Electron, use `vid2 capture electron --app path --steps steps.json -o demo.vid2cap`. For native, use `vid2 capture devices --json` then `vid2 capture native --display 0 --duration 12 -o demo.vid2cap`; `--window` or `--region` can limit scope. For terminal, supply `--tape` or `--cast`. The native event hook is optional; use `vid2 capture mark demo.vid2cap save` from another shell when it is absent.

Screen Recording permission on macOS belongs to the terminal or IDE running vid2, not the target app. On Windows, verify the chosen desktop is recordable; on Linux, native capture uses X11 and does not support Wayland. An all-black recording is a warning to inspect permissions and device choice. Verify the first and last action frames before editing.

A capture source is `{ "type":"capture", "session":"demo.vid2cap" }`. On its first media layer, an event in `in`/`out` uses footage time; cue and marker event references use timeline time after placement. `camera:{"auto":"events"}` follows logged actions; override with explicit camera keys when the automated crop hides context. A synthetic cursor may be added with `cursor:{"style":"arrow"}`. See [timeline time](../vid2-timeline/references/time.md).
