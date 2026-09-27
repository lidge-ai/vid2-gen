/** Public package API: the timeline contract, its resolver/validator, and the error/exit contract. */
export { EXIT, Vid2Error, exitFor, isVid2Error } from "./shared/index.ts";
export type { ErrorCode, ExitCode } from "./shared/index.ts";
export * from "./timeline/index.ts";
export { probeFfmpeg, probeMedia, locateTools } from "./probe/index.ts";
export type { FfmpegInfo, MediaInfo } from "./probe/index.ts";
