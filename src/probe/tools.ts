import { accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

/** Locate an executable without involving a shell or trusting its output. */
export function findExecutable(name: string, path = process.env["PATH"] ?? ""): string | null {
  const extensions = process.platform === "win32"
    ? (process.env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD").split(";") : [""];
  const names = process.platform === "win32" && !/\.[a-z0-9]+$/i.test(name)
    ? extensions.map((ext) => name + ext.toLowerCase()) : [name];
  const dirs = isAbsolute(name) ? [""] : path.split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const candidate of names) {
      const full = dir ? join(dir, candidate) : candidate;
      try {
        accessSync(full, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        return full;
      } catch { /* keep searching */ }
    }
  }
  return null;
}

export interface OptionalTools { vhs: string | null; agg: string | null; asciinema: string | null }

export function locateOptionalTools(path = process.env["PATH"] ?? ""): OptionalTools {
  return { vhs: findExecutable("vhs", path), agg: findExecutable("agg", path), asciinema: findExecutable("asciinema", path) };
}
