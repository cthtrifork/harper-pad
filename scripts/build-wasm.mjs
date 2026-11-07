// Compiles internal/core to frontend/src/wasm/core.wasm (cmd/core-wasm, docs/wasm-core.md). The npm `build:web` and `test`
// scripts run it first, so a build or a test run always has the module. It does nothing when the module is newer than its Go.
//
// The compiler is TinyGo (a module a third the size of standard Go's) in its container image, run by podman, so nothing needs
// installing. Its build cache lives in the user's cache directory, so only the first build is slow (about 80 s).
// Only the web build uses the module (desktop gets the same answers from Go), so only `build:web`, `test` and the Pages and preview
// workflows need podman.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Renovate keeps the tag and its digest current (.github/renovate.json5, "renovate-tinygo").
// renovate-tinygo
const TINYGO_IMAGE = "docker.io/tinygo/tinygo:0.44.0@sha256:7998bda3b044521b650a6a671229712b13f59a29ae373c60669907122e8d42f7";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "frontend", "src", "wasm", "core.wasm");
const pkg = "./cmd/core-wasm";

// The files the module is made from: the non-test Go files of both packages, go.mod and this script (a new flag or image).
const sources = [path.join(root, "go.mod"), fileURLToPath(import.meta.url)];
for (const dir of ["internal/core", "cmd/core-wasm"]) {
  for (const name of readdirSync(path.join(root, dir))) {
    if (name.endsWith(".go") && !name.endsWith("_test.go")) sources.push(path.join(root, dir, name));
  }
}
if (existsSync(out) && sources.every((f) => statSync(f).mtimeMs <= statSync(out).mtimeMs)) process.exit(0);
mkdirSync(path.dirname(out), { recursive: true });

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
  if (r.error || r.status !== 0) {
    console.error(`build-wasm: ${cmd} failed${r.error ? `: ${r.error.message}` : ""}`);
    process.exit(r.status || 1);
  }
};

if (spawnSync("podman", ["--version"], { stdio: "ignore" }).error) {
  console.error("build-wasm: needs podman on PATH");
  process.exit(1);
}
const cache = path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache"), "harper-pad-tinygo");
mkdirSync(cache, { recursive: true });
run("podman", [
  // The container user must be the caller, or it cannot write the output or the cache; keep-id maps the ids so the files stay the caller's.
  "run", "--rm", "--userns=keep-id", "--user", `${process.getuid()}:${process.getgid()}`,
  "-v", `${root}:/src:Z`, "-v", `${cache}:/cache:Z`, "-w", "/src",
  "-e", "HOME=/tmp", "-e", "XDG_CACHE_HOME=/cache",
  TINYGO_IMAGE, "tinygo", "build", "-target=wasip1", "-buildmode=c-shared", "-no-debug", "-o", `/src/${path.relative(root, out).split(path.sep).join("/")}`, pkg,
]);
