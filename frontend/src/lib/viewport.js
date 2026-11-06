// The on-screen keyboard on an iPhone. Safari does not shrink the page when the keyboard opens: the layout viewport keeps its height
// and only the *visual* viewport gets shorter, so a bottom bar (the status bar) or the scratch pad's end lands behind the keyboard,
// and Safari scrolls the whole page to show the caret, pushing the header out of sight. `interactive-widget` (the Chrome fix) is not
// supported there. So the app height follows the visual viewport while the keyboard is up, and the page is kept scrolled to the top.

// More than this much missing height is the keyboard, not the browser's toolbar growing or shrinking (about 80 px at most).
const KEYBOARD_MIN = 120;

// How much of the layout viewport the keyboard covers: {open, height}. `top` is how far Safari has scrolled the visual viewport down
// inside the layout one.
export function keyboardState({ layoutHeight, height, top = 0 }) {
  const covered = Math.round(layoutHeight - height - top);
  return covered >= KEYBOARD_MIN ? { open: true, height: covered } : { open: false, height: 0 };
}

// Keeps --vvh (the height the app should have) and the `keyboard` class on <html> up to date, and calls `onChange(open)` when the keyboard
// opens or closes. Returns a function that stops it. Does nothing in a browser without visualViewport. CSS uses --vvh only while
// `keyboard` is set (styles/safe-area.css), so everywhere else 100dvh keeps ruling.
export function trackKeyboard({ root = document.documentElement, win = window, onChange = () => {} } = {}) {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  let open = false;
  const update = () => {
    const k = keyboardState({ layoutHeight: win.innerHeight, height: vv.height, top: vv.offsetTop });
    if (k.open) {
      root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      // Safari scrolled the layout viewport to bring the caret into view; the app now fits the visual viewport, so put it back.
      if (vv.offsetTop > 0) win.scrollTo(0, 0);
    } else root.style.removeProperty("--vvh");
    root.classList.toggle("keyboard", k.open);
    if (k.open !== open) {
      open = k.open;
      onChange(open);
    }
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
  return () => {
    vv.removeEventListener("resize", update);
    vv.removeEventListener("scroll", update);
    root.style.removeProperty("--vvh");
    root.classList.remove("keyboard");
  };
}
