// The launch images of the home-screen app on an iPhone (docs/pages.md, "Launch screen"). iOS shows one of them from the tap on the icon
// until the page first paints, and picks it by an exact media query on the screen's size and pixel ratio, so each phone size needs its
// own, in light and dark. scripts/startup-images.mjs draws them into frontend/web/; the web-app plugin in vite.config.ts links them.
// A size missing here just gets iOS's own blank launch screen. Portrait only: the app is used upright.

/** CSS pixels of the screen and its pixel ratio, with the phones that have it. */
export const IPHONE_SCREENS = [
  { width: 375, height: 667, ratio: 2 }, // SE (2nd, 3rd generation), 8
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12 mini, 13 mini
  { width: 390, height: 844, ratio: 3 }, // 12, 12 Pro, 13, 13 Pro, 14
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16, 16e
  { width: 402, height: 874, ratio: 3 }, // 16 Pro, 17, 17 Pro
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 420, height: 912, ratio: 3 }, // Air
  { width: 428, height: 926, ratio: 3 }, // 12 Pro Max, 13 Pro Max, 14 Plus
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max, 17 Pro Max
] as const;

export type Scheme = "light" | "dark";
export const SCHEMES: Scheme[] = ["light", "dark"];
type Screen = (typeof IPHONE_SCREENS)[number];

export const startupImageName = (s: Screen, scheme: Scheme) =>
  `startup-${s.width * s.ratio}x${s.height * s.ratio}-${s.ratio}x-${scheme}.png`;

export const startupImageMedia = (s: Screen, scheme: Scheme) =>
  `(device-width: ${s.width}px) and (device-height: ${s.height}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`;
