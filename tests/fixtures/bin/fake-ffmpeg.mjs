import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const version = process.env.FAKE_FFMPEG_VERSION ?? "8.0";
if (args.includes("-vf")) process.exit(version.startsWith("8.0") ? 139 : 0);
const flag = ["-version", "-filters", "-encoders", "-decoders", "-devices", "-hwaccels", "-buildconf"].find((item) => args.includes(item));
if (!flag) process.exit(2);
if (flag === "-version") {
  process.stdout.write(`ffmpeg version ${version}\nconfiguration: --enable-libass --enable-libfreetype --enable-libharfbuzz\n`);
} else {
  const fixture = new URL(`../probe/${flag.slice(1)}.txt`, import.meta.url);
  process.stdout.write(readFileSync(fileURLToPath(fixture)));
}
