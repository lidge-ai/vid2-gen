# Motion, easing, and transitions

Default entrance 0.35–0.45 s; exit 0.2–0.3 s. Stagger related labels by 0.08–0.16 s, and finish the group within 0.5 s. Let a reading hold last at least 1 s after motion. Motion speed vocabulary: slow = 1.05–1.12× zoom over 3–5 s; medium = 1.1–1.2× over 1.5–3 s; punch = 1.25–1.6× over 0.25–0.5 s. Describe moves with these numbers and an anchor point.

| Intent | Camera key ease | Example |
|---|---|---|
| Enter and settle | `out` | Push from zoom 1 to 1.12 in 0.4 s, then hold |
| Leave or accelerate to cut | `in` | Pull focus off the button during last 0.25 s |
| Continuous travel | `inout` | Pan x 0.45→0.55 over 2 s |
| Mechanical tracking | `linear` | Match a cursor or clip moving at steady speed |
| Single impact | `punch` | 1.25× at a reveal, then settle |

A hard `cut` resets attention or marks a new claim. A `fade`/`dissolve` says the thought continues; 0.2–0.4 s is enough for a product reel. A directional `slideleft`/`wiperight` can express navigation when it matches the actual UI travel. Use no more than 1–2 conspicuous transitions across a 5–7 beat passage; repeated shader transitions hide weak shot selection. A `fadeblack` may announce a chapter or ending. Probe both sides and midpoint of every non-cut transition, since overlapping scene starts change the total frame count.

Prefer motion tied to an event or audio hit. Idle wobble on every element makes the interface feel unstable. Let the hero move, keep the label still long enough to read, and move the camera once to reveal the proof.
