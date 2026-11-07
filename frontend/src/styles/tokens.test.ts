import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The admin UI (backend/internal/admin) and the design cheatsheet (docs/) carry their own copy of the palette. They may have fewer tokens,
// or extra ones of their own (--bad-tint), but a colour both files define must be the same colour, so they cannot drift apart.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// { light: {--bg: "#f6f7f9", ...}, dark: {...} }. The dark block is the one inside @media (prefers-color-scheme: dark).
const colours = (css) => {
  const [light, dark = ""] = css.split("@media");
  const pick = (text) =>
    Object.fromEntries(
      [...text.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)].map(([, name, hex]) => [name, expand(hex.toLowerCase())]),
    );
  return { light: pick(light), dark: pick(dark) };
};

const expand = (hex) => (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex); // #fff is #ffffff

const app = colours(read("./tokens.css"));
const others = {
  "the admin UI": colours(read("../../../backend/internal/admin/web/static/tokens.css")),
  "the design cheatsheet": colours(read("../../../docs/design-cheatsheet.html")),
};

for (const [where, theirs] of Object.entries(others)) {
  for (const scheme of ["light", "dark"]) {
    test(`${where}: ${scheme} colours match the app's`, () => {
      const shared = Object.keys(theirs[scheme]).filter((name) => name in app[scheme]);
      assert.ok(shared.length >= 10, `only ${shared.length} shared ${scheme} tokens: has the parser stopped matching?`);
      for (const name of shared) {
        assert.equal(theirs[scheme][name], app[scheme][name], `${name} (${scheme}) differs between the app and ${where}`);
      }
    });
  }
}
