/** examples/<name>/example.json: what an example film is, what it needs, and the exact steps to rebuild it (030). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Vid2Error } from "../shared/errors.ts";

const Text = z.string().min(1);

export const ExampleManifestSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9-]+$/),
  title: Text,
  summary: Text,
  durationS: z.number().positive().optional(),
  size: z.string().regex(/^\d+x\d+$/).optional(),
  techniques: z.array(Text).min(1),
  goodFor: z.array(Text).min(1),
  needs: z.array(z.strictObject({ tool: Text, optional: z.boolean().optional(), note: Text.optional() })),
  edit: z.array(z.strictObject({ file: Text, what: Text })).min(1),
  steps: z.array(z.strictObject({ run: Text, note: Text.optional() })).min(1),
  output: Text,
});

export type ExampleManifest = z.infer<typeof ExampleManifestSchema>;

export const MANIFEST_FILE = "example.json";

export function readManifest(dir: string): ExampleManifest {
  const path = join(dir, MANIFEST_FILE);
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(path, "utf8")); }
  catch (cause) { throw new Vid2Error("E_INTERNAL", `example manifest unreadable: ${path}`, { cause }); }
  const parsed = ExampleManifestSchema.safeParse(raw);
  if (!parsed.success) throw new Vid2Error("E_SCHEMA", `invalid example manifest: ${path}`, { details: { issues: parsed.error.issues } });
  return parsed.data;
}
