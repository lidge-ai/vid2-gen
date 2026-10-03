# Examples

Each folder holds the code and instructions for one video made with vid2: timeline sources or the scripts that build them, capture
steps, music sources, a README that lists every command and an `example.json` manifest with the same steps. The sources ship with the
npm package. Media, captures, generated timelines and renders are never committed; they live in the example's workspace,
`$VID2_HOME/examples/<name>` (by default `~/.vid2/examples/<name>`).

```bash
vid2 example ls                              # examples, and which already have a workspace
vid2 example show opus-astra-paper           # what it needs, which files to edit, the exact steps
cd "$(vid2 example new opus-astra-paper)"    # copy the sources into the workspace and enter it
```

`vid2 example new` copies only files the workspace does not have yet, so re-running it keeps your edits; `--force` refreshes every
source file from the package. `media/`, `out/`, `.work/` and `*.vid2cap/` are never touched, and `--dir <path>` copies into an empty
or new folder instead (a non-empty one needs `--force`). Timeline paths resolve relative to the
timeline file, so every command in a README runs from inside the workspace. Agents can load the `vid2-examples` skill to pick the
closest example for a request. In a repository checkout, `node examples/workspace.mjs <name>` is `vid2 example new --force` from the
checkout: edit sources in the repository, not in the workspace, or the next sync will overwrite them.

| Example | What it shows | Needs |
|---|---|---|
| [motion-study](motion-study/README.md) | 11 s silent study: cumulative typing cadence, staggered bars, reserved spacing and retained-word reflow, with exact frame checkpoints | ffmpeg only; bundled fonts |
| [opus-astra-paper](opus-astra-paper/README.md) | 26 s paper-cutout short built only from JS stage nodes: springs, squash, hearts, a procedural paper sheet | ffmpeg, music2-gen for the cue |
| [claude-codex-dawn](claude-codex-dawn/README.md) | 74 s puppet film: two logo cutouts walking from night into sunrise, reusable puppet helpers | ffmpeg, rsvg-convert, your own logo files and Korean fonts, music2-gen |
| [ima2-launch](ima2-launch/README.md) | 50 s launch film: kinetic type, rebuilt UI components, ima2 generations, a real web capture, music synced to bars | ima2-gen, Playwright, music2-gen |
| [vid2-intro](vid2-intro/README.md) | 36 s keynote-style product film: typed command, verbs lit one at a time, rolling speed-up number, piano cue | ffmpeg, music2-gen |
| [vid2-launch](vid2-launch/README.md) | 30 s launch video: two web captures, ima2 stills, a two-pass QA handoff | Playwright, ima2-gen (or placeholders) |
| [generated-video](generated-video/README.md) | A five-second generated clip held across a seven-second layer, with an offline twin | ima2-gen, or nothing for the offline twin |
| [hello.json](hello.json) | The smallest timeline; render it in place (`vid2 render examples/hello.json -o hello.mp4`), no workspace needed | ffmpeg |

Rendering is ffmpeg-bound. Add `--hw` to `vid2 render` to use a hardware encoder for the final encode; see the
[render contract](https://github.com/lidge-ai/vid2-gen/blob/main/structure/render.md#profiles-and-encoders) for what it changes.
