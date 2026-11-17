// Pull the editor down while it is scrolled to the top to sync, like a list in a phone app (touch only; the Sync button still works).
// Touch events and not pointer events: the page has to cancel the browser's own pan to follow the finger, and a pointer stream is
// cut off (`pointercancel`) the moment the browser starts to pan. The distance and the thresholds are pure so they can be tested.

export const SLOP = 10; // px before the move decides between a pull and a scroll or a sideways drag
export const THRESHOLD = 48; // px of the shown pull (after the resistance) that arms it: letting go then syncs
export const MAX = 80; // px the indicator can be pulled to

// The finger moves twice as far as the indicator: a pull has weight, and a long one stops at MAX.
export const pullDistance = (dy: number) => Math.min(MAX, Math.max(0, dy) * 0.5);

type Handlers = {
  enabled: () => boolean;
  atTop: () => boolean; // the editor is scrolled to the top
  move: (distance: number, armed: boolean) => void;
  end: (armed: boolean) => void; // armed only when the touch ended while armed (a cancelled touch is never armed)
};

// Returns the cleanup function.
export function attachPullToRefresh(target: EventTarget, h: Handlers): () => void {
  let s: { x: number; y: number; on: boolean; armed: boolean } | null = null;
  const point = (e: Event) => (e as TouchEvent).touches?.[0];
  const onStart = (e: Event) => {
    const t = point(e);
    if ((e as TouchEvent).touches.length !== 1 || !t || !h.enabled() || !h.atTop()) return;
    s = { x: t.clientX, y: t.clientY, on: false, armed: false };
  };
  const onMove = (e: Event) => {
    const t = point(e);
    if (!s) return;
    if ((e as TouchEvent).touches.length !== 1 || !t) return void finish(false); // a second finger is a pinch, not a pull
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.on) {
      if (dy < -SLOP || Math.abs(dx) > SLOP) return void (s = null); // up is a scroll, sideways is the swipe or a selection
      if (dy < SLOP) return;
      if (!h.atTop()) return void (s = null);
      s.on = true;
    }
    if (e.cancelable) e.preventDefault(); // the browser must not also scroll or bounce
    const d = pullDistance(dy - SLOP);
    s.armed = d >= THRESHOLD;
    h.move(d, s.armed);
  };
  function finish(ended: boolean) {
    const cur = s;
    s = null;
    if (cur?.on) h.end(ended && cur.armed);
  }
  const onEnd = () => finish(true);
  const onCancel = () => finish(false);
  target.addEventListener("touchstart", onStart, { passive: true });
  target.addEventListener("touchmove", onMove, { passive: false });
  target.addEventListener("touchend", onEnd);
  target.addEventListener("touchcancel", onCancel);
  return () => {
    target.removeEventListener("touchstart", onStart);
    target.removeEventListener("touchmove", onMove);
    target.removeEventListener("touchend", onEnd);
    target.removeEventListener("touchcancel", onCancel);
  };
}
