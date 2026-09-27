import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, relative, sep } from "node:path";
import { once } from "node:events";
import { Vid2Error } from "../shared/index.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2",
};

export interface StaticServer { url: string; close(): Promise<void> }

/** Serve one directory on a loopback ephemeral port, rejecting traversal and symlink escapes. */
export async function serveDir(dir: string): Promise<StaticServer> {
  let root: string;
  try { root = await realpath(dir); }
  catch (cause) { throw new Vid2Error("E_NOT_FOUND", `Cannot serve directory: ${dir}`, { cause }); }
  if (!(await stat(root)).isDirectory()) throw new Vid2Error("E_INPUT", `Not a directory: ${dir}`);
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405).end(); return; }
      let requested: string;
      try { requested = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname); }
      catch { response.writeHead(400).end(); return; }
      if (requested.includes("\0") || requested.split("/").includes("..")) { response.writeHead(403).end(); return; }
      const path = join(root, requested === "/" ? "index.html" : `.${requested}`);
      let target: string;
      try { target = await realpath(path); }
      catch { response.writeHead(404).end(); return; }
      const rel = relative(root, target);
      if (rel === ".." || rel.startsWith(`..${sep}`)) { response.writeHead(403).end(); return; }
      const info = await stat(target);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, { "content-type": TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
        "content-length": info.size, "cache-control": "no-store" });
      if (request.method === "HEAD") response.end();
      else createReadStream(target).pipe(response);
    })().catch(() => { if (!response.headersSent) response.writeHead(500); response.end(); });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Vid2Error("E_INTERNAL", "Could not bind static server");
  return { url: `http://127.0.0.1:${address.port}/`, close: () => new Promise((resolvePromise, reject) =>
    server.close((error) => error ? reject(error) : resolvePromise())) };
}
