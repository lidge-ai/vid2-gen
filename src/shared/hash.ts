import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stableStringify } from "./json.ts";

export const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");
export const hashJson = (value: unknown): string => sha256(stableStringify(value));

export function hashFile(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const h = createHash("sha256");
    createReadStream(path)
      .on("data", (d) => h.update(d))
      .on("error", reject)
      .on("end", () => resolvePromise(h.digest("hex")));
  });
}

