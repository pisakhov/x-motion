// Static page templates for the X Motion gallery. Pure functions: data in, HTML string out.
import { escapeHtml as e } from './markdown.mjs';

export const SITE = { name: 'X Motion', repo: 'https://github.com/pisakhov/x-motion' };

const formatSeconds = seconds => `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
const modelName = model => ({ 'claude-opus-5-5': 'Claude Opus 5.5' })[model] ?? model;

function layout({ title, description, path, body, page }) {
  const nav = (href, label) => `<a href="${href}"${path === href || (href !== '/' && path.startsWith(href)) ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0c0c0d">
<link rel="preload" href="/fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css">
<script src="/app.js" defer></script>
</head>
<body data-page="${page}">
<a class="skip" href="#main">Skip to content</a>
<header class="bar">
  <a class="mark" href="/" aria-label="X Motion home"><span aria-hidden="true">X</span> Motion</a>
  <nav aria-label="Primary">${THEME_NAV.map(([href, label]) => nav(href, label)).join('')}${nav('/skills/', 'Skills')}<a class="wide-only" href="${SITE.repo}" rel="noopener noreferrer">GitHub</a></nav>
</header>
<main id="main">
${body}
</main>
<footer class="foot">
  <p>Every film is code, rendered frame by frame, with an original synthesized score.</p>
  <p><a href="${SITE.repo}" rel="noopener noreferrer">Source on GitHub</a> <span aria-hidden="true">/</span> MIT</p>
</footer>
</body>
</html>
`;
}

let THEME_NAV = [];
export function setThemes(themes) { THEME_NAV = themes.map(theme => [`/${theme.slug}/`, theme.title]); }

const video = (film, { cls = '', priority = false } = {}) =>
  `<video class="loop ${cls}" src="${film.preview}" poster="${film.poster}" muted loop playsinline preload="${priority ? 'auto' : 'none'}" aria-hidden="true" tabindex="-1"></video>`;

export function homePage(themes, filmsByTheme) {
  const chapters = themes.map((theme, index) => {
    const films = filmsByTheme.get(theme.slug);
    const lead = films[0];
    return `<a class="chapter" href="/${theme.slug}/">
  <div class="chapter-media">${lead ? `<img src="${lead.poster}" alt="" width="1920" height="1080"${index ? ' loading="lazy"' : ''}>${video(lead, { priority: index === 0 })}` : ''}</div>
  <div class="chapter-text">
    <h2>${e(theme.title)}</h2>
    <p>${e(theme.tagline)}</p>
    <span class="count">${films.length} ${films.length === 1 ? 'film' : 'films'}</span>
  </div>
</a>`;
  }).join('\n');
  return layout({
    title: 'X Motion', path: '/', page: 'home',
    description: 'Short films made by AI agents, each published with the prompt and the skill behind it.',
    body: `<section class="intro">
  <h1>Short films made by agents.</h1>
  <p>Each one is published with the prompt that started it and the skill that shaped it.</p>
</section>
<section class="chapters" aria-label="Themes">
${chapters}
</section>`,
  });
}

function tile(film, size) {
  return `<a class="tile tile-${size}" href="/m/${film.id}/">
  <div class="frame"><img src="${film.poster}" alt="" width="1920" height="1080" loading="lazy">${video(film)}</div>
  <div class="tile-meta"><h3>${e(film.title)}</h3><span>${formatSeconds(film.duration)}</span></div>
</a>`;
}

export function themePage(theme, films, nextTheme) {
  const tiles = films.map((film, index) => tile(film, index === 0 ? 'lead' : 'pair')).join('\n');
  return layout({
    title: `${theme.title} | X Motion`, path: `/${theme.slug}/`, page: 'theme',
    description: theme.tagline,
    body: `<section class="theme-head">
  <h1>${e(theme.title)}</h1>
  <p>${e(theme.tagline)}</p>
  <a class="chip" href="/skills/${theme.skill}/">${e(theme.skill)}</a>
</section>
<section class="tiles" aria-label="${e(theme.title)} films">
${films.length ? tiles : '<p class="empty">No films in this theme yet.</p>'}
</section>
${nextTheme ? `<nav class="next-theme" aria-label="Next theme"><a href="/${nextTheme.slug}/"><span>Next theme</span><strong>${e(nextTheme.title)}</strong></a></nav>` : ''}`,
  });
}

export function filmPage(film, theme, siblings) {
  const position = siblings.findIndex(item => item.id === film.id);
  const previous = siblings[(position - 1 + siblings.length) % siblings.length];
  const next = siblings[(position + 1) % siblings.length];
  const step = (item, rel, label) => siblings.length > 1 ? `<a class="step" rel="${rel}" href="/m/${item.id}/" data-key="${rel === 'prev' ? 'ArrowLeft' : 'ArrowRight'}"><span>${label}</span>${e(item.title)}</a>` : '';
  return layout({
    title: `${film.title} (${film.id}) | X Motion`, path: `/${theme.slug}/`, page: 'film',
    description: film.description,
    body: `<article class="film">
  <div class="stage">
    <video id="player" controls playsinline preload="metadata" poster="${film.poster}" src="${film.video}" width="${film.width}" height="${film.height}"></video>
  </div>
  <aside class="panel">
    <a class="back" href="/${theme.slug}/">${e(theme.title)}</a>
    <h1>${e(film.title)}</h1>
    <p class="lede">${e(film.description)}</p>
    <section class="block" aria-labelledby="prompt-label">
      <div class="block-head"><h2 id="prompt-label">Prompt</h2><button type="button" class="copy" data-copy-target="prompt">Copy</button></div>
      <p id="prompt" class="prompt">${e(film.prompt)}</p>
    </section>
    <section class="block" aria-labelledby="skills-label">
      <h2 id="skills-label">Skills</h2>
      <ul class="chips">${film.skills.map(skill => `<li><a class="chip" href="/skills/${skill}/">${e(skill)}</a></li>`).join('')}</ul>
    </section>
    <dl class="facts">
      <div><dt>ID</dt><dd><button type="button" class="id" data-copy-text="${film.id}" aria-label="Copy ID ${film.id}">${film.id}</button></dd></div>
      <div><dt>Length</dt><dd>${formatSeconds(film.duration)}</dd></div>
      <div><dt>Format</dt><dd>${film.width}×${film.height}</dd></div>
      <div><dt>Sound</dt><dd>${film.hasAudio ? 'Original score' : 'Silent'}</dd></div>
      <div><dt>Model</dt><dd>${e(modelName(film.model))}</dd></div>
      <div><dt>Source</dt><dd><a href="${SITE.repo}/blob/main/${film.source}" rel="noopener noreferrer">${e(film.source.split('/').slice(-2).join('/'))}</a></dd></div>
    </dl>
    <nav class="steps" aria-label="More from ${e(theme.title)}">${step(previous, 'prev', 'Previous')}${step(next, 'next', 'Next')}</nav>
  </aside>
</article>`,
  });
}

export function skillPage({ skill, file, fields, html, headings, files, rawHref, filmCount }) {
  const isMain = file === 'SKILL.md';
  const toc = headings.filter(heading => heading.level === 2);
  return layout({
    title: `${isMain ? skill : `${skill}/${file}`} | X Motion skills`, path: '/skills/', page: 'skill',
    description: fields.description ?? `${file} from the ${skill} skill.`,
    body: `<div class="doc">
  <aside class="doc-side">
    <a class="back" href="/skills/">Skills</a>
    <p class="doc-name">${e(skill)}</p>
    ${files.length > 1 ? `<ul class="files">${files.map(item => `<li><a href="${item.href}"${item.file === file ? ' aria-current="page"' : ''}>${e(item.file)}</a></li>`).join('')}</ul>` : ''}
    ${toc.length ? `<ul class="toc">${toc.map(heading => `<li><a href="#${heading.id}">${e(heading.text)}</a></li>`).join('')}</ul>` : ''}
  </aside>
  <article class="doc-body">
    <header class="doc-head">
      <p class="path">${e(`skills/${skill}/${file}`)}</p>
      ${isMain && fields.description ? `<p class="doc-desc">${e(fields.description)}</p>` : ''}
      <div class="actions">
        <button type="button" class="copy primary" data-copy-url="${rawHref}">Copy Markdown</button>
        <a class="button" href="${rawHref}" download="${e(isMain ? `${skill}-SKILL.md` : file.split('/').at(-1))}">Download</a>
        ${isMain && filmCount ? `<span class="used">Used in ${filmCount} ${filmCount === 1 ? 'film' : 'films'}</span>` : ''}
      </div>
    </header>
    <div class="md">
${html}
    </div>
  </article>
</div>`,
  });
}

export function skillsIndex(skills) {
  return layout({
    title: 'Skills | X Motion', path: '/skills/', page: 'skills',
    description: 'The Markdown skills used to make every X Motion film.',
    body: `<section class="theme-head">
  <h1>Skills</h1>
  <p>Plain Markdown. Paste one into any coding agent.</p>
</section>
<ul class="skill-list">
${skills.map(skill => `<li><a href="/skills/${skill.name}/"><strong>${e(skill.name)}</strong><span>${e(skill.description)}</span><em>${skill.filmCount} ${skill.filmCount === 1 ? 'film' : 'films'}</em></a></li>`).join('\n')}
</ul>`,
  });
}

export function notFoundPage() {
  return layout({
    title: 'Not found | X Motion', path: '', page: 'missing', description: 'Page not found.',
    body: `<section class="theme-head missing"><h1>Nothing here.</h1><p>The page may have moved, or the film was retired.</p><a class="chip" href="/">Back to the gallery</a></section>`,
  });
}
