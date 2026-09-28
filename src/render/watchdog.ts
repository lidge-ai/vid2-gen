/** Stall watchdog for ffmpeg children: an intermittent scheduler deadlock left a segment idle forever (devlog 260928 wp2). */
export const DEFAULT_STALL_MS = 180_000;

/** VID2_FFMPEG_STALL_MS overrides the limit; invalid or non-positive values fall back to the default. */
export function stallLimitMs(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env["VID2_FFMPEG_STALL_MS"]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_STALL_MS;
}

/** Calls onStall once when the progress frame has not advanced for limitMs since start or the last advance. */
export class StallWatch {
  #last: number;
  #frame: number | undefined;
  #fired = false;
  readonly #timer: NodeJS.Timeout;
  readonly #now: () => number;

  constructor(limitMs: number, onStall: (stalledMs: number) => void, now: () => number = Date.now) {
    this.#now = now;
    this.#last = now();
    this.#timer = setInterval(() => {
      const idle = this.#now() - this.#last;
      if (this.#fired || idle < limitMs) return;
      this.#fired = true;
      this.stop();
      onStall(idle);
    }, Math.max(10, Math.min(5000, Math.floor(limitMs / 4))));
    this.#timer.unref();
  }

  get fired(): boolean { return this.#fired; }
  get frame(): number | undefined { return this.#frame; }

  progress(frame: number | undefined): void {
    if (frame === undefined || frame === this.#frame) return;
    this.#frame = frame;
    this.#last = this.#now();
  }

  stop(): void { clearInterval(this.#timer); }
}
