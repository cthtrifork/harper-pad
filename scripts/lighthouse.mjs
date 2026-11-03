// Writes summary.md and per-mode reports into argv[2]; exits 1 when a median of LIGHTHOUSE_RUNS (default 3) is below THRESHOLDS.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] || "lighthouse";
const url = process.env.LIGHTHOUSE_URL;
const version = process.env.LIGHTHOUSE_VERSION;
const runs = Number(process.env.LIGHTHOUSE_RUNS) || 3;
if (!url || !version) {
  console.error("LIGHTHOUSE_URL and LIGHTHOUSE_VERSION are required");
  process.exit(2);
}

const CATEGORIES = [
  ["performance", "Performance"],
  ["accessibility", "Accessibility"],
  ["best-practices", "Best Practices"],
  ["seo", "SEO"],
];
// Minimum median score (0-100) per category. First CI run measured: performance 67 (mobile) and 75
// (desktop), because the 20 MB harper wasm delays the editor (LCP), accessibility 91 (the editor has no
// accessible name; the green "ready" status text has low contrast), best practices and SEO 100. The
// thresholds sit just under that so they catch a regression; raise them as those are fixed.
const THRESHOLDS = { performance: 60, accessibility: 88, "best-practices": 95, seo: 95 };
const METRICS = [
  ["first-contentful-paint", "FCP"],
  ["largest-contentful-paint", "LCP"],
  ["total-blocking-time", "TBT"],
  ["cumulative-layout-shift", "CLS"],
  ["speed-index", "Speed Index"],
];
const MODES = { mobile: [], desktop: ["--preset=desktop"] };

const pkg = `lighthouse@${version}`;
mkdirSync(out, { recursive: true });
const npx = (...args) => execFileSync("npx", ["--yes", pkg, ...args], { stdio: ["ignore", "inherit", "inherit"] });
npx("--version"); // installs it once, so the runs below only measure the page

const score = (r, id) => Math.round((r.categories[id]?.score ?? 0) * 100);
const emoji = (n) => (n >= 90 ? "🟢" : n >= 50 ? "🟠" : "🔴"); // Lighthouse's own good/average/poor bands

const results = {};
for (const [mode, flags] of Object.entries(MODES)) {
  const all = [];
  for (let i = 1; i <= runs; i++) {
    const base = join(out, `${mode}-${i}`);
    npx(
      url,
      "--quiet",
      "--output=json",
      "--output=html",
      `--output-path=${base}`,
      `--only-categories=${CATEGORIES.map(([id]) => id).join(",")}`,
      "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
      ...flags,
    );
    all.push({ base, report: JSON.parse(readFileSync(`${base}.report.json`, "utf8")) });
  }
  // The run with the median performance score is the one kept as the report of this mode.
  all.sort((a, b) => score(a.report, "performance") - score(b.report, "performance"));
  const median = all[Math.floor(all.length / 2)];
  copyFileSync(`${median.base}.report.html`, join(out, `lighthouse-${mode}.html`));
  copyFileSync(`${median.base}.report.json`, join(out, `lighthouse-${mode}.json`));
  const med = (id) => {
    const s = all.map((x) => score(x.report, id)).sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  results[mode] = { median: median.report, scores: Object.fromEntries(CATEGORIES.map(([id]) => [id, med(id)])) };
}

const failures = [];
const lines = ["### Lighthouse", ""];
lines.push(`| | ${CATEGORIES.map(([, name]) => name).join(" | ")} |`);
lines.push(`|---|${CATEGORIES.map(() => ":-:").join("|")}|`);
for (const [mode, { scores }] of Object.entries(results)) {
  const cells = CATEGORIES.map(([id]) => {
    if (scores[id] < THRESHOLDS[id]) failures.push(`${mode} ${id}: ${scores[id]} < ${THRESHOLDS[id]}`);
    return `${emoji(scores[id])} ${scores[id]}`;
  });
  lines.push(`| ${mode[0].toUpperCase()}${mode.slice(1)} | ${cells.join(" | ")} |`);
}
lines.push("", "<details><summary>Metrics (median run)</summary>", "");
lines.push(`| | ${METRICS.map(([, name]) => name).join(" | ")} |`, `|---|${METRICS.map(() => ":-:").join("|")}|`);
for (const [mode, { median }] of Object.entries(results)) {
  lines.push(`| ${mode[0].toUpperCase()}${mode.slice(1)} | ${METRICS.map(([id]) => median.audits[id].displayValue).join(" | ")} |`);
}
lines.push("", "</details>", "");
lines.push(
  `Median of ${runs} runs on \`${version}\` against the headless build. Minimum scores: ` +
    CATEGORIES.map(([id, name]) => `${name} ${THRESHOLDS[id]}`).join(", ") +
    ". The full HTML reports are in the run's artifacts.",
);
if (failures.length) lines.push("", `**Below threshold:** ${failures.join("; ")}`);
writeFileSync(join(out, "summary.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
process.exit(failures.length ? 1 : 0);
