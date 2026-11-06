'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const player = $('player');
  const statusLabels = { review: 'Review', kept: 'Kept', improve: 'Improve' };
  let motions = [];
  let selected = null;
  let filter = 'all';
  let copyGeneration = 0;

  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const duration = (seconds) => `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
  const mediaPath = (value) => typeof value === 'string' && /^\/media\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes('..');
  const validMotion = (item) => item && /^XM-\d{4,}$/.test(item.id)
    && typeof item.title === 'string' && typeof item.description === 'string'
    && Object.hasOwn(statusLabels, item.status)
    && Number.isFinite(item.duration) && item.duration > 0
    && Number.isInteger(item.width) && item.width > 0
    && Number.isInteger(item.height) && item.height > 0
    && mediaPath(item.video) && mediaPath(item.poster);

  function renderList() {
    const visible = motions.filter((film) => filter === 'all' || film.status === filter);
    $('collection-count').textContent = `${visible.length} / ${motions.length} studies`;
    $('filter-empty').hidden = visible.length !== 0;
    const fragment = document.createDocumentFragment();
    visible.forEach((film) => {
      const card = node('button', 'film-card');
      card.type = 'button';
      card.setAttribute('aria-current', String(film.id === selected?.id));
      card.setAttribute('aria-label', `${film.id}: ${film.title}. ${statusLabels[film.status]}. ${duration(film.duration)}. Select film.`);
      const image = node('img', 'film-thumb');
      image.src = film.poster;
      image.alt = '';
      image.width = 160;
      image.height = 90;
      image.loading = 'lazy';
      const content = node('span', 'film-card-copy');
      const top = node('span', 'film-card-top');
      const badge = node('span', 'status', statusLabels[film.status]);
      badge.dataset.status = film.status;
      top.append(node('span', 'mono', film.id), badge);
      content.append(top, node('span', 'film-card-title', film.title), node('span', 'film-card-bottom', `${duration(film.duration)} · ${film.hasAudio === true ? 'With sound' : 'Silent'}`));
      const arrow = node('span', 'film-arrow', film.id === selected?.id ? '↖' : '↗');
      arrow.setAttribute('aria-hidden', 'true');
      card.append(image, content, arrow);
      card.addEventListener('click', () => {
        if (selected?.id !== film.id) {
          history.pushState(null, '', `#${film.id}`);
          selectFilm(film);
        }
        player.scrollIntoView({ block: 'center', behavior: 'auto' });
        player.focus({ preventScroll: true });
      });
      fragment.append(card);
    });
    $('film-list').replaceChildren(fragment);
  }

  function setFilter(value) {
    filter = value;
    document.querySelectorAll('[data-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
    });
    renderList();
  }

  function selectFilm(film) {
    if (selected?.id === film.id) return;
    selected = film;
    copyGeneration += 1;
    player.pause();
    player.removeAttribute('src');
    player.poster = film.poster;
    player.src = film.video;
    player.setAttribute('aria-label', `${film.id}: ${film.title}`);
    player.load();
    $('video-error').hidden = true;
    $('feature-id').textContent = film.id;
    $('film-title').textContent = film.title;
    $('film-description').textContent = film.description;
    $('film-status').textContent = statusLabels[film.status];
    $('film-status').dataset.status = film.status;
    $('film-date').textContent = typeof film.createdAt === 'string' ? film.createdAt.slice(0, 10) : '';
    $('film-specs').textContent = `${duration(film.duration)} / ${film.width} × ${film.height} / ${film.hasAudio === true ? 'Sound on play' : 'Silent film'}`;
    const parent = motions.find((item) => item.id === film.parentId);
    if (parent) {
      const link = node('a', 'mono', `From ${parent.id} ↗`);
      link.href = `#${parent.id}`;
      $('lineage').replaceChildren(link);
    } else {
      $('lineage').textContent = film.parentId ? `From ${String(film.parentId)} · unavailable` : 'Original study';
    }
    $('copy-message').textContent = '';
    $('manual-copy').hidden = true;
    $('copy-text').value = '';
    $('selection-notice').hidden = true;
    document.title = `${film.id} · ${film.title} — X Motion`;
    renderList();
  }

  function syncHash() {
    if (!motions.length) return;
    const id = location.hash.slice(1);
    const film = motions.find((item) => item.id === id);
    if (film) {
      if (filter !== 'all' && filter !== film.status) setFilter('all');
      selectFilm(film);
      $('selection-notice').hidden = true;
    } else if (/^XM-/.test(id)) {
      if (!selected) selectFilm(motions[0]);
      $('selection-notice').textContent = 'That motion ID isn’t available in this collection. Showing another study.';
      $('selection-notice').hidden = false;
    } else if (!selected) {
      selectFilm(motions[0]);
      if (!id) history.replaceState(null, '', `#${motions[0].id}`);
    }
  }

  async function copyText(text, successMessage) {
    const generation = ++copyGeneration;
    $('manual-copy').hidden = true;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch { /* Permission-denied and insecure contexts use the local fallback. */ }
    if (generation !== copyGeneration) return;
    if (!copied) {
      const previousFocus = document.activeElement;
      $('manual-copy').hidden = false;
      $('copy-text').value = text;
      $('copy-text').focus({ preventScroll: true });
      $('copy-text').select();
      try { copied = document.execCommand('copy'); } catch { copied = false; }
      if (copied) {
        $('manual-copy').hidden = true;
        previousFocus?.focus({ preventScroll: true });
      }
    }
    $('copy-message').textContent = copied ? successMessage : 'Clipboard unavailable. Select and copy the text below, then paste into X chat.';
  }

  $('copy-id').addEventListener('click', () => {
    if (selected) void copyText(selected.id, `${selected.id} copied.`);
  });
  $('copy-feedback').addEventListener('click', () => {
    if (!selected) return;
    void copyText(`Motion: ${selected.id} — ${selected.title}\nKeep: \nChange: \nDiscard: `, 'Template copied. Fill it in and paste into X chat.');
  });
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => setFilter(button.dataset.filter));
  });
  player.addEventListener('error', () => { $('video-error').hidden = false; });
  window.addEventListener('hashchange', syncHash);
  window.addEventListener('popstate', syncHash);

  async function loadCatalog() {
    $('load-state').replaceChildren(node('span', '', 'Opening the collection…'));
    try {
      const response = await fetch('/catalog.json', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Catalog request failed');
      const catalog = await response.json();
      if (catalog.version !== 1 || !Array.isArray(catalog.motions)) throw new Error('Invalid catalog');
      const ids = new Set();
      motions = catalog.motions.filter((film) => {
        if (!validMotion(film) || ids.has(film.id)) return false;
        ids.add(film.id);
        return true;
      });
      if (!motions.length) {
        $('load-state').replaceChildren(node('p', '', 'The collection is quiet for now. New motion studies will appear here.'));
        return;
      }
      $('load-state').hidden = true;
      $('gallery').hidden = false;
      syncHash();
    } catch {
      const retry = node('button', 'button button-primary', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', loadCatalog);
      $('load-state').replaceChildren(node('p', '', 'The collection couldn’t be loaded. Please try again.'), retry);
    }
  }
  void loadCatalog();
})();
