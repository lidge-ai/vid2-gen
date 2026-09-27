export type LogLevel = "debug" | "info" | "warn" | "silent";
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, silent: 99 };

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
}

export function createLogger(stderr: NodeJS.WritableStream, level: LogLevel = envLevel()): Logger {
  const at = ORDER[level];
  const emit = (l: LogLevel, msg: string): void => {
    if (ORDER[l] >= at) stderr.write(`vid2 ${l}: ${msg}\n`);
  };
  return { debug: (m) => emit("debug", m), info: (m) => emit("info", m), warn: (m) => emit("warn", m) };
}

function envLevel(): LogLevel {
  const v = process.env["VID2_LOG"];
  return v === "debug" || v === "info" || v === "warn" || v === "silent" ? v : "info";
}

