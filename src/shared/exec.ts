/** Child-process execution without a shell (argv only), with timeout and stderr line streaming. */
import { spawn } from "node:child_process";
import { basename } from "node:path";
import { Vid2Error } from "./errors.ts";

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  input?: Buffer | string;
  env?: NodeJS.ProcessEnv;
  onStderrLine?: (line: string) => void;
}

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr: string;
  ms: number;
  /** The timeout (explicit or the ffmpeg default) killed the process. */
  timedOut?: boolean;
}

export type Runner = (cmd: string, args: string[], opts?: RunOptions) => Promise<RunResult>;

/**
 * Default kill timeout for ffmpeg children run without an explicit timeout, from VID2_FFMPEG_TIMEOUT_MS (unset = none).
 * ffmpeg 8/9 occasionally deadlocked on graphs with several looped inputs; the test runner sets 60 s so a hang retries.
 */
export function ffmpegDefaultTimeout(cmd: string, env: NodeJS.ProcessEnv = process.env): number | undefined {
  const name = basename(cmd).toLowerCase().replace(/\.exe$/, "");
  if (name !== "ffmpeg") return undefined;
  const value = Number(env["VID2_FFMPEG_TIMEOUT_MS"]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export const run: Runner = (cmd, args, opts = {}) =>
  new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, shell: false, windowsHide: true });
    const out: Buffer[] = [];
    let err = "";
    let pending = "";
    let timer: NodeJS.Timeout | undefined;
    let timedOut = false;
    const timeoutMs = opts.timeoutMs ?? ffmpegDefaultTimeout(cmd);
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    }
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString("utf8");
      err += text;
      if (!opts.onStderrLine) return;
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) opts.onStderrLine(line);
    });
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      if (opts.onStderrLine && pending) opts.onStderrLine(pending);
      resolvePromise({ code, signal, stdout: Buffer.concat(out), stderr: err, ms: Date.now() - started, ...(timedOut ? { timedOut } : {}) });
    });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });

/** Runs a command and throws E_RENDER (with the stderr tail) unless it exits 0; an ffmpeg killed by the default timeout retries once. */
export async function runChecked(cmd: string, args: string[], opts: RunOptions = {}, runner: Runner = run): Promise<RunResult> {
  let res = await runner(cmd, args, opts);
  if (res.timedOut && opts.timeoutMs === undefined && ffmpegDefaultTimeout(cmd) !== undefined) res = await runner(cmd, args, opts);
  if (res.code === 0) return res;
  const tail = res.stderr.split(/\r?\n/).filter(Boolean).slice(-20).join("\n");
  throw new Vid2Error("E_RENDER", `${cmd} failed (${res.signal ?? `exit ${String(res.code)}`})`, {
    details: { cmd, args, code: res.code, signal: res.signal, stderrTail: tail, ...(res.timedOut ? { timedOut: true } : {}) },
  });
}
