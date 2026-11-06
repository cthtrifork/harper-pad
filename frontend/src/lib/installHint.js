// Offering to install the web app, once. Android and desktop Chromium fire `beforeinstallprompt`, which gives a real Install button. An
// iPhone has no such event: the only way is Safari's Share menu, so the hint says where it is. Neither is shown on the first visit, to a
// person who has already installed it, or again after it was shown once.
const KEY = "harper-pad.install";
const MIN_VISITS = 2;

export const isIOS = ({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) =>
  /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1); // an iPad asks for the desktop site

const read = (storage) => {
  try {
    return JSON.parse(storage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
};
const write = (storage, state) => {
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {} // private mode or full: the hint just comes back next time
};

// What to offer now: "install" (a prompt can be shown), "ios" (explain the Share menu) or null.
export function hintKind({ ios, standalone, visits, shown, deferred }) {
  if (standalone || shown || visits < MIN_VISITS) return null;
  if (deferred) return "install";
  return ios ? "ios" : null;
}

export const MESSAGES = {
  ios: { text: "Install: tap Share, then Add to Home Screen. It starts empty, so Back up here and Restore there.", action: "Got it" },
  install: { text: "Install Harper Pad as an app.", action: "Install" },
};

// Counts this visit and listens for the install prompt. `show({kind, text, action})` is called when a hint is due (once the page asks:
// `ready()`); the returned `accept()` runs the prompt for "install" and `done()` marks the hint as shown. `env` is injectable for tests.
export function watchInstall({ show, env = {} }) {
  const win = env.win ?? window;
  const storage = env.storage ?? win.localStorage;
  const nav = env.navigator ?? win.navigator;
  const standalone = () => !!nav.standalone || !!win.matchMedia?.("(display-mode: standalone)").matches;
  const state = read(storage);
  state.visits = (state.visits ?? 0) + 1;
  write(storage, state);
  let deferred = null;
  win.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep the event for our own button
    deferred = e;
  });
  win.addEventListener("appinstalled", () => {
    deferred = null;
    done();
  });
  function done() {
    state.shown = true;
    write(storage, state);
  }
  return {
    // Call when the page is settled (the editor is ready); shows the hint if one is due.
    ready() {
      const kind = hintKind({ ios: isIOS(nav), standalone: standalone(), visits: state.visits, shown: state.shown, deferred: !!deferred });
      if (kind) {
        done();
        show({ kind, ...MESSAGES[kind] });
      }
    },
    async accept() {
      if (!deferred) return;
      const e = deferred;
      deferred = null;
      await e.prompt();
    },
  };
}
