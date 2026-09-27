/** FFmpeg expression fragments; callers quote the complete expression once. */
export type EaseName = "linear" | "in" | "out" | "inout" | "punch";

export function easeExpr(name: EaseName, t: string): string {
  const v = `(${t})`;
  switch (name) {
    case "linear": return v;
    case "in": return `${v}*${v}`;
    case "out": return `1-(1-${v})*(1-${v})`;
    case "inout": return `${v}*${v}*(3-2*${v})`;
    case "punch": return `1-exp(-6*${v})`;
  }
}
