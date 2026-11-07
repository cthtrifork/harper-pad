// Stands in for core.js in the desktop build (vite.config.js), which has no wasm: Go answers there, and the draft the Go side returns
// carries its title. webDrafts.js and main.js import core.js, so they need something to import; neither calls it on desktop.
export const summarize = async () => {
  throw new Error("the desktop build has no wasm core");
};
export const warmCore = async () => {};
