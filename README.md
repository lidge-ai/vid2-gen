# vid2-gen

**A video CLI for coding agents.** Describe scenes in JSON, inspect their timing, and check the ffmpeg capabilities on your machine. The 0.1 foundations establish the timeline and command contracts; rendering, capture, audio, asset generation, and agent skills follow in the [roadmap](devlog/_plan/260927_vid2_roadmap/000_plan.md).

[![npm](https://img.shields.io/npm/v/vid2-gen?label=npm)](https://www.npmjs.com/package/vid2-gen) [![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Node.js](https://img.shields.io/node/v/vid2-gen)](package.json) [![CI](https://github.com/lidge-ai/vid2-gen/actions/workflows/ci.yml/badge.svg)](https://github.com/lidge-ai/vid2-gen/actions/workflows/ci.yml)

## Install

Requires **Node.js 22.18 or newer** and **ffmpeg/ffprobe 6.1 or newer** on your PATH. ffmpeg 7.1+ is recommended. Install ffmpeg with `brew install ffmpeg` on macOS, `winget install Gyan.FFmpeg` on Windows, or your Linux distribution's package manager.

```bash
npm install -g vid2-gen
vid2 doctor
```

The npm command applies once the package is published. For a source checkout today:

```bash
npm ci
npm run build
npm link
vid2 doctor
```

`vid2 doctor --json` returns machine-readable capabilities and exits 3 when required ffmpeg tools are missing or too old. `vid2 help --json` exposes commands and options for agents.

## A 30-second timeline check

Save this as `timeline.json`:

```json
{
  "version": 1,
  "scenes": [
    {
      "id": "opening",
      "duration": "2s",
      "layers": [{ "type": "text", "text": "Meet the product" }]
    }
  ]
}
```

```bash
vid2 validate timeline.json --json
vid2 resolve timeline.json --json
vid2 schema --json
```

`validate` checks the schema and relationships, while `resolve` turns authored times into frames. The committed [JSON Schema](schema/timeline.v1.json) describes authored input; runtime validation also checks relationships such as source references and transition lengths.

## Render a timeline

```bash
vid2 render timeline.json -o intro.mp4 --profile proxy   # half size, fast
vid2 render timeline.json -o intro.mp4                   # final quality
vid2 compile timeline.json -o intro.plan.json            # inspect the ffmpeg plan
```

Each scene renders as its own cached segment, transitions are joined with exact frame math, and the output is checked with ffprobe (frame count, size, pixel format, faststart). Text uses libass with the bundled Geist, Geist Mono and Instrument Serif fonts (SIL OFL).

## Commands and delivery

| Command | Availability | Purpose |
|---|---|---|
| `doctor`, `schema`, `validate`, `resolve`, `help`, `version` | 0.1 foundations (wp2) | Discover tools, inspect the contract, and validate or resolve timelines |
| `compile`, `render` | wp3 | Compile a timeline to an ffmpeg plan and render it |
| `preview` | Planned wp7 | Inspect a composed frame |
| `capture` | Planned wp4 | Record real product footage and events |
| `audio` | Planned wp5 | Beat grid, sound synthesis, and mixing |
| `assets` | Planned wp6 | Resolve local and optional generated media |
| `qa`, `init`, `skill` | Planned wp7 | Review output and install an agent workflow |

The intended flow is **capture → author one timeline → resolve assets → compile → render → QA**. Rendering will use ffmpeg locally; generated assets remain optional. The [structure guide](structure/INDEX.md) explains module boundaries and the public CLI contract.

## For coding agents

Use `vid2 help --json` to discover the current command set, `vid2 schema --json` to obtain the timeline contract, and `vid2 validate <file> --json` before later render steps. JSON mode prints one result object to stdout; diagnostics go to stderr. Exit codes distinguish input errors, missing capabilities, access/provider failures, rendering, QA, and interruption. The packaged agent skill and starter templates are planned for wp7.

## Why ffmpeg?

ffmpeg runs locally, supports frame-based composition across platforms, and can be probed for exact filters and encoders before a render. vid2 keeps the timeline declarative and reports missing capabilities instead of silently changing an effect. You install ffmpeg separately; it is not bundled into the npm package.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and tests. Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/lidge-ai/vid2-gen/security/advisories/new); see [SECURITY.md](SECURITY.md). Licensed under [MIT](LICENSE).
