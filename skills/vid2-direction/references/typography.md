# Type that survives video compression

At 1920×1080, start a headline around 72–96 px, support line 38–52 px, small label 28–36 px. At 1080×1920, test the same **pixel** sizes at phone viewing size and increase as needed. Keep text within 5% title-safe margins (96 px horizontal and 54 px vertical for 1080p). Give it a box or darkened backing when live footage changes underneath. Large text should hold at least 1.2 s; add about 0.25 s per extra short line, then watch at actual speed.

Use weight contrast: a heavy 900-like headline against a regular 300–400 support line, or a semibold headline against a serif quote. Avoid pairing two near-identical sans faces. The built-in `sans`, `mono`, and `serif` IDs are reliable; a custom `fonts` entry can point at a licensed local file. Do not use a fashionable font by default when the product already has a brand typeface.

Use `text` layer `size`, `weight`, `maxWidth`, `align`, `x`, `y`, `box`, and `shadow`. For a headline, use one entrance (`rise` or `fade`) of about 0.35 s. Avoid simultaneous `type`, zoom and flash unless the line is itself the reveal. Contrast QA is a measurement aid; inspect moving backgrounds throughout the text span, not just its first frame.
