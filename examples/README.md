# Examples

Each folder holds the code and instructions for one video made with vid2: timeline sources or the scripts that build them, capture
steps, music sources and a README that lists every command. Media, captures, generated timelines and renders are not committed. They live
in the example's workspace, `$VID2_HOME/examples/<name>` (by default `~/.vid2/examples/<name>`).

```bash
node examples/workspace.mjs --list              # examples, and which already have a workspace
cd "$(node examples/workspace.mjs opus-astra-paper)"   # copy the sources into the workspace and enter it
```

`workspace.mjs` copies the repository sources over their workspace copies and leaves `media/`, `out/`, `.work/` and `*.vid2cap/`
alone, so you can re-sync after pulling. Edit sources in the repository, not in the workspace, or the next sync will overwrite them.
Timeline paths resolve relative to the timeline file, so every command in a README runs from inside the workspace.

| Example | What it shows | Needs |
|---|---|---|
| [opus-astra-paper](opus-astra-paper/README.md) | 26 s paper-cutout short built only from JS stage nodes: springs, squash, hearts, a procedural paper sheet | ffmpeg, music2-gen for the cue |
| [claude-codex-dawn](claude-codex-dawn/README.md) | 74 s puppet film: two logo cutouts walking from night into sunrise, reusable puppet helpers | ffmpeg, rsvg-convert, your own logo files and Korean fonts, music2-gen |
| [ima2-launch](ima2-launch/README.md) | 50 s launch film: kinetic type, rebuilt UI components, ima2 generations, a real web capture, music synced to bars | ima2-gen, Playwright, music2-gen |
| [vid2-intro](vid2-intro/README.md) | 36 s keynote-style product film: typed command, verbs lit one at a time, rolling speed-up number, piano cue | ffmpeg, music2-gen |
| [vid2-launch](vid2-launch/README.md) | 30 s launch video: two web captures, ima2 stills, a two-pass QA handoff | Playwright, ima2-gen (or placeholders) |
| [generated-video](generated-video/README.md) | A five-second generated clip held across a seven-second layer, with an offline twin | ima2-gen, or nothing for the offline twin |
| [hello.json](hello.json) | The smallest timeline; render it in place (`vid2 render examples/hello.json -o hello.mp4`), no workspace needed | ffmpeg |

Rendering is ffmpeg-bound. Add `--hw` to `vid2 render` to use a hardware encoder for the final encode; see the
[render contract](../structure/render.md#profiles-and-encoders) for what it changes.
