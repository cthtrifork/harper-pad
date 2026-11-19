// A swipe from the left screen edge to the right opens the drafts drawer on a phone (touch only; the Drafts button still works). The
// drawer follows the finger and settles open or closed on release. It listens on a strip at the left edge (styles/edge-swipe.css,
// `touch-action: pan-y`), so it never competes with selecting text or scrolling a wide code block, and the move has to be mostly
// horizontal. The classifier and the release rule are pure functions so the thresholds can be tested without a browser.

export const SLOP = 10; // px before the move decides between a swipe and a vertical scroll
export const COMMIT_FRACTION = 1 / 3; // of the screen width: letting go past it opens the drawer, before it closes it again

export type Verdict = "wait" | "swipe" | "ignore";

export function classifySwipe(dx: number, dy: number): Verdict {
  if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return "wait";
  if (Math.abs(dy) >= Math.abs(dx) || dx < 0) return "ignore";
  return "swipe";
}

export function shouldOpen(dx: number, width: number): boolean {
  return dx >= width * COMMIT_FRACTION;
}

type Handlers = {
  enabled: () => boolean;
  start: () => void; // the move turned out to be a swipe: the drawer is put on screen, closed
  move: (dx: number) => void; // the finger's distance from where the swipe was recognised, never negative
  end: (dx: number, cancelled: boolean) => void;
  tap?: (x: number, y: number) => void; // a touch that never became a swipe or a scroll: the strip covers the text, so the tap is handed on
};

// Returns the cleanup function.
export function attachEdgeSwipe(target: EventTarget, h: Handlers): () => void {
  let s: { id: number; x: number; y: number; on: boolean; dx: number } | null = null;
  const onDown = (e: Event) => {
    const p = e as PointerEvent;
    if (p.pointerType !== "touch" || !p.isPrimary || !h.enabled()) return;
    s = { id: p.pointerId, x: p.clientX, y: p.clientY, on: false, dx: 0 };
  };
  const onMove = (e: Event) => {
    const p = e as PointerEvent;
    if (!s || p.pointerId !== s.id) return;
    const dx = p.clientX - s.x;
    if (!s.on) {
      const v = classifySwipe(dx, p.clientY - s.y);
      if (v === "wait") return;
      if (v === "ignore") return void (s = null);
      s.on = true;
      h.start();
    }
    s.dx = Math.max(0, dx - SLOP); // the first SLOP px only decided it was a swipe
    h.move(s.dx);
  };
  const finish = (cancelled: boolean) => {
    const cur = s;
    s = null;
    if (cur?.on) h.end(cur.dx, cancelled);
  };
  const onUp = (e: Event) => {
    const p = e as PointerEvent;
    // The strip sits over the left edge of the editor, so a plain tap on it would never reach the text to place the caret.
    if (s && !s.on && p.pointerId === s.id && Math.abs(p.clientX - s.x) < SLOP && Math.abs(p.clientY - s.y) < SLOP) {
      const { clientX, clientY } = p;
      s = null;
      h.tap?.(clientX, clientY);
      return;
    }
    finish(false);
  };
  const onCancel = () => finish(true);
  target.addEventListener("pointerdown", onDown, { passive: true });
  target.addEventListener("pointermove", onMove, { passive: true });
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onCancel);
  return () => {
    target.removeEventListener("pointerdown", onDown);
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onCancel);
  };
}
