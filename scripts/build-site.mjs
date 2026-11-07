#!/usr/bin/env node
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readCatalog, validateMedia, mediaFiles } from './catalog.mjs';
import { renderMarkdown, splitFrontmatter } from './markdown.mjs';
import { SITE, setThemes, homePage, themePage, filmPage, skillPage, skillsIndex, notFoundPage } from './site-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '.x-motion-build.json';
const PUBLIC_FIELDS = ['id', 'title', 'description', 'status', 'duration', 'width', 'height', 'video', 'poster', 'preview', 'parentId', 'createdAt', 'hasAudio', 'theme', 'slug', 'prompt', 'skills', 'model', 'source', 'captions', 'transcript'];
const SITE_FILES = ['style.css', 'app.js', 'fonts/geist.woff2', 'fonts/geist-mono.woff2', 'fonts/OFL.txt'];

export function publicCatalog(catalog) {
  return {
    version: 2,
    themes: catalog.themes.map(({ slug, title, tagline, skill }) => ({ slug, title, tagline, skill })),
    motions: catalog.motions.filter(motion => motion.status !== 'discarded').map(motion =>
      Object.fromEntries(PUBLIC_FIELDS.map(key => [key, motion[key]]))),
  };
}

async function regularFile(file, label) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
}

// Markdown files of one skill, SKILL.md first, then references in path order. Symlinks are refused.
async function skillFiles(directory, prefix = '') {
  const found = [];
  for (const entry of (await readdir(path.join(directory, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Skill files cannot be symlinks: ${relative}`);
    if (entry.isDirectory()) found.push(...await skillFiles(directory, relative));
    else if (entry.isFile() && /^[A-Za-z0-9_.-]+\.md$/.test(entry.name) && relative.split('/').every(part => /^[A-Za-z0-9_.-]+$/.test(part) && !part.startsWith('.'))) found.push(relative);
  }
  return found.sort((a, b) => (b === 'SKILL.md') - (a === 'SKILL.md') || a.localeCompare(b));
}

const pageHref = (skill, file) => file === 'SKILL.md' ? `/skills/${skill}/` : `/skills/${skill}/${file.replace(/\.md$/, '')}/`;

async function loadSkills(root) {
  const skills = new Map();
  for (const entry of await readdir(path.join(root, 'skills'), { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) continue;
    const directory = path.join(root, 'skills', entry.name);
    const files = await skillFiles(directory);
    if (files[0] !== 'SKILL.md') continue;
    const sources = new Map();
    for (const file of files) sources.set(file, await readFile(path.join(directory, file), 'utf8'));
    const { fields } = splitFrontmatter(sources.get('SKILL.md'));
    if (fields.name !== entry.name || !fields.description) throw new Error(`skills/${entry.name}/SKILL.md needs matching name and a description`);
    skills.set(entry.name, { name: entry.name, description: fields.description, files, sources });
  }
  return skills;
}

function renderSkillFile(skill, file, source) {
  const { fields, body } = splitFrontmatter(source);
  const base = path.posix.dirname(file);
  const rewriteLink = href => {
    const [target, hash = ''] = href.split('#');
    if (!target) return href;
    const resolved = path.posix.normalize(path.posix.join(base, target));
    const anchor = hash ? `#${hash}` : '';
    if (!resolved.startsWith('../') && skill.files.includes(resolved)) return pageHref(skill.name, resolved) + anchor;
    const repoPath = path.posix.normalize(path.posix.join('skills', skill.name, base, target));
    if (repoPath.startsWith('../')) return null;
    return `${SITE.repo}/blob/main/${repoPath}${anchor}`;
  };
  return { fields, ...renderMarkdown(body, { rewriteLink }) };
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
    const skills = await loadSkills(root);
    for (const theme of catalog.themes) if (!skills.has(theme.skill)) throw new Error(`Theme ${theme.slug} names missing skill ${theme.skill}`);
    for (const motion of catalog.motions) for (const skill of motion.skills) if (!skills.has(skill)) throw new Error(`${motion.id} names missing skill ${skill}`);
    const siteDirectory = path.join(root, 'site');
    for (const name of SITE_FILES) await regularFile(path.join(siteDirectory, name), `site/${name}`);
    stage = await mkdtemp(path.join(root, '.site-build-'));
    const write = async (relative, content) => {
      await mkdir(path.dirname(path.join(stage, relative)), { recursive: true });
      await writeFile(path.join(stage, relative), content, { flag: 'wx' });
    };
    await mkdir(path.join(stage, 'media'));
    await mkdir(path.join(stage, 'fonts'));
    for (const name of SITE_FILES) await copyFile(path.join(siteDirectory, name), path.join(stage, name));
    for (const motion of activeMotions) {
      for (const [name] of mediaFiles(motion)) await copyFile(path.join(root, 'gallery-media', name), path.join(stage, 'media', name));
    }
    // Check the actual staged bytes too: a source changed during copying must not ship.
    await validateMedia(root, activeMotions, path.join(stage, 'media'));

    setThemes(catalog.themes);
    const byTheme = new Map(catalog.themes.map(theme => [theme.slug, catalog.motions.filter(motion => motion.theme === theme.slug)]));
    await write('index.html', homePage(catalog.themes, byTheme));
    await write('404.html', notFoundPage());
    for (const [index, theme] of catalog.themes.entries()) {
      const films = byTheme.get(theme.slug);
      await write(`${theme.slug}/index.html`, themePage(theme, films, catalog.themes[(index + 1) % catalog.themes.length]));
      for (const film of films) await write(`m/${film.id}/index.html`, filmPage(film, theme, films));
    }
    const usage = name => catalog.motions.filter(motion => motion.skills.includes(name)).length;
    const listed = [...skills.values()].sort((a, b) => (a.name === 'x-motion' ? -1 : b.name === 'x-motion' ? 1 : a.name.localeCompare(b.name)));
    await write('skills/index.html', skillsIndex(listed.map(skill => ({ name: skill.name, description: skill.description, filmCount: usage(skill.name) }))));
    for (const skill of listed) {
      const files = skill.files.map(file => ({ file, href: pageHref(skill.name, file) }));
      for (const file of skill.files) {
        const rawHref = `/skills/${skill.name}/${file}`;
        await write(rawHref.slice(1), skill.sources.get(file));
        const rendered = renderSkillFile(skill, file, skill.sources.get(file));
        await write(`${pageHref(skill.name, file).slice(1)}index.html`, skillPage({ skill: skill.name, file, ...rendered, files, rawHref, filmCount: usage(skill.name) }));
      }
    }
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
  console.log(`Built ${result.count} films → ${result.out}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
