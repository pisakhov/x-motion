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

// Accept only numeric literals for the known fields; never eval composition JavaScript.
export function extractMotion(html) {
  const body = /window\.motion\s*=\s*\{([^}]+)\}/.exec(html)?.[1];
  if (!body) throw new Error('Provide literal window.motion metadata');
  const value = {};
  for (const field of body.split(',').map(field => field.trim()).filter(Boolean)) {
    const match = /^(?:["']?)(width|height|duration|fps|poster)(?:["']?)\s*:\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i.exec(field);
    if (!match || Object.hasOwn(value, match[1])) throw new Error('window.motion must contain unique numeric metadata literals');
    value[match[1]] = Number(match[2]);
  }
  return validateMotion(value);
}

// Visible copy rule shared by skills and site templates: no em dashes.
export function assertNoEmDash(text, label) {
  const line = text.split('\n').findIndex(row => row.includes('\u2014'));
  if (line >= 0) throw new Error(`${label}:${line + 1}: replace the em dash`);
}

async function checkSkill(skillsDir, name) {
  const skillDir = path.join(skillsDir, name);
  const skill = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
  const frontmatter = validateFrontmatter(skill);
  if (frontmatter.name !== name) throw new Error(`skills/${name}: frontmatter name must be ${name}`);
  assertNoEmDash(skill, `skills/${name}/SKILL.md`);
  const realSkillDir = await fs.realpath(skillDir);
  const references = localReferences(skill);
  for (const ref of references) {
    const file = await fs.realpath(path.join(skillDir, ref));
    if (!file.startsWith(`${realSkillDir}${path.sep}`) || !(await fs.stat(file)).isFile()) throw new Error(`skills/${name}: invalid reference ${ref}`);
    const text = await fs.readFile(file, 'utf8');
    if (!text.trim()) throw new Error(`skills/${name}: empty reference ${ref}`);
    if (file.endsWith('.md')) assertNoEmDash(text, `skills/${name}/${ref}`);
  }
  return { name, references: references.length };
}

async function htmlFiles(directory, prefix = '') {
  const found = [];
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...await htmlFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile() && entry.name.endsWith('.html')) found.push(relative);
  }
  return found;
}

export async function check(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const skillsDir = path.join(root, 'skills');
  const skillNames = (await fs.readdir(skillsDir, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  if (!skillNames.includes('x-motion')) throw new Error('The core x-motion skill is required');
  const skills = [];
  for (const name of skillNames) skills.push(await checkSkill(skillsDir, name));
  if (!skills.find(skill => skill.name === 'x-motion').references) throw new Error('The core skill must link to its references');

  const examples = [];
  for (const relative of await htmlFiles(path.join(root, 'examples'))) {
    const html = await fs.readFile(path.join(root, 'examples', relative), 'utf8');
    // A composition defines the contract inline, or through kit scripts loaded by relative path: a sibling
    // (kit.js) or a shared one elsewhere under examples/ (../reel/reel.js). Paths may not leave examples/.
    const kits = [...html.matchAll(/<script\s+src="((?:\.\.\/)?(?:[A-Za-z0-9_-]+\/)?[A-Za-z0-9_-]+\.js)"><\/script>/g)].map(match => match[1]);
    let contract = html;
    for (const kit of kits) {
      const file = path.join(root, 'examples', path.dirname(relative), kit);
      if (path.relative(path.join(root, 'examples'), file).startsWith('..')) throw new Error(`examples/${relative}: script ${kit} is outside examples/`);
      contract += await fs.readFile(file, 'utf8');
    }
    if (!/window\.renderFrame\s*=/.test(contract)) throw new Error(`examples/${relative}: missing window.renderFrame assignment`);
    if (!/window\.motion\s*=/.test(contract)) throw new Error(`examples/${relative}: missing window.motion metadata`);
    // Fully literal metadata is validated here; computed metadata is validated by the renderer at run time.
    let motion = null;
    try { motion = extractMotion(html); } catch { /* computed metadata */ }
    examples.push({ name: relative, source: `examples/${relative}`, motion });
  }
  if (!examples.length) throw new Error('At least one example composition is required');

  const catalog = JSON.parse(await fs.readFile(path.join(root, 'data/catalog.json'), 'utf8'));
  for (const theme of catalog.themes ?? []) if (!skillNames.includes(theme.skill)) throw new Error(`Theme ${theme.slug} names a missing skill ${theme.skill}`);
  for (const motion of catalog.motions ?? []) {
    if (motion.status === 'discarded') continue;
    const example = examples.find(item => item.source === motion.source);
    if (!example) throw new Error(`${motion.id}: source ${motion.source} is not an example composition`);
    if (example.motion) for (const field of ['width', 'height', 'duration']) if (example.motion[field] !== motion[field]) throw new Error(`${motion.id}: ${field} disagrees with ${motion.source}`);
    for (const skill of motion.skills ?? []) if (!skillNames.includes(skill)) throw new Error(`${motion.id}: missing skill ${skill}`);
  }
  for (const file of ['scripts/site-pages.mjs']) assertNoEmDash(await fs.readFile(path.join(root, file), 'utf8'), file);
  return { skills, examples };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) throw new Error('Usage: node scripts/check.mjs');
    const result = await check();
    console.log(`Static checks passed: ${result.skills.length} skills, ${result.examples.length} compositions. No aesthetic or browser claims.`);
  } catch (error) { console.error(`Check failed: ${error.message}`); process.exitCode = 1; }
}
