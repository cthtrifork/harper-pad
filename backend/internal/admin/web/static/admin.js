// The only script of the admin UI besides htmx. No inline script is allowed by the Content-Security-Policy, so this file
// handles four things with delegated listeners: copying the enrollment URL, the expiry countdown, "last seen" in local time, and letting htmx swap
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
  // "Last seen" labels, the only place they are worded. Times travel as Unix milliseconds (UTC) and the page shows them in the browser's
  // time zone. The server sends the time (RFC 3339, UTC) and nothing else; without this script that is what shows.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const dayOf = (d) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
  const seen = (ms, now = new Date()) => {
    const t = new Date(ms);
    const d = now - t;
    const day = 864e5;
    if (d < 6e4) return 'just now';
    if (d < 36e5) return `${Math.floor(d / 6e4)} min ago`;
    if (d < day) return `${Math.floor(d / 36e5)} h ago`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const date = `${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`;
    const time = `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
    if (dayOf(yesterday) === dayOf(t)) return `Yesterday, ${time}`;
    if (d < 14 * day) return `${date}, ${time}`;
    return `${date} (${Math.floor(d / day)} days ago)`;
  };
  const tick = () => {
    for (const el of document.querySelectorAll('[data-expires]')) {
      el.textContent = fmt(Number(el.dataset.expires) - Date.now());
    }
    for (const el of document.querySelectorAll('[data-seen]')) {
      el.textContent = seen(Number(el.dataset.seen));
    }
  };
  setInterval(tick, 1000);
  document.addEventListener('htmx:afterSwap', tick);
  tick();
})();
