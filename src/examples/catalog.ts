/** The packaged example folders: examples/<name>/ with an example.json (030). */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../shared/paths.ts";
import { Vid2Error } from "../shared/errors.ts";
import { MANIFEST_FILE, readManifest } from "./manifest.ts";
import type { ExampleManifest } from "./manifest.ts";

export function examplesRoot(): string {
  return join(packageRoot(), "examples");
}

/** Example names under root, sorted: folders that hold an example.json. */
export function listExamples(root = examplesRoot()): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => {
    const dir = join(root, name);
    return statSync(dir).isDirectory() && existsSync(join(dir, MANIFEST_FILE));
  }).sort();
}

export function unknownExample(name: string, root = examplesRoot()): Vid2Error {
  return new Vid2Error("E_INPUT", `unknown example: ${name}`, { details: { examples: listExamples(root) }, fix: "run vid2 example ls" });
}

export interface LoadedExample {
  manifest: ExampleManifest;
  source: string;
  readme: string;
}

export function loadExample(name: string, root = examplesRoot()): LoadedExample {
  if (!listExamples(root).includes(name)) throw unknownExample(name, root);
  const source = join(root, name);
  const manifest = readManifest(source);
  if (manifest.name !== name) throw new Vid2Error("E_INTERNAL", `example manifest name ${manifest.name} does not match its folder ${name}`);
  return { manifest, source, readme: join(source, "README.md") };
}
