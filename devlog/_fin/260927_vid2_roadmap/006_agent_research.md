# 006 — agent packaging and timeline digest

Full research (read-only Aside run, 2026-09-27): <aside-artifacts>/vid2-research/030-agent-packaging-and-timeline.md. This digest keeps only what the phase docs rely on;
claims marked TESTED were run on this Mac (ffmpeg 8.0.1) by the research agent, UNVERIFIED ones stay unverified.

- Agent Skills spec (agentskills.io): folder with SKILL.md (frontmatter name = dir name, description ≤ 1024 chars with what + when + triggers, optional license/compatibility/metadata/allowed-tools) + references/ + scripts/ + assets/; progressive disclosure.
- Distribution: `npx skills add <owner>/<repo>` (vercel-labs/skills) reads skills/*/SKILL.md; cross-agent project path .agents/skills; Codex UI metadata agents/openai.yaml; Claude Code plugin .claude-plugin/plugin.json.
- Best reference: HyperFrames — router skill with a state table and a deliverable route table, domain skills (core contract, animation, keyframes, creative, audio, CLI loop), lazy workflow skills, "You default to X. Stop." rules with numeric replacements, and a lint → check → snapshot → preview → approval → render → ffprobe gate; motion-intent assertions (appearsBy, before, staysInFrame, keepsMoving) and a static-sweep check.
- Creative rules quoted: build/breathe/resolve per scene; entrances longer than exits (0.4 vs 0.25 s); stagger under 500 ms; speed vocabulary; ease direction (.out enter, .in exit, .inOut move); transitions carry meaning (crossfade = continues, hard cut = wake up); 1-2 shader transitions per 5-7 beat reel; one dominant motion direction; weight contrast 300 vs 900; no two sans; banned lazy fonts include Inter; lazy defaults (gradient text, cyan-on-dark neon, pure #000/#fff, everything centered).
- CLI contract ideas: --json envelope with error.fix and meta.version; stdout data / stderr diagnostics; exit-code table; --dry-run/--plan; capabilities + schema discovery; bounded output; long jobs with progress.
- Timeline format: small versioned JSON, rational fps, time as a tagged union (frames, seconds, beats, bar:beat, marker/cue refs), assets map, transitions, cues, camera keyframes; author in zod 4 and export JSON Schema 2020-12 with $id; a resolve step so agents inspect absolute frames.
- Directing guidance that moves output: reference videos transcribed into numbers, storyboard stills before motion, real UI and assets, named camera moves and eases, per-video ban list, one variable per render, let beat analysis choose cut times.

