import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsRoot = join(root, 'skills');
const schemaTarget = join(skillsRoot, 'vid2-timeline/assets/timeline.v1.json');
// Write only on change: the manifest test runs this script while other test files read the skills tree, and an
// unconditional rewrite made Windows fail those reads with EBUSY.
function writeIfChanged(path, content) {
  if (existsSync(path) && readFileSync(path).equals(Buffer.from(content))) return;
  writeFileSync(path, content);
}
mkdirSync(dirname(schemaTarget), { recursive: true });
writeIfChanged(schemaTarget, readFileSync(join(root, 'schema/timeline.v1.json')));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function filesBelow(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  }).sort();
}
const manifest = {};
for (const entry of readdirSync(skillsRoot, { withFileTypes: true }).filter((x) => x.isDirectory()).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
  const files = {};
  for (const path of filesBelow(join(skillsRoot, entry.name))) {
    files[relative(join(skillsRoot, entry.name), path).replaceAll('\\', '/')] = digest(readFileSync(path));
  }
  manifest[entry.name] = { files, sha256: digest(JSON.stringify(files)) };
}
writeIfChanged(join(root, 'skills-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
