/** Filtergraph assembly with label bookkeeping: every produced label is consumed exactly once. */
import { Vid2Error } from "../shared/index.ts";

const LABEL = /^[A-Za-z0-9_.:]+$/;
const STREAM = /^\d+:[vas](:\d+)?$/;

export class GraphBuilder {
  #chains: string[] = [];
  #produced = new Set<string>();
  #consumed = new Set<string>();
  #counter = 0;

  /** Fresh unique label such as "media3". */
  label(prefix = "s"): string {
    this.#counter += 1;
    return `${prefix}${this.#counter}`;
  }

  /**
   * Append one chain: [in...]f1,f2[out]. Labels shaped like stream specifiers ("0:v") refer to command-line
   * inputs; other labels must have been produced earlier and are consumed once. Returns the output label.
   */
  add(inputs: string[], filters: string[], output?: string): string {
    if (filters.length === 0) throw new Vid2Error("E_INTERNAL", "graph chain needs at least one filter");
    const out = output ?? this.label();
    for (const l of [...inputs, out]) {
      if (!LABEL.test(l)) throw new Vid2Error("E_INTERNAL", `invalid graph label: ${l}`);
    }
    for (const l of inputs) this.#consume(l);
    this.#produce(out);
    this.#chains.push(inputs.map((l) => `[${l}]`).join("") + filters.join(",") + `[${out}]`);
    return out;
  }

  /** Split one label into n fresh labels (video split). */
  split(input: string, n: number, prefix = "sp"): string[] {
    if (n < 2) throw new Vid2Error("E_INTERNAL", "split needs n >= 2");
    const outs = Array.from({ length: n }, () => this.label(prefix));
    this.#consume(input);
    for (const o of outs) this.#produce(o);
    this.#chains.push(`[${input}]split=${n}` + outs.map((o) => `[${o}]`).join(""));
    return outs;
  }

  /** Labels produced but not yet consumed (the graph outputs). */
  dangling(): string[] {
    return [...this.#produced].filter((l) => !this.#consumed.has(l));
  }

  toString(): string {
    return this.#chains.join(";\n");
  }

  #produce(l: string): void {
    if (this.#produced.has(l)) throw new Vid2Error("E_INTERNAL", `graph label produced twice: ${l}`);
    this.#produced.add(l);
  }

  #consume(l: string): void {
    if (STREAM.test(l)) return;
    if (!this.#produced.has(l)) throw new Vid2Error("E_INTERNAL", `graph label used before it is produced: ${l}`);
    if (this.#consumed.has(l)) throw new Vid2Error("E_INTERNAL", `graph label consumed twice: ${l}`);
    this.#consumed.add(l);
  }
}
