/** Stream stage frames into ffmpeg as rawvideo RGBA → FFV1 bgra Matroska (lossless alpha), bit-exact for cache stability. */
import { spawn } from "node:child_process";
import { fpsString, Vid2Error } from "../shared/index.ts";
import type { Fps } from "../shared/index.ts";

export interface EncodeTarget { ffmpeg: string; out: string; width: number; height: number; fps: Fps; frames: number; signal?: AbortSignal }

export function encodeArgs(t: EncodeTarget): string[] {
  return ["-hide_banner", "-nostdin", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${t.width}x${t.height}`,
    "-r", fpsString(t.fps), "-i", "pipe:0", "-frames:v", String(t.frames), "-c:v", "ffv1", "-level", "3", "-pix_fmt", "bgra",
    "-fflags", "+bitexact", "-flags:v", "+bitexact", "-f", "matroska", t.out];
}

/** Run the encoder, pulling frame bytes from produce(n) with stdin backpressure. */
export async function encodeFrames(t: EncodeTarget, produce: (n: number) => Uint8Array): Promise<void> {
  const child = spawn(t.ffmpeg, encodeArgs(t), { windowsHide: true, ...(t.signal ? { signal: t.signal } : {}) });
  let err = "";
  child.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-4000); });
  const done = new Promise<void>((resolve, reject) => {
    child.on("error", (cause) => reject(new Vid2Error(t.signal?.aborted ? "E_INTERRUPTED" : "E_RENDER", "stage encoder failed to start", { cause })));
    child.on("close", (code) => code === 0 ? resolve()
      : reject(new Vid2Error(t.signal?.aborted ? "E_INTERRUPTED" : "E_RENDER", "stage encode failed", { details: { code, stderr: err } })));
  });
  const stdinError = new Promise<never>((_, reject) => child.stdin.on("error", (cause) => reject(new Vid2Error("E_RENDER", "stage encoder closed its input",
    { cause, details: { stderr: err } }))));
  const write = async (): Promise<void> => {
    for (let n = 0; n < t.frames; n++) {
      const bytes = produce(n);
      // Copy: the renderer reuses its output buffer for the next frame while this chunk may still be queued.
      if (!child.stdin.write(Buffer.from(bytes))) {
        await new Promise<void>((resolve) => child.stdin.once("drain", resolve));
      }
      if (n % 8 === 7) await new Promise<void>((resolve) => setImmediate(resolve));
    }
    child.stdin.end();
  };
  await Promise.race([write().then(() => done), stdinError, done.then(() => undefined)]);
  await done;
}
