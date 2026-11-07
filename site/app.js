'use strict';
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canHover = matchMedia('(hover: hover) and (pointer: fine)');
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  const live = document.createElement('p');
  live.className = 'sr';
  live.setAttribute('aria-live', 'polite');
  document.body.append(live);

  // Copy buttons: prompt text, a literal value, or a raw Markdown file.
  async function copy(button) {
    let text;
    if (button.dataset.copyTarget) text = document.getElementById(button.dataset.copyTarget).textContent.trim();
    else if (button.dataset.copyText) text = button.dataset.copyText;
    else if (button.dataset.copyUrl) {
      const response = await fetch(button.dataset.copyUrl, { cache: 'no-cache' });
      if (!response.ok) throw new Error('Unavailable');
      text = await response.text();
    }
    await navigator.clipboard.writeText(text);
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy-target],[data-copy-text],[data-copy-url]');
    if (!button) return;
    const label = button.dataset.label || (button.dataset.label = button.textContent);
    try {
      await copy(button);
      button.dataset.state = 'done';
      if (!button.classList.contains('id')) button.textContent = 'Copied';
      live.textContent = 'Copied to clipboard';
    } catch {
      button.textContent = 'Copy failed';
      live.textContent = 'Copy failed';
    }
    clearTimeout(button.timer);
    button.timer = setTimeout(() => { button.textContent = label; delete button.dataset.state; }, 1600);
  });

  // Muted preview loops: never while reduced motion or data saver is on.
  const loops = [...document.querySelectorAll('video.loop')];
  const allowed = () => !reduced.matches && !saveData;
  const start = video => {
    if (!allowed()) return;
    if (video.preload !== 'auto') video.preload = 'auto';
    const attempt = video.play();
    if (attempt) attempt.catch(() => {});
  };
  const stop = video => { video.pause(); };
  for (const video of loops) video.addEventListener('playing', () => video.classList.add('playing'));
  const page = document.body.dataset.page;
  const inView = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) entry.isIntersecting ? start(entry.target) : stop(entry.target);
  }, { threshold: 0.35 }) : null;
  for (const video of loops) {
    const tile = video.closest('.tile');
    if (page === 'theme' && tile && canHover.matches) {
      tile.addEventListener('pointerenter', () => start(video));
      tile.addEventListener('pointerleave', () => stop(video));
      tile.addEventListener('focusin', () => start(video));
      tile.addEventListener('focusout', () => stop(video));
    } else if (inView) inView.observe(video);
  }
  reduced.addEventListener('change', () => { if (reduced.matches) loops.forEach(stop); });

  // Film pages: arrow keys step through the theme unless a control has focus.
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const active = document.activeElement;
    if (active && active.matches('video, input, textarea, select, [contenteditable]')) return;
    const link = document.querySelector(`.step[data-key="${event.key}"]`);
    if (link) link.click();
  });
})();
