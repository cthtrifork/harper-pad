// Loaded by `npm test` (node --import): the tests have no network, so the compiled Go module is read from disk. `npm run wasm` builds it.
import { readFileSync } from "node:fs";
import { useCoreBytes } from "./lib/core.js";

useCoreBytes(readFileSync(new URL("./wasm/core.wasm", import.meta.url)));
