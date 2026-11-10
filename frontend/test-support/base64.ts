import { Buffer } from "node:buffer";

// Node 22 lacks Uint8Array.toBase64(); the supported browser runtimes provide it natively.
if (typeof Uint8Array.prototype.toBase64 !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toBase64", {
    value(this: Uint8Array) {
      return Buffer.from(this).toString("base64");
    },
  });
}
