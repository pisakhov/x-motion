#!/usr/bin/env node
import { readFile, lstat, open, rename, unlink, copyFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';

export const STATUSES = ['review', 'kept', 'improve', 'discarded'];
const ID = /^XM-\d{4,}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA = /^[a-f0-9]{64}$/;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}
function text(value, name) {
  requireThat(typeof value === 'string' && value.trim().length > 0, `${name} must be nonempty text`);
}
function validId(id) {
  return typeof id === 'string' && ID.test(id) && /[1-9]/.test(id);
}

export function validateCatalog(catalog) {
  requireThat(catalog?.version === 2 && Array.isArray(catalog.motions) && Array.isArray(catalog.themes), 'Expected catalog version 2 with themes and motions arrays');
  requireThat(catalog.feedback === undefined || Array.isArray(catalog.feedback), 'feedback must be an array');
  const themes = new Map();
  for (const theme of catalog.themes) {
    requireThat(theme && typeof theme.slug === 'string' && SLUG.test(theme.slug) && !['m', 'skills', 'media', 'fonts'].includes(theme.slug), 'Invalid theme slug');
    requireThat(!themes.has(theme.slug), `Duplicate theme: ${theme.slug}`);
    themes.set(theme.slug, theme);
    text(theme.title, `${theme.slug} title`);
    text(theme.tagline, `${theme.slug} tagline`);
    requireThat(typeof theme.skill === 'string' && SLUG.test(theme.skill), `${theme.slug}: invalid skill name`);
  }
  const ids = new Map();
  const slugs = new Set();
  for (const motion of catalog.motions) {
    requireThat(motion && validId(motion.id), 'Invalid motion ID (expected XM-0001 style)');
    requireThat(!ids.has(motion.id), `Duplicate ID: ${motion.id}`);
    ids.set(motion.id, motion);
    text(motion.title, `${motion.id} title`);
    text(motion.description, `${motion.id} description`);
    requireThat(STATUSES.includes(motion.status), `${motion.id}: invalid status`);
    requireThat(Number.isFinite(motion.duration) && motion.duration > 0 && motion.duration <= 3600, `${motion.id}: invalid duration`);
    for (const dimension of ['width', 'height']) {
      requireThat(Number.isInteger(motion[dimension]) && motion[dimension] > 0 && motion[dimension] <= 8192, `${motion.id}: invalid ${dimension}`);
    }
    requireThat(motion.video === `/media/${motion.id}.mp4` && motion.poster === `/media/${motion.id}.webp`, `${motion.id}: asset paths must match ID`);
    for (const field of ['videoSha256', 'posterSha256']) {
      requireThat(typeof motion[field] === 'string' && SHA.test(motion[field]), `${motion.id}: ${field} must be a lowercase SHA-256 digest`);
    }
    requireThat(motion.parentId === null || validId(motion.parentId), `${motion.id}: invalid parentId`);
    requireThat(typeof motion.hasAudio === 'boolean', `${motion.id}: hasAudio must be boolean`);
    requireThat(typeof motion.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(motion.createdAt) && !Number.isNaN(Date.parse(motion.createdAt)) && new Date(motion.createdAt).toISOString().slice(0, 10) === motion.createdAt, `${motion.id}: invalid createdAt date`);
    requireThat(typeof motion.source === 'string' && /^examples\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.html$/.test(motion.source), `${motion.id}: invalid source path`);
    // Pre-theme films (catalog v1) keep their records but may only remain discarded.
    if (motion.theme === null) {
      requireThat(motion.status === 'discarded', `${motion.id}: active films must belong to a theme`);
      continue;
    }
    requireThat(themes.has(motion.theme), `${motion.id}: unknown theme ${motion.theme}`);
    requireThat(typeof motion.slug === 'string' && SLUG.test(motion.slug), `${motion.id}: invalid slug`);
    requireThat(!slugs.has(`${motion.theme}/${motion.slug}`), `${motion.id}: duplicate slug in theme`);
    slugs.add(`${motion.theme}/${motion.slug}`);
    text(motion.prompt, `${motion.id} prompt`);
    text(motion.model, `${motion.id} model`);
    requireThat(Array.isArray(motion.skills) && motion.skills.length > 0 && motion.skills.length <= 8 && motion.skills.every(skill => typeof skill === 'string' && SLUG.test(skill)) && new Set(motion.skills).size === motion.skills.length, `${motion.id}: skills must be unique kebab-case names`);
    requireThat(motion.preview === `/media/${motion.id}-preview.mp4` && typeof motion.previewSha256 === 'string' && SHA.test(motion.previewSha256), `${motion.id}: preview path must match ID with a SHA-256 digest`);
  }
  for (const motion of ids.values()) {
    const seen = new Set([motion.id]);
    let parent = motion.parentId;
    while (parent !== null) {
      requireThat(ids.has(parent), `${motion.id}: unknown parent ${parent}`);
      requireThat(!seen.has(parent), `${motion.id}: parent cycle`);
      seen.add(parent);
      parent = ids.get(parent).parentId;
    }
  }
  for (const event of catalog.feedback ?? []) {
    requireThat(event && ids.has(event.id), 'Feedback references unknown ID');
    requireThat(STATUSES.includes(event.previousStatus) && STATUSES.includes(event.status), 'Invalid feedback status');
    text(event.note, 'Feedback note');
    requireThat(typeof event.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(event.timestamp) && !Number.isNaN(Date.parse(event.timestamp)), 'Invalid feedback timestamp');
  }
  return catalog;
}

export async function readCatalog(root = ROOT) {
  return validateCatalog(JSON.parse(await readFile(path.join(root, 'data/catalog.json'), 'utf8')));
}

export async function validateMedia(root, motions, directory = path.join(root, 'gallery-media')) {
  const dirStat = await lstat(directory);
  requireThat(dirStat.isDirectory() && !dirStat.isSymbolicLink(), 'gallery-media must be a real directory');
  for (const motion of motions) {
    for (const [name, maxSize, expected] of mediaFiles(motion)) {
      const filename = path.join(directory, name);
      const stat = await lstat(filename);
      requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= maxSize, `${name}: expected nonempty regular file within size limit`);
      requireThat(await sha256File(filename) === expected, `${name}: SHA-256 mismatch; do not overwrite permanent-ID assets`);
    }
  }
}

export function mediaFiles(motion) {
  const files = [[`${motion.id}.mp4`, 250 * 1024 * 1024, motion.videoSha256], [`${motion.id}.webp`, 20 * 1024 * 1024, motion.posterSha256]];
  if (motion.preview) files.push([`${motion.id}-preview.mp4`, 50 * 1024 * 1024, motion.previewSha256]);
  return files;
}

export async function sha256File(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function writeCatalogLocked(root, mutate) {
  const filename = path.join(root, 'data/catalog.json');
  const lockPath = `${filename}.lock`;
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const lock = await open(lockPath, 'wx', 0o600);
  let temporaryCreated = false;
  try {
    const catalog = await readCatalog(root);
    const result = await mutate(catalog);
    validateCatalog(catalog);
    const file = await open(temporary, 'wx', 0o644);
    temporaryCreated = true;
    try {
      await file.writeFile(`${JSON.stringify(catalog, null, 2)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, filename);
    return result;
  } finally {
    if (temporaryCreated) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await lock.close();
    await unlink(lockPath);
  }
}

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${executable} exited ${code}: ${stderr}`)));
  });
}

const SPEC_FIELDS = ['source', 'theme', 'slug', 'title', 'description', 'prompt', 'skills', 'model', 'parentId'];

// Publish a verified --video render under the next permanent ID. Media is copied, never overwritten.
export async function addMotion(root, renderDirectory, spec, today = new Date().toISOString().slice(0, 10)) {
  requireThat(spec && typeof spec === 'object' && !Array.isArray(spec), 'Spec must be a JSON object');
  for (const key of Object.keys(spec)) requireThat(SPEC_FIELDS.includes(key), `Unknown spec field: ${key}`);
  const renderDir = await realpath(renderDirectory);
  const manifest = JSON.parse(await readFile(path.join(renderDir, 'manifest.json'), 'utf8'));
  requireThat(manifest.mode === 'video' && manifest.determinismCheck?.passed === true, 'Render must be a passing --video render');
  requireThat(manifest.composition === path.basename(spec.source ?? ''), 'Render composition does not match spec.source');
  const recorded = Object.fromEntries(manifest.files.map(file => [file.file, file.sha256]));
  for (const name of ['film.mp4', 'poster.webp']) requireThat(await sha256File(path.join(renderDir, name)) === recorded[name], `${name} does not match the render manifest`);
  const sourceFile = path.join(root, spec.source);
  requireThat((await lstat(sourceFile)).isFile(), 'spec.source must exist');
  return writeCatalogLocked(root, async catalog => {
    const next = Math.max(0, ...catalog.motions.map(item => Number(item.id.slice(3)))) + 1;
    const id = `XM-${String(next).padStart(4, '0')}`;
    const media = path.join(root, 'gallery-media');
    const film = path.join(media, `${id}.mp4`), poster = path.join(media, `${id}.webp`), preview = path.join(media, `${id}-preview.mp4`);
    const { motion } = manifest;
    const created = [];
    try {
      for (const [from, to] of [['film.mp4', film], ['poster.webp', poster]]) {
        await copyFile(path.join(renderDir, from), to, 1); // COPYFILE_EXCL: never overwrite permanent-ID media
        created.push(to);
      }
      // Muted, smaller loop for autoplaying theme doors and grid tiles. Refuse (and never delete) a stray existing file.
      await lstat(preview).then(() => { throw new Error(`${path.basename(preview)} already exists`); }, error => { if (error.code !== 'ENOENT') throw error; });
      created.push(preview);
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', film, '-an', '-vf', 'scale=960:-2:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-threads', '1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', preview]);
      const record = {
        id, title: spec.title, description: spec.description, status: 'review',
        duration: motion.duration, width: motion.width, height: motion.height,
        video: `/media/${id}.mp4`, poster: `/media/${id}.webp`, preview: `/media/${id}-preview.mp4`,
        videoSha256: await sha256File(film), posterSha256: await sha256File(poster), previewSha256: await sha256File(preview),
        parentId: spec.parentId ?? null, createdAt: today, source: spec.source, hasAudio: manifest.audio !== null && manifest.audio !== undefined,
        theme: spec.theme, slug: spec.slug, prompt: spec.prompt, skills: spec.skills, model: spec.model,
      };
      catalog.motions.push(record);
      validateCatalog(catalog);
      return record;
    } catch (error) {
      // Only remove files this call created; an EEXIST failure never reaches another ID's media.
      await Promise.allSettled(created.map(file => unlink(file)));
      throw error;
    }
  });
}

// One authoritative JSON document: a status and its feedback event become visible together.
// Exclusive lock prevents lost updates between cooperating CLI writers; stale locks fail closed.
export async function recordFeedback(root, id, status, note) {
  requireThat(validId(id), 'Invalid motion ID');
  requireThat(STATUSES.includes(status), 'Invalid feedback status');
  text(note, 'Feedback note');
  return writeCatalogLocked(root, catalog => {
    const motion = catalog.motions.find(item => item.id === id);
    requireThat(motion, `Unknown motion ID: ${id}`);
    const event = { id, timestamp: new Date().toISOString(), previousStatus: motion.status, status, note };
    motion.status = status;
    catalog.feedback ??= [];
    catalog.feedback.push(event);
    return event;
  });
}

export async function main(args = process.argv.slice(2), root = ROOT) {
  const [command, ...rest] = args;
  if (command === 'feedback') {
    const [id, ...flags] = rest;
    const options = new Map();
    requireThat(flags.length === 4, 'Usage: feedback XM-0001 --status improve --note "Exact user feedback"');
    for (let index = 0; index < flags.length; index += 2) {
      requireThat(['--status', '--note'].includes(flags[index]) && !options.has(flags[index]), 'Unknown or duplicate feedback option');
      options.set(flags[index], flags[index + 1]);
    }
    const event = await recordFeedback(root, id, options.get('--status'), options.get('--note'));
    console.log(`${id}: ${event.previousStatus} → ${event.status}`);
  } else if (command === 'add') {
    requireThat(rest.length === 4 && rest[0] === '--render' && rest[2] === '--spec', 'Usage: add --render renders/NAME --spec spec.json');
    const record = await addMotion(root, rest[1], JSON.parse(await readFile(rest[3], 'utf8')));
    console.log(`${record.id}\t${record.theme}/${record.slug}\t${record.title}`);
  } else if (command === 'list' || command === 'validate') {
    requireThat(rest.length === 0, `Usage: ${command}`);
    const catalog = await readCatalog(root);
    if (command === 'validate') {
      await validateMedia(root, catalog.motions);
      console.log(`Valid: ${catalog.motions.length} motions`);
    } else {
      for (const motion of catalog.motions) console.log(`${motion.id}\t${motion.status}\t${motion.theme ?? '-'}\t${motion.title}`);
    }
  } else {
    throw new Error('Usage: catalog.mjs list | validate | feedback ID --status STATUS --note NOTE | add --render DIR --spec FILE');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
