export interface RenderProgress { frame?: number; outTimeMs?: number; speed?: string }

/** Parse ffmpeg's `-progress pipe:2` key/value lines. */
export class ProgressParser {
  readonly #state: RenderProgress = {};
  readonly emit: (value: RenderProgress) => void;
  constructor(emit: (value: RenderProgress) => void) { this.emit = emit; }

  line(line: string): void {
    const split = line.indexOf("=");
    if (split < 0) return;
    const key = line.slice(0, split).trim();
    const value = line.slice(split + 1).trim();
    if (key === "frame" && /^\d+$/.test(value)) this.#state.frame = Number(value);
    if (key === "out_time_ms" && /^\d+$/.test(value)) this.#state.outTimeMs = Number(value);
    if (key === "speed") this.#state.speed = value;
    if (key === "progress") this.emit({ ...this.#state });
  }
}
