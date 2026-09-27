# Error code → repair

| Code or issue | Likely cause | Concrete fix |
|---|---|---|
| `E_SCHEMA` | Unknown field, wrong enum, missing required field | Run `vid2 schema --json`; inspect `error.details.issues[].path`, rename/remove the field; validate again. |
| `E_INPUT` / `source` | Scene references absent or wrong-kind source | Match the layer source ID to `sources`, and use image/video/capture for media. |
| `E_INPUT` / event | Missing label or multiple captures match | Inspect session actions, add a `mark` label or EventRef `source`, then resolve. |
| `E_INPUT` / beat | `b` literal without `beat` | Add a declared grid or replace with seconds/frames. |
| `E_NOT_FOUND` | Source file/session/font missing | Fix its path relative to timeline directory; use `--placeholders` only for a structural preview. |
| `E_CAPABILITY` | Local ffmpeg lacks a needed filter/encoder | Run `vid2 doctor --deep --json`; choose supported effect/codec or compatible ffmpeg. |
| `E_ACCESS` or `E_PROVIDER` | Provider unavailable or unauthorized | Check provider readiness, key/session and server before retrying generation. |
| `E_RENDER` | ffmpeg or output verification failed | Read the failed phase and input path; rerun a proxy segment after fixing the timeline. |
| `E_QA` (exit 6) | Open failing issue | Read `qa.json` range, measurement, threshold and fix; preview the range and rerender. |

Warnings are evidence to review, not permission to ignore. A waived issue remains in `qa.json` with reason and source. Keep a frozen-still warning when the hold is intentional; use a narrow `qa.waive` range when a known black fade is intentional.
