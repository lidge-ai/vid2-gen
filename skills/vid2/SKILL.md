---
name: vid2
description: Use for creating or revising product, launch, demo, changelog, or social videos with vid2. Triggers include a video brief, an existing timeline, real product capture, motion direction, sound design, and render QA.
---

# vid2 router

vid2 is a timeline compiler and local renderer. Read the smallest domain skill that owns the decision. Ask for a human still review only when the user requested one; authorization to make a video includes preview and rendering.

| Current state | First action | Next skill |
|---|---|---|
| Request resembles a shipped example or template ("make a video like…", paper cutout, puppets, launch film, keynote intro) | Pick the closest example and copy it into a workspace. | [examples](../vid2-examples/SKILL.md) |
| Existing video or timeline | Inspect timeline, sources, output and last QA report; validate it. | [timeline](../vid2-timeline/SKILL.md) and [CLI](../vid2-cli/SKILL.md) |
| Timeline exists but needs creative revision | Keep its real sources and timing anchors; storyboard the affected scenes. | [direction](../vid2-direction/SKILL.md) |
| Fresh brief | Write one takeaway, audience, aspect, length, source inventory, and 1–2 visual references; create scene stills first. | [direction](../vid2-direction/SKILL.md), then [timeline](../vid2-timeline/SKILL.md) |
| Product walkthrough | Capture the actual UI and label events before composing. | [capture](../vid2-capture/SKILL.md) |
| Music, SFX, or voice | Set a fixed beat grid and align audible peaks. | [audio](../vid2-audio/SKILL.md) |

Default sequence: validate → resolve → preview stills → proxy render → QA → fix one cause → final render → QA. See [CLI loop](../vid2-cli/SKILL.md). A preview is a visual check, not an approval gate. Inspect the result and finish the authorized video.

For a new deliverable, keep the authored `timeline.json`, capture session, local source assets, preview stills, and QA artifacts together. Never claim an invented interface is a capture of the real product. Generate media before render; render itself never calls a provider unless `--generate` is explicitly chosen.
