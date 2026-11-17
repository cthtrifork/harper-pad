// A swipe from the left screen edge to the right opens the drafts drawer on a phone (touch only; the Drafts button still works).
// It listens on a strip at the left edge (styles/edge-swipe.css, `touch-action: pan-y`), so it never competes with selecting text or
// scrolling a wide code block, and the move has to be mostly horizontal. The classifier is a pure function so the thresholds can be tested without a browser.

export const OPEN_DISTANCE = 56; // px of rightward travel that opens the drawer
export const SLOP = 10; // px before the move decides between a swipe and a vertical scroll

export type Verdict = "wait" | "swipe" | "ignore";

export function classifySwipe(dx: number, dy: number): Verdict {
  if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return "wait";
  if (Math.abs(dy) >= Math.abs(dx) || dx < 0) return "ignore";
  return "swipe";
}

// Calls open() once when a touch that began at the left edge has travelled OPEN_DISTANCE to the right. Returns the cleanup function.
export function attachEdgeSwipe(target: EventTarget, opts: { enabled: () => boolean; open: () => void }): () => void {
  let start: { id: number; x: number; y: number; decided: boolean } | null = null;
  const onDown = (e: Event) => {
    const p = e as PointerEvent;
    if (p.pointerType !== "touch" || !p.isPrimary || !opts.enabled()) return;
    start = { id: p.pointerId, x: p.clientX, y: p.clientY, decided: false };
  };
  const onMove = (e: Event) => {
    const p = e as PointerEvent;
    if (!start || p.pointerId !== start.id) return;
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (!start.decided) {
      const v = classifySwipe(dx, dy);
      if (v === "wait") return;
      if (v === "ignore") return void (start = null);
      start.decided = true;
    }
    if (dx >= OPEN_DISTANCE) {
      start = null;
      opts.open();
    }
  };
  const onEnd = () => {
    start = null;
  };
  target.addEventListener("pointerdown", onDown, { passive: true });
  target.addEventListener("pointermove", onMove, { passive: true });
  target.addEventListener("pointerup", onEnd);
  target.addEventListener("pointercancel", onEnd);
  return () => {
    target.removeEventListener("pointerdown", onDown);
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onEnd);
    target.removeEventListener("pointercancel", onEnd);
  };
}
