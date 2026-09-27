import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TimelineSchema } from "../../timeline/index.ts";
import type { Timeline } from "../../timeline/index.ts";
import { Vid2Error } from "../../shared/errors.ts";

export async function loadTimeline(file: string | undefined, cwd: string): Promise<{ timeline: Timeline; path: string }> {
  if (!file) throw new Vid2Error("E_INPUT", "timeline path is required");
  const path = resolve(cwd, file);
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new Vid2Error("E_NOT_FOUND", `cannot read timeline: ${file}`, { details: { path }, cause: error });
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Vid2Error("E_INPUT", `invalid JSON in timeline: ${file}`, { details: { path }, cause: error });
  }
  const parsed = TimelineSchema.safeParse(value);
  if (!parsed.success) throw new Vid2Error("E_SCHEMA", "timeline schema validation failed", {
    details: { path, issues: parsed.error.issues.map(({ path: issuePath, code, message }) => ({ path: issuePath.join("."), code, message })) },
  });
  return { timeline: parsed.data, path };
}
