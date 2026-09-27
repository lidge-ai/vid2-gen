import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Vid2Error } from "../shared/index.ts";
import { findExecutable } from "../probe/index.ts";
import { requireFfmpeg, tempDir } from "../../tests/helpers.ts";
import { captureElectron, electronLaunch } from "./electron.ts";

test("Electron main scripts use a resolved executable and preserve app args", () => {
  const dir = tempDir("vid2-electron-launch-");
  const script = join(dir, "main.js");
  const binary = join(dir, "electron");
  writeFileSync(script, "// fixture\n");
  writeFileSync(binary, "#!/bin/sh\nexit 0\n");
  chmodSync(binary, 0o755);
  assert.deepEqual(electronLaunch({ app: script, args: ["--demo"] }, dir), { executablePath: binary, args: [script, "--demo"] });
  assert.throws(() => electronLaunch({ app: script }, ""), (error: unknown) => error instanceof Vid2Error && error.code === "E_CAPABILITY");
  assert.throws(() => electronLaunch({ app: join(dir, "missing.js") }, dir), (error: unknown) => error instanceof Vid2Error && error.code === "E_NOT_FOUND");
});

test("Electron capture requires exactly one steps or script input", async () => {
  await assert.rejects(captureElectron({ app: "missing.js", fps: 30, out: tempDir(), recordText: false }),
    (error: unknown) => error instanceof Vid2Error && error.code === "E_INPUT");
});

test("live Electron first-window capture when Electron is installed", async t => {
  if (!requireFfmpeg(t)) return;
  const electron = process.env["VID2_ELECTRON"] ? findExecutable(process.env["VID2_ELECTRON"]) : findExecutable("electron");
  if (!electron) { t.skip("Electron executable is not installed"); return; }
  const dir = tempDir("vid2-electron-live-");
  const app = join(dir, "main.cjs");
  writeFileSync(app, "const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:320,height:180,webPreferences:{nodeIntegration:false}});w.loadURL('data:text/html,<button id=go>Click</button><input id=entry>')});\n");
  const result = await captureElectron({ app, fps: 15, out: join(dir, "session.vid2cap"), recordText: false,
    steps: [{ click: "#go", label: "clicked" }, { type: "#entry", text: "secret" }, { mark: "done" }] });
  assert.equal(result.session.meta.surface, "electron");
  assert.ok(result.session.meta.width > 0 && result.session.meta.height > 0);
  assert.equal(result.session.actions.length, 3);
  assert.ok(!JSON.stringify(result.session.actions).includes("secret"));
});
