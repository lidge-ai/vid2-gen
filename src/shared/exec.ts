/** Child-process execution without a shell (argv only), with timeout and stderr line streaming. */
import { spawn } from "node:child_process";
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
}

export type Runner = (cmd: string, args: string[], opts?: RunOptions) => Promise<RunResult>;

export const run: Runner = (cmd, args, opts = {}) =>
  new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, shell: false, windowsHide: true });
    const out: Buffer[] = [];
    let err = "";
    let pending = "";
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs !== undefined) {
      timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs);
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
      resolvePromise({ code, signal, stdout: Buffer.concat(out), stderr: err, ms: Date.now() - started });
    });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });

/** Runs a command and throws E_RENDER (with the stderr tail) unless it exits 0. */
export async function runChecked(cmd: string, args: string[], opts: RunOptions = {}, runner: Runner = run): Promise<RunResult> {
  const res = await runner(cmd, args, opts);
  if (res.code === 0) return res;
  const tail = res.stderr.split(/\r?\n/).filter(Boolean).slice(-20).join("\n");
  throw new Vid2Error("E_RENDER", `${cmd} failed (${res.signal ?? `exit ${String(res.code)}`})`, {
    details: { cmd, args, code: res.code, signal: res.signal, stderrTail: tail },
  });
}

