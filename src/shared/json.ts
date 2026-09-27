/** Deterministic JSON: sorted object keys, no whitespace. Used for hashing and golden files. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const item = (v as Record<string, unknown>)[k];
      if (item !== undefined) out[k] = sortDeep(item);
    }
    return out;
  }
  return v;
}

