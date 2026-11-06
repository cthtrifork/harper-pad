import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The admin UI (backend/internal/admin) has its own stylesheet, so it carries its own copy of the palette. It may have fewer tokens, or
// extra ones of its own (--bad-tint), but a colour both files define must be the same colour, so the two UIs cannot drift apart.
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
const admin = colours(read("../../../backend/internal/admin/web/static/tokens.css"));

for (const scheme of ["light", "dark"]) {
  test(`admin ${scheme} colours match the app's`, () => {
    const shared = Object.keys(admin[scheme]).filter((name) => name in app[scheme]);
    assert.ok(shared.length >= 10, `only ${shared.length} shared ${scheme} tokens: has the parser stopped matching?`);
    for (const name of shared) {
      assert.equal(admin[scheme][name], app[scheme][name], `${name} (${scheme}) differs between the app and the admin UI`);
    }
  });
}
