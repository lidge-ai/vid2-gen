/** Options every command accepts, the environment table and the help group order (020). */
import type { CommandGroup, CommandOption } from "./registry.ts";

export const GLOBAL_OPTIONS: Record<string, CommandOption> = {
  json: { type: "boolean", description: "Print one JSON object on stdout (same as VID2_JSON=1)" },
  help: { type: "boolean", short: "h", description: "Show help for vid2, a command or a subcommand" },
};

/** Accepted only before any command word: "vid2 -v". */
export const TOP_OPTIONS: Record<string, CommandOption> = {
  ...GLOBAL_OPTIONS,
  version: { type: "boolean", short: "v", description: "Print the vid2 version" },
};

export const GROUPS: readonly (readonly [CommandGroup, string])[] = [
  ["author", "Author a timeline"],
  ["render", "Render and preview"],
  ["media", "Capture, audio and assets"],
  ["review", "Check and review a video"],
  ["agent", "Agent and setup"],
];

export const ENVIRONMENT: readonly (readonly [string, string])[] = [
  ["VID2_HOME", "Cache, example workspaces and state (default ~/.vid2)"],
  ["VID2_JSON", "1 = JSON output for every command, like --json"],
  ["VID2_FFMPEG / VID2_FFPROBE", "ffmpeg and ffprobe binaries to use"],
  ["VID2_FFMPEG_TIMEOUT_MS", "Kill and retry an ffmpeg run that stalls this long"],
  ["VID2_TEXT_BACKEND", "ass or raster: force the text renderer"],
  ["VID2_VAAPI_DEVICE", "VAAPI render node for --hw-encoder vaapi"],
  ["VID2_ELECTRON", "Electron binary for vid2 capture electron"],
  ["VID2_REVIEW_BASE_URL / VID2_REVIEW_MODEL / VID2_REVIEW_API_KEY", "Image model for vid2 review"],
  ["VID2_REVIEW_AUDIO_BASE_URL / VID2_REVIEW_AUDIO_MODEL / VID2_REVIEW_AUDIO_API_KEY", "Listener model for vid2 review --listen"],
  ["VID2_LOG", "Log level on stderr: debug, info (default), warn or silent"],
];

export const ROOT_EXAMPLES: readonly string[] = [
  "vid2 init launch-teaser my-video        Start from a template",
  "vid2 validate timeline.json             Check a timeline",
  "vid2 preview timeline.json --at 0,50%,5s   Stills to check",
  "vid2 render timeline.json --profile proxy -o proxy.mp4",
  "vid2 render timeline.json --hw -o final.mp4",
  "vid2 qa final.mp4 --timeline timeline.json",
  "vid2 audio beats music.wav              Beat grid of a track",
  "vid2 skill install --agent codex        Install the agent skills",
];
