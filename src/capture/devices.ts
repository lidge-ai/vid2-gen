import { run, Vid2Error } from "../shared/index.ts";
import type { Runner } from "../shared/index.ts";
import { locateTools } from "../probe/index.ts";

export interface CaptureScreen { display: number; deviceIndex: number; name: string; x?: number; y?: number; width?: number; height?: number }
export interface CaptureDeviceListing { backend: "avfoundation" | "ddagrab" | "gdigrab" | "x11grab"; screens: CaptureScreen[];
  windows: string[]; cameras: { index: number; name: string }[]; audio: { index: number; name: string }[] }

const JXA_WINDOWS = 'var se=Application("System Events");var out=[];se.applicationProcesses.whose({backgroundOnly:false})().forEach(p=>{try{p.windows().forEach(w=>{try{out.push({name:w.name(),position:w.position(),size:w.size()})}catch(e){}})}catch(e){}});JSON.stringify(out)';
export interface NativeWindow { name: string; position: [number, number]; size: [number, number] }

export async function listNativeWindows(runner: Runner = run, platform: NodeJS.Platform = process.platform): Promise<NativeWindow[]> {
  if (platform !== "darwin") return [];
  try {
    const result = await runner("osascript", ["-l", "JavaScript", "-e", JXA_WINDOWS], { timeoutMs: 8_000 });
    if (result.code !== 0) return [];
    const parsed: unknown = JSON.parse(result.stdout.toString("utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is NativeWindow => typeof item === "object" && item !== null &&
      typeof (item as NativeWindow).name === "string" && Array.isArray((item as NativeWindow).position) &&
      Array.isArray((item as NativeWindow).size));
  } catch { return []; }
}

function parseAvfoundation(text: string): Pick<CaptureDeviceListing, "screens" | "cameras" | "audio"> {
  const screens: CaptureScreen[] = []; const cameras: CaptureDeviceListing["cameras"] = []; const audio: CaptureDeviceListing["audio"] = [];
  let section: "video" | "audio" | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.includes("AVFoundation video devices:")) { section = "video"; continue; }
    if (line.includes("AVFoundation audio devices:")) { section = "audio"; continue; }
    const match = /\[(\d+)\]\s+(.+)$/.exec(line);
    if (!match || !section) continue;
    const index = Number(match[1]); const name = match[2]!.trim();
    const display = /^Capture screen\s+(\d+)$/i.exec(name);
    if (section === "audio") audio.push({ index, name });
    else if (display) screens.push({ display: Number(display[1]), deviceIndex: index, name });
    else cameras.push({ index, name });
  }
  return { screens, cameras, audio };
}

function parseDshow(text: string): Pick<CaptureDeviceListing, "cameras" | "audio"> {
  const cameras: CaptureDeviceListing["cameras"] = []; const audio: CaptureDeviceListing["audio"] = [];
  let section: "video" | "audio" | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.includes("DirectShow video devices")) { section = "video"; continue; }
    if (line.includes("DirectShow audio devices")) { section = "audio"; continue; }
    const match = /"([^"]+)"/.exec(line);
    if (!match || !section || line.includes("Alternative name")) continue;
    const list = section === "video" ? cameras : audio;
    list.push({ index: list.length, name: match[1]! });
  }
  return { cameras, audio };
}

function parseMonitors(text: string): CaptureScreen[] {
  const screens: CaptureScreen[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(\d+):\s+\S+\s+(\d+)\/\d+x(\d+)\/\d+\+(-?\d+)\+(-?\d+)\s+(.+)$/.exec(line);
    if (match) screens.push({ display: Number(match[1]), deviceIndex: Number(match[1]), name: match[6]!,
      width: Number(match[2]), height: Number(match[3]), x: Number(match[4]), y: Number(match[5]) });
  }
  return screens;
}

export async function listDevices(runner: Runner = run, platform: NodeJS.Platform = process.platform): Promise<CaptureDeviceListing> {
  const ffmpeg = runner === run ? locateTools().ffmpeg : "ffmpeg";
  if (platform === "darwin") {
    const result = await runner(ffmpeg, ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], { timeoutMs: 10_000 });
    const parsed = parseAvfoundation(result.stderr + result.stdout.toString("utf8"));
    const windows = (await listNativeWindows(runner, platform)).map((item) => item.name);
    return { backend: "avfoundation", ...parsed, windows };
  }
  if (platform === "win32") {
    const result = await runner(ffmpeg, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], { timeoutMs: 10_000 });
    const parsed = parseDshow(result.stderr + result.stdout.toString("utf8"));
    let windows: string[] = [];
    try {
      const listed = await runner("powershell.exe", ["-NoProfile", "-Command", "Get-Process | Where-Object MainWindowTitle | Select-Object -ExpandProperty MainWindowTitle"], { timeoutMs: 8_000 });
      if (listed.code === 0) windows = listed.stdout.toString("utf8").split(/\r?\n/).filter(Boolean);
    } catch { /* window enumeration is optional */ }
    return { backend: "ddagrab", screens: [{ display: 0, deviceIndex: 0, name: "Desktop 0" }], ...parsed, windows };
  }
  let screens: CaptureScreen[] = [];
  try {
    const listed = await runner("xrandr", ["--listmonitors"], { timeoutMs: 8_000 });
    if (listed.code === 0) screens = parseMonitors(listed.stdout.toString("utf8"));
  } catch { /* xrandr is optional */ }
  let windows: string[] = [];
  try {
    const wm = await runner("wmctrl", ["-l"], { timeoutMs: 8_000 });
    if (wm.code === 0) windows = wm.stdout.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => line.replace(/^\S+\s+\S+\s+\S+\s+/, ""));
  } catch { /* wmctrl is optional */ }
  return { backend: "x11grab", screens, windows, cameras: [], audio: [] };
}

/** Denials must name permission; generic capture failures remain capability errors. */
export function classifyCaptureFailure(stderr: string, platform: NodeJS.Platform = process.platform): Vid2Error {
  const tail = stderr.split(/\r?\n/).filter(Boolean).slice(-20).join("\n").slice(-2000);
  const denied = platform === "darwin" ? /(avfoundation|screen|capture|device)[\s\S]{0,300}(not authorized|permission denied|screen recording permission|permission)/i.test(stderr) :
    platform === "win32" && /(E_ACCESSDENIED|Access is denied)/i.test(stderr);
  if (denied) return new Vid2Error("E_ACCESS", "Screen capture permission was denied", { details: { stderrTail: tail },
    fix: platform === "darwin" ? "Grant Screen Recording to the terminal or IDE running vid2, then restart it." :
      "Allow desktop capture for the current user and retry." });
  return new Vid2Error("E_CAPABILITY", "Native capture device could not be opened", { details: { stderrTail: tail },
    fix: "Run vid2 capture devices to check the available displays and device indices." });
}

/** Analyze the first 30 frames; black footage is a warning, never a permission verdict. */
export async function blackFootageWarning(path: string, runner: Runner = run): Promise<string | null> {
  const ffmpeg = runner === run ? locateTools().ffmpeg : "ffmpeg";
  try {
    const result = await runner(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", path,
      "-vf", "select=lt(n\\,30),scale=32:32:out_range=full,signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=-",
      "-frames:v", "30", "-f", "null", "-"], { timeoutMs: 30_000 });
    if (result.code !== 0) return null;
    const values = [...(result.stdout.toString("utf8") + result.stderr).matchAll(/lavfi\.signalstats\.YMAX=(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
    return values.length && values.every((value) => value < 16)
      ? "Footage is black; if unexpected, check Screen Recording permission." : null;
  } catch { return null; }
}
