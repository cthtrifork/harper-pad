// Throwaway checks for docs/sync.md ("v1.1" device key and "v2" data key): can an iPhone Safari tab or an installed Home Screen
// app keep a non-extractable WebCrypto key in IndexedDB, sign with it, survive time and restarts, and run Argon2id?
// Own IndexedDB database (harper-pad-keytest) and localStorage keys (keytest.*): nothing of the real app is touched.
// Not for merging: it exists only to be published as a pull request preview.

const DB_NAME = "harper-pad-keytest";
const MESSAGE = new TextEncoder().encode("harper-pad key test");
const results = [];
const $ = (id) => document.getElementById(id);

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return `${s} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 129600) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} days`;
}

// --- Results ------------------------------------------------------------------------------------------------------------------

function add(status, name, detail = "") {
  results.push({ status, name, detail });
  render();
}
const pass = (name, detail) => add("pass", name, detail);
const fail = (name, detail) => add("fail", name, detail);
const warn = (name, detail) => add("warn", name, detail);
const info = (name, detail) => add("info", name, detail);

function render() {
  const body = $("results");
  body.replaceChildren();
  for (const r of results) {
    const row = document.createElement("tr");
    const badge = document.createElement("td");
    badge.className = `badge ${r.status}`;
    badge.textContent = r.status.toUpperCase();
    const text = document.createElement("td");
    const title = document.createElement("div");
    title.textContent = r.name;
    text.append(title);
    if (r.detail) {
      const small = document.createElement("small");
      small.textContent = r.detail;
      text.append(small);
    }
    row.append(badge, text);
    body.append(row);
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  $("summary").textContent = `${count("pass")} pass, ${count("fail")} fail, ${count("warn")} warn`;
  $("report").value = reportText();
}

function reportText() {
  const lines = [`Harper Pad key test, ${new Date().toISOString()}`, `Mode: ${mode()}`, `UA: ${navigator.userAgent}`, ""];
  for (const r of results) lines.push(`[${r.status.toUpperCase()}] ${r.name}${r.detail ? ` - ${r.detail}` : ""}`);
  lines.push("", ...historyLines);
  return lines.join("\n");
}

// --- IndexedDB ----------------------------------------------------------------------------------------------------------------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("keys", { keyPath: "id" });
      req.result.createObjectStore("meta", { keyPath: "id" });
      req.result.createObjectStore("log", { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
}

function request(db, store, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = run(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
const get = (db, store, key) => request(db, store, "readonly", (s) => s.get(key));
const put = (db, store, value) => request(db, store, "readwrite", (s) => s.put(value));
const del = (db, store, key) => request(db, store, "readwrite", (s) => s.delete(key));
const all = (db, store) => request(db, store, "readonly", (s) => s.getAll());

// --- Checks -------------------------------------------------------------------------------------------------------------------

function mode() {
  const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  return standalone ? "Home Screen app" : "browser tab";
}

function testEnvironment() {
  info("Running in", mode());
  info("Browser", navigator.userAgent);
  const needed = {
    "Secure context": window.isSecureContext,
    "crypto.subtle": Boolean(window.crypto?.subtle),
    IndexedDB: Boolean(window.indexedDB),
    "Web Workers": Boolean(window.Worker),
    WebAssembly: Boolean(window.WebAssembly),
  };
  for (const [name, ok] of Object.entries(needed)) {
    if (ok) pass(name, "available");
    else fail(name, "missing");
  }
  info("Web Locks", navigator.locks ? "available" : "missing (not needed by the design)");
}

// Two independent storage mechanisms: if one is wiped and the other survives, the page says so.
async function testMarkers(db) {
  const idb = await get(db, "meta", "first");
  const ls = localStorage.getItem("keytest.first");
  if (!idb && !ls) {
    const now = Date.now();
    await put(db, "meta", { id: "first", at: now });
    localStorage.setItem("keytest.first", String(now));
    info("First run in this storage", "markers written to IndexedDB and localStorage");
  } else if (idb && ls) {
    pass("Storage markers survived", `first run ${ago(idb.at)} ago`);
  } else if (ls) {
    warn("IndexedDB was cleared but localStorage survived", `first run ${ago(Number(ls))} ago`);
    await put(db, "meta", { id: "first", at: Number(ls) });
  } else {
    warn("localStorage was cleared but IndexedDB survived", `first run ${ago(idb.at)} ago`);
    localStorage.setItem("keytest.first", String(idb.at));
  }
}

async function testEcdsa(db) {
  let rec = await get(db, "keys", "device");
  if (!rec) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    pass("Generate an ECDSA P-256 key pair", `private key extractable=${pair.privateKey.extractable}`);
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    await put(db, "keys", { id: "device", privateKey: pair.privateKey, publicJwk, createdAt: Date.now() });
    pass("Store only the private CryptoKey in IndexedDB", "stored");
    rec = await get(db, "keys", "device");
    if (rec?.privateKey) pass("Read the key back in the same run", "found");
    else {
      fail("Read the key back in the same run", "not found");
      return;
    }
    // The design stores the private key alone; a CryptoKeyPair is expected to be rejected. Informational only.
    try {
      await put(db, "keys", { id: "pair-probe", pair });
      await del(db, "keys", "pair-probe");
      info("Storing a whole CryptoKeyPair", "was accepted (the design does not depend on it)");
    } catch (error) {
      info("Storing a whole CryptoKeyPair", `rejected as expected: ${error.name}`);
    }
  } else {
    pass("Key from an earlier run survived", `created ${ago(rec.createdAt)} ago (${new Date(rec.createdAt).toLocaleString()})`);
  }

  const key = rec.privateKey;
  if (!(key instanceof CryptoKey)) {
    fail("Loaded value is a CryptoKey", String(key));
    return;
  }
  if (key.extractable === false) pass("Loaded key is non-extractable", `${key.algorithm.name} ${key.algorithm.namedCurve}`);
  else fail("Loaded key is non-extractable", "extractable=true");
  try {
    await crypto.subtle.exportKey("jwk", key);
    fail("exportKey on the private key is refused", "it exported");
  } catch (error) {
    pass("exportKey on the private key is refused", error.name);
  }
  const t0 = performance.now();
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, MESSAGE));
  const ms = Math.round(performance.now() - t0);
  if (sig.length === 64) pass("Signature is raw r||s, 64 bytes", `signed in ${ms} ms`);
  else fail("Signature is raw r||s, 64 bytes", `${sig.length} bytes`);
  const pub = await crypto.subtle.importKey("jwk", rec.publicJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  const verify = (data, signature) => crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, signature, data);
  if (await verify(MESSAGE, sig)) pass("Signature verifies against the public key saved at the first run", "same key");
  else fail("Signature verifies against the public key saved at the first run", "does not verify: the key changed");
  const tampered = sig.slice();
  tampered[0] ^= 1;
  if (await verify(MESSAGE, tampered)) fail("A tampered signature is rejected", "it verified");
  else pass("A tampered signature is rejected", "rejected");
}

const deriveAes = (hkdfKey) =>
  crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("harper-pad"),
      info: new TextEncoder().encode("harper-pad doc 00000000000000000000000000000000"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

// v2: the data key is imported as non-extractable HKDF material, only that handle is stored, and a per-doc AES-GCM key is derived.
async function testDataKey(db) {
  let rec = await get(db, "keys", "dk");
  if (!rec) {
    const hkdf = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)), "HKDF", false, [
      "deriveKey",
      "deriveBits",
    ]);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, await deriveAes(hkdf), MESSAGE));
    await put(db, "keys", { id: "dk", key: hkdf, nonce: b64(nonce), ciphertext: b64(ciphertext), createdAt: Date.now() });
    pass("Import a data key as non-extractable HKDF material and store the handle", "stored");
    rec = await get(db, "keys", "dk");
    if (!rec?.key) {
      fail("Read the data key back in the same run", "not found");
      return;
    }
  } else {
    pass("Data key from an earlier run survived", `created ${ago(rec.createdAt)} ago`);
  }
  if (rec.key.extractable === false) pass("Loaded data key is non-extractable", rec.key.algorithm.name);
  else fail("Loaded data key is non-extractable", "extractable=true");
  const aes = await deriveAes(rec.key);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.nonce) }, aes, unb64(rec.ciphertext)));
  if (new TextDecoder().decode(plain) === new TextDecoder().decode(MESSAGE)) {
    pass("Derived AES-GCM key decrypts what the first run encrypted", "same key");
  } else {
    fail("Derived AES-GCM key decrypts what the first run encrypted", "wrong text");
  }
}

async function testPersistence() {
  if (!navigator.storage?.persist) {
    warn("navigator.storage.persist()", "not available");
    return;
  }
  const already = await navigator.storage.persisted();
  const granted = await navigator.storage.persist();
  const estimate = (await navigator.storage.estimate?.()) ?? {};
  const mb = (n) => (n == null ? "?" : `${(n / 1048576).toFixed(1)} MB`);
  const detail = `persisted before=${already}, persist() returned ${granted}, usage ${mb(estimate.usage)} of ${mb(estimate.quota)}`;
  if (granted) pass("Persistent storage", detail);
  else warn("Persistent storage", detail);
}

async function testPendingArgon(db) {
  const pending = await get(db, "meta", "argon-pending");
  if (!pending) return;
  warn(
    "An earlier Argon2id run did not finish",
    `${pending.memMiB} MiB, started ${ago(pending.at)} ago: the page was probably killed for memory`,
  );
  await del(db, "meta", "argon-pending");
}

async function runArgon2(db, memMiB) {
  const label = `Argon2id ${memMiB} MiB, 3 passes, 1 lane`;
  await put(db, "meta", { id: "argon-pending", memMiB, at: Date.now() });
  const answer = await new Promise((resolve) => {
    const worker = new Worker("key-test-worker.js");
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ ok: false, error: "no answer after 120 s" });
    }, 120000);
    const done = (value) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(value);
    };
    worker.onmessage = (event) => done(event.data);
    worker.onerror = (event) => done({ ok: false, error: event.message || "worker error" });
    worker.postMessage({ memKiB: memMiB * 1024, iterations: 3 });
  });
  await del(db, "meta", "argon-pending");
  if (answer.ok) pass(label, `${answer.ms} ms (hash ${answer.hash}...)`);
  else fail(label, answer.error);
  return answer.ok;
}

// --- History ------------------------------------------------------------------------------------------------------------------

let historyLines = [];

async function logAndShowHistory(db) {
  const count = (s) => results.filter((r) => r.status === s).length;
  await request(db, "log", "readwrite", (s) =>
    s.add({ t: Date.now(), mode: mode(), pass: count("pass"), fail: count("fail"), warn: count("warn") }),
  );
  const entries = (await all(db, "log")).reverse().slice(0, 15);
  historyLines = ["History (newest first):"];
  const list = $("history");
  list.replaceChildren();
  for (const e of entries) {
    const text = `${new Date(e.t).toLocaleString()} - ${e.mode} - ${e.pass} pass, ${e.fail} fail, ${e.warn} warn`;
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
    historyLines.push(text);
  }
  $("report").value = reportText();
}

// --- Page ---------------------------------------------------------------------------------------------------------------------

let dbPromise;

async function guarded(name, fn) {
  try {
    await fn();
  } catch (error) {
    fail(name, `${error.name}: ${error.message}`);
  }
}

async function runAll() {
  results.length = 0;
  render();
  let db;
  try {
    db = await (dbPromise ??= openDb());
  } catch (error) {
    fail("Open IndexedDB", `${error.name}: ${error.message}`);
    return;
  }
  await guarded("Environment", testEnvironment);
  await guarded("Storage markers", () => testMarkers(db));
  await guarded("ECDSA device key", () => testEcdsa(db));
  await guarded("Data key", () => testDataKey(db));
  await guarded("Persistent storage", testPersistence);
  await guarded("Earlier Argon2id run", () => testPendingArgon(db));
  await guarded("History", () => logAndShowHistory(db));
}

function setBusy(busy) {
  for (const id of ["run", "argon", "reset"]) $(id).disabled = busy;
}

$("run").addEventListener("click", async () => {
  setBusy(true);
  await runAll();
  setBusy(false);
});

$("argon").addEventListener("click", async () => {
  setBusy(true);
  const db = await dbPromise;
  for (const mem of [32, 64, 128]) {
    if (!(await runArgon2(db, mem))) break;
  }
  $("report").value = reportText();
  setBusy(false);
});

$("reset").addEventListener("click", async () => {
  if (!confirm("Delete the test key, the data key and the history, and start again?")) return;
  (await dbPromise)?.close();
  localStorage.removeItem("keytest.first");
  indexedDB.deleteDatabase(DB_NAME).onsuccess = () => location.reload();
});

$("copy").addEventListener("click", async () => {
  const text = $("report").value;
  try {
    await navigator.clipboard.writeText(text);
    $("copied").textContent = "Copied.";
  } catch {
    $("report").select();
    $("copied").textContent = "Select all and copy by hand.";
  }
});

runAll();
