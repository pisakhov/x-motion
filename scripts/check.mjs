#!/usr/bin/env node
// Static repository checks only: never executes composition JavaScript or opens a browser.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateMotion } from './render.mjs';

export function validateFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error('Skill requires YAML frontmatter');
  const fields = {};
  for (const key of ['name', 'description']) {
    const value = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(match[1])?.[1]?.trim();
    if (!value || ['|', '>'].includes(value)) throw new Error(`Skill requires a nonempty single-line ${key}`);
    fields[key] = value.replace(/^(['"])(.*)\1$/, '$2');
    if (!fields[key].trim()) throw new Error(`Skill ${key} cannot be empty`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.name)) throw new Error('Skill name must use lowercase kebab-case');
  return fields;
}

export function localReferences(text) {
  const links = [...text.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].map(match => match[1]);
  return [...new Set(links.filter(link => !/^(?:https?:|mailto:|#)/i.test(link)).map(link => {
    let decoded;
    try { decoded = decodeURIComponent(link.split('#')[0]); } catch { throw new Error(`Malformed reference: ${link}`); }
    if (!decoded || decoded.includes('\\') || decoded.includes('\0') || path.isAbsolute(decoded) || decoded.split('/').includes('..') || /^[a-z]+:/i.test(decoded))
      throw new Error(`Unsafe skill reference: ${link}`);
    return decoded;
  }))];
}

// Accept only the four numeric literals; do not eval arbitrary JavaScript.
export function extractMotion(html) {
  const body = /window\.motion\s*=\s*\{([^}]+)\}/.exec(html)?.[1];
  if (!body) throw new Error('Provide metadata.json (or motion.json), or literal window.motion metadata');
  const value = {};
  for (const field of body.split(',').map(field => field.trim()).filter(Boolean)) {
    const match = /^(?:["']?)(width|height|duration|fps)(?:["']?)\s*:\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i.exec(field);
    if (!match || Object.hasOwn(value, match[1])) throw new Error('window.motion must contain unique numeric metadata literals');
    value[match[1]] = Number(match[2]);
  }
  return validateMotion(value);
}

export async function check(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const skillDir = path.join(root, 'skills/x-motion');
  const skillPath = path.join(skillDir, 'SKILL.md');
  const skill = await fs.readFile(skillPath, 'utf8');
  const frontmatter = validateFrontmatter(skill);
  if (frontmatter.name !== 'x-motion') throw new Error('Expected skill name x-motion');
  const references = localReferences(skill);
  if (!references.length) throw new Error('Skill must link to its references');
  const realSkillDir = await fs.realpath(skillDir);
  for (const ref of references) {
    const file = await fs.realpath(path.join(skillDir, ref));
    if (!file.startsWith(`${realSkillDir}${path.sep}`) || !(await fs.stat(file)).isFile()) throw new Error(`Invalid skill reference: ${ref}`);
    if (!(await fs.readFile(file, 'utf8')).trim()) throw new Error(`Empty skill reference: ${ref}`);
  }
  const examplesDir = path.join(root, 'examples');
  const entries = (await fs.readdir(examplesDir, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  if (!entries.length) throw new Error('At least one example is required');
  const examples = [];
  for (const entry of entries) {
    const directory = path.join(examplesDir, entry.name);
    const names = await fs.readdir(directory);
    const html = await fs.readFile(path.join(directory, 'index.html'), 'utf8');
    if (!/window\.renderFrame\s*=/.test(html)) throw new Error(`${entry.name}: missing window.renderFrame assignment`);
    const sidecar = ['metadata.json', 'motion.json'].find(name => names.includes(name));
    const motion = sidecar ? validateMotion(JSON.parse(await fs.readFile(path.join(directory, sidecar), 'utf8'))) : extractMotion(html);
    if (sidecar && /window\.motion\s*=\s*\{/.test(html)) {
      const inline = extractMotion(html);
      if (JSON.stringify(inline) !== JSON.stringify(motion)) throw new Error(`${entry.name}: inline and sidecar metadata disagree`);
    }
    const briefName = names.find(name => name.toLowerCase() === 'brief.md');
    if (!briefName || !(await fs.readFile(path.join(directory, briefName), 'utf8')).trim()) throw new Error(`${entry.name}: nonempty brief.md is required`);
    examples.push({ name: entry.name, motion });
  }
  return { references: references.length, examples };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) throw new Error('Usage: node scripts/check.mjs');
    const result = await check();
    console.log(`Static checks passed: ${result.references} references, ${result.examples.length} examples. No aesthetic or browser claims.`);
  } catch (error) { console.error(`Check failed: ${error.message}`); process.exitCode = 1; }
}
