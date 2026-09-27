import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commands } from '../src/cli/registry.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsRoot = join(root, 'skills');
const failures = [];
const known = new Set(commands.keys());
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const skillDirs = readdirSync(skillsRoot, { withFileTypes: true }).filter((x) => x.isDirectory());
for (const entry of skillDirs) {
  const skill = join(skillsRoot, entry.name, 'SKILL.md');
  if (!existsSync(skill)) { failures.push(`${entry.name}: missing SKILL.md`); continue; }
  const source = readFileSync(skill, 'utf8');
  const fm = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) { failures.push(`${entry.name}: missing frontmatter`); continue; }
  const name = fm[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = fm[1].match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  if (name !== entry.name) failures.push(`${entry.name}: frontmatter name must match directory`);
  if (!description || description.length > 1024 || !/when|use for|trigger/i.test(description)) failures.push(`${entry.name}: description must include when to use it and be <=1024 characters`);
  for (const path of walk(join(skillsRoot, entry.name)).filter((x) => x.endsWith('.md'))) {
    const content = readFileSync(path, 'utf8');
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const link = match[1].split('#')[0];
      if (link && !/^[a-z][a-z0-9+.-]*:/i.test(link) && !existsSync(resolve(dirname(path), link))) {
        failures.push(`${relative(root, path)}: missing link ${link}`);
      }
    }
    for (const match of content.matchAll(/`vid2\s+([a-z][\w-]*)\b/g)) {
      if (!known.has(match[1])) failures.push(`${relative(root, path)}: unregistered command ${match[1]}`);
    }
    if (/`!/.test(content)) failures.push(`${relative(root, path)}: inline backtick-bang pattern`);
  }
}
const { default: manifest } = await import('../skills-manifest.json', { with: { type: 'json' } });
for (const dir of skillDirs) if (!Object.hasOwn(manifest, dir.name)) failures.push(`manifest: unlisted skill ${dir.name}`);
for (const [name, entry] of Object.entries(manifest)) {
  if (!existsSync(join(skillsRoot, name, 'SKILL.md'))) failures.push(`manifest: missing skill ${name}`);
  for (const [path, expected] of Object.entries(entry.files)) {
    const full = join(skillsRoot, name, path);
    if (!existsSync(full)) failures.push(`manifest: missing ${name}/${path}`);
    else if (createHash('sha256').update(readFileSync(full)).digest('hex') !== expected) failures.push(`manifest: stale hash ${name}/${path}`);
  }
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`skills lint passed (${Object.keys(manifest).length} skills, ${known.size} commands)`);
