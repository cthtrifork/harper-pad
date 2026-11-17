import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { IPHONE_SCREENS, SCHEMES, startupImageMedia, startupImageName } from "./startupImages.ts";

test("a launch image is named by its pixels, and found by the screen it is for", () => {
  const s = { width: 393, height: 852, ratio: 3 } as const;
  assert.equal(startupImageName(s, "dark"), "startup-1179x2556-3x-dark.png");
  assert.equal(
    startupImageMedia(s, "light"),
    "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)",
  );
});

test("no two launch images answer the same query", () => {
  const all = IPHONE_SCREENS.flatMap((s) => SCHEMES.map((c) => startupImageMedia(s, c)));
  assert.equal(new Set(all).size, all.length);
});

test("every launch image the page links is in web/", () => {
  for (const s of IPHONE_SCREENS) {
    for (const c of SCHEMES) assert.ok(existsSync(new URL(`../../web/${startupImageName(s, c)}`, import.meta.url)), startupImageName(s, c));
  }
});
