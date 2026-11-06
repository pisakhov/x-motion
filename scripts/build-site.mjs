#!/usr/bin/env node
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, rename, rm, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readCatalog, validateMedia } from './catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '.x-motion-build.json';
const PUBLIC_FIELDS = ['id', 'title', 'description', 'status', 'duration', 'width', 'height', 'video', 'poster', 'parentId', 'createdAt', 'hasAudio'];

export function publicCatalog(catalog) {
  return {
    version: 1,
    motions: catalog.motions.filter(motion => motion.status !== 'discarded').map(motion =>
      Object.fromEntries(PUBLIC_FIELDS.map(key => [key, motion[key]]))),
  };
}

// --out is intentionally limited to immediate dist / dist-* directories, never arbitrary paths.
// Existing directories are replaced only if they carry our generated marker.
export async function buildSite(root = ROOT, out = 'dist') {
  if (!/^dist(?:-[A-Za-z0-9_-]+)?$/.test(out)) throw new Error('--out must be dist or dist-NAME (no paths)');
  const destination = path.join(root, out);
  const lockPath = path.join(root, '.build-site.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  let stage;
  let backup;
  try {
    let exists = false;
    try {
      const stat = await lstat(destination);
      exists = true;
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Output must be a real generated directory');
      const marker = JSON.parse(await readFile(path.join(destination, MARKER), 'utf8'));
      if (marker.generator !== 'x-motion' || marker.version !== 1) throw new Error('Output is not an X Motion build');
    } catch (error) {
      if (error.code !== 'ENOENT' || exists) throw error;
    }
    const sourceCatalog = await readCatalog(root);
    const activeMotions = sourceCatalog.motions.filter(motion => motion.status !== 'discarded');
    const catalog = publicCatalog(sourceCatalog);
    await validateMedia(root, activeMotions);
    const siteDirectory = path.join(root, 'site');
    if (!(await lstat(siteDirectory)).isDirectory()) throw new Error('site must be a real directory');
    for (const name of ['index.html', 'app.js', 'style.css']) {
      if (!(await lstat(path.join(siteDirectory, name))).isFile()) throw new Error(`site/${name} must be a regular file`);
    }
    stage = await mkdtemp(path.join(root, '.site-build-'));
    await mkdir(path.join(stage, 'media'));
    for (const name of ['index.html', 'app.js', 'style.css']) {
      await copyFile(path.join(siteDirectory, name), path.join(stage, name));
    }
    for (const motion of catalog.motions) {
      for (const extension of ['mp4', 'webp']) {
        const name = `${motion.id}.${extension}`;
        await copyFile(path.join(root, 'gallery-media', name), path.join(stage, 'media', name));
      }
    }
    // Check the actual staged bytes too: a source changed during copying must not ship.
    await validateMedia(root, activeMotions, path.join(stage, 'media'));
    await writeFile(path.join(stage, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
    await writeFile(path.join(stage, MARKER), '{"generator":"x-motion","version":1}\n');
    if (exists) {
      backup = path.join(root, `.site-previous-${randomUUID()}`);
      await rename(destination, backup);
    }
    try {
      await rename(stage, destination);
      stage = undefined;
    } catch (error) {
      if (backup) {
        await rename(backup, destination);
        backup = undefined;
      }
      throw error;
    }
    if (backup) await rm(backup, { recursive: true });
    return { out: destination, count: catalog.motions.length };
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true });
    await lock.close();
    await unlink(lockPath);
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args.length && !(args.length === 2 && args[0] === '--out')) throw new Error('Usage: build-site.mjs [--out dist-NAME]');
  const result = await buildSite(ROOT, args[1] ?? 'dist');
  console.log(`Built ${result.count} motions → ${result.out}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
