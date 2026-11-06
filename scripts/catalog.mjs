#!/usr/bin/env node
import { readFile, lstat, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const STATUSES = ['review', 'kept', 'improve', 'discarded'];
const ID = /^XM-\d{4,}$/;
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
  requireThat(catalog?.version === 1 && Array.isArray(catalog.motions), 'Expected catalog version 1 and motions array');
  requireThat(catalog.feedback === undefined || Array.isArray(catalog.feedback), 'feedback must be an array');
  const ids = new Map();
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
      requireThat(typeof motion[field] === 'string' && /^[a-f0-9]{64}$/.test(motion[field]), `${motion.id}: ${field} must be a lowercase SHA-256 digest`);
    }
    requireThat(motion.parentId === null || validId(motion.parentId), `${motion.id}: invalid parentId`);
    requireThat(typeof motion.hasAudio === 'boolean', `${motion.id}: hasAudio must be boolean`);
    requireThat(typeof motion.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(motion.createdAt) && !Number.isNaN(Date.parse(motion.createdAt)) && new Date(motion.createdAt).toISOString().slice(0, 10) === motion.createdAt, `${motion.id}: invalid createdAt date`);
    requireThat(typeof motion.source === 'string' && /^examples\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.html$/.test(motion.source), `${motion.id}: invalid source path`);
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
    for (const [extension, maxSize] of [['mp4', 250 * 1024 * 1024], ['webp', 20 * 1024 * 1024]]) {
      const filename = path.join(directory, `${motion.id}.${extension}`);
      const stat = await lstat(filename);
      requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= maxSize, `${motion.id}.${extension}: expected nonempty regular file within size limit`);
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(filename)) hash.update(chunk);
      const expected = motion[extension === 'mp4' ? 'videoSha256' : 'posterSha256'];
      requireThat(hash.digest('hex') === expected, `${motion.id}.${extension}: SHA-256 mismatch; do not overwrite permanent-ID assets`);
    }
  }
}

// One authoritative JSON document: a status and its feedback event become visible together.
// Exclusive lock prevents lost updates between cooperating CLI writers; stale locks fail closed.
export async function recordFeedback(root, id, status, note) {
  requireThat(validId(id), 'Invalid motion ID');
  requireThat(STATUSES.includes(status), 'Invalid feedback status');
  text(note, 'Feedback note');
  const filename = path.join(root, 'data/catalog.json');
  const lockPath = `${filename}.lock`;
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const lock = await open(lockPath, 'wx', 0o600);
  let temporaryCreated = false;
  try {
    const catalog = await readCatalog(root);
    const motion = catalog.motions.find(item => item.id === id);
    requireThat(motion, `Unknown motion ID: ${id}`);
    const event = { id, timestamp: new Date().toISOString(), previousStatus: motion.status, status, note };
    motion.status = status;
    catalog.feedback ??= [];
    catalog.feedback.push(event);
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
    return event;
  } finally {
    if (temporaryCreated) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await lock.close();
    await unlink(lockPath);
  }
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
  } else if (command === 'list' || command === 'validate') {
    requireThat(rest.length === 0, `Usage: ${command}`);
    const catalog = await readCatalog(root);
    if (command === 'validate') {
      await validateMedia(root, catalog.motions);
      console.log(`Valid: ${catalog.motions.length} motions`);
    } else {
      for (const motion of catalog.motions) console.log(`${motion.id}\t${motion.status}\t${motion.title}`);
    }
  } else {
    throw new Error('Usage: catalog.mjs list | validate | feedback ID --status STATUS --note NOTE');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
