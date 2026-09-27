# Probe and doctor

`src/probe/index.ts` owns FFmpeg discovery and capability inspection. The CLI calls
`doctorReport({ deep: boolean, runner?: Runner, refresh?: boolean }): Promise<DoctorReport & { ok: boolean; report: Record<string, unknown>; fix: string | undefined }>`.
The returned object is JSON serializable, with `exit` (0 or 3), `ok`, `report`, `fix`, `severity`,
`error` (`null` or a code/message/fix object), tool locations, capability maps,
optional tools, warnings, and canary results. The CLI should use `exit` for process
status and surface `error` as the public error when it is non-null.

`locateTools()` honors `VID2_FFMPEG` and `VID2_FFPROBE` first, then scans `PATH`
without a shell. Both are required. `probeFfmpeg()` runs the seven capability
commands and caches normalized output by executable path, modification time, and
size in `VID2_HOME/cache/probe`. `refresh: true` bypasses the read cache.
Injected `Runner` calls skip the cache. `VID2_TEST_FFMPEG_RUNNER=node-fake` is an
internal test hook, active only when `NODE_ENV=test`.

FFmpeg 6.1 is the minimum; 7.1 or newer is recommended. `--deep` runs the
known-bug canaries in child processes. A crash or nonzero canary does not crash
doctor. `requireFeatures()` provides a typed gate for later render components;
`probeMedia()` inspects an individual file with ffprobe. Optional `vhs`, `agg`,
and `asciinema` paths tell the later terminal capture workflow which adapters
are available. Capability values describe the local FFmpeg build, not a promise
that every device or hardware encoder can run on the current host.

Contract source: `devlog/_plan/260927_vid2_roadmap/010_foundations.md`, Probe section.
