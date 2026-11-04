// The only script of the admin UI besides htmx. No inline script is allowed by the Content-Security-Policy, so this file
// handles three things with delegated listeners: copying the enrollment URL, the expiry countdown, and letting htmx swap
// error responses (the server sends them as small fragments with the right HX-Retarget).
(() => {
  'use strict';

  document.addEventListener('htmx:beforeSwap', (e) => {
    if (e.detail.xhr.status >= 400) {
      e.detail.shouldSwap = true;
      e.detail.isError = false;
    }
  });

  document.addEventListener('htmx:sendError', () => {
    const flash = document.getElementById('flash');
    if (flash) flash.textContent = 'Could not reach the admin service. Check the connection and try again.';
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-copy]') : null;
    if (!btn) return;
    const src = document.getElementById(btn.dataset.copy);
    const label = btn.querySelector('span');
    if (!src || !label) return;
    try {
      await navigator.clipboard.writeText(src.textContent.trim());
      label.textContent = 'Copied';
    } catch {
      // No clipboard permission (or no HTTPS): select the text so Ctrl+C works.
      const range = document.createRange();
      range.selectNodeContents(src);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      label.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { label.textContent = 'Copy'; }, 2000);
  });

  const fmt = (ms) => {
    if (ms <= 0) return 'expired';
    const s = Math.floor(ms / 1000);
    return `in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  setInterval(() => {
    for (const el of document.querySelectorAll('[data-expires]')) {
      el.textContent = fmt(Number(el.dataset.expires) - Date.now());
    }
  }, 1000);
})();
