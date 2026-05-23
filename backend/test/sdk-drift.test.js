import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Ctf } from "../../sdk/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = path.join(__dirname, "..", "openapi.yaml");

// Player-facing paths (public + launcher tags) that the SDK is supposed
// to cover. Anything outside this list is intentionally not exposed via
// the SDK (admin/ops endpoints belong to ctf-admin / operator workflows).
const SDK_COVERED_PATHS = new Set([
  "/api/config",
  "/api/health",
  "/api/scoreboard",
  "/api/status/{id}",
  "/api/flag/{id}",
  "/api/sign/{id}",
  "/api/launch/{id}",
  "/api/kill/{id}",
  "/api/reset/{id}",
  "/api/instance/{id}",
  "/api/writeup/{id}",
]);

// Map each player-facing path to the SDK method that should hit it.
const SDK_METHOD_FOR = {
  "/api/config":       "config",
  "/api/health":       "health",
  "/api/scoreboard":   "scoreboard",
  "/api/status/{id}":  "getStatus",
  "/api/flag/{id}":    "claimFlag",
  "/api/sign/{id}":    "getSignature",
  "/api/launch/{id}":  "spawn",
  "/api/kill/{id}":    "kill",
  "/api/reset/{id}":   "reset",
  "/api/instance/{id}":"getInstance",
  "/api/writeup/{id}": "submitWriteup",
};

function parsePathsFromOpenapi(text) {
  // Hand-rolled extractor — avoids pulling in a YAML dep just for this.
  // Looks for top-level "paths:" then 2-space-indented `/foo:` entries.
  const out = [];
  const lines = text.split("\n");
  let inPaths = false;
  for (const line of lines) {
    if (line.startsWith("paths:")) { inPaths = true; continue; }
    if (inPaths && /^[A-Za-z_]/.test(line)) break;
    if (!inPaths) continue;
    const m = line.match(/^ {2}(\/[^:]+):/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

const openapiText = fs.readFileSync(OPENAPI_PATH, "utf8");
const documentedPaths = parsePathsFromOpenapi(openapiText);

test("OpenAPI parser found the expected number of paths", () => {
  // Sanity check on the parser itself.
  assert.ok(documentedPaths.length >= 12,
    `expected ≥12 documented paths, found ${documentedPaths.length}`);
});

test("every SDK-covered path is documented in openapi.yaml", () => {
  for (const p of SDK_COVERED_PATHS) {
    assert.ok(documentedPaths.includes(p),
      `${p} is in SDK_COVERED_PATHS but not in openapi.yaml`);
  }
});

test("every SDK-covered path has a corresponding SDK method", () => {
  const ctf = new Ctf({ backend: "http://x", challenge: "test", player: "0x" + "0".repeat(40) });
  for (const path of SDK_COVERED_PATHS) {
    const method = SDK_METHOD_FOR[path];
    assert.ok(method, `${path} missing entry in SDK_METHOD_FOR`);
    assert.equal(typeof ctf[method], "function",
      `SDK missing method ${method} for ${path}`);
  }
});

test("no documented public/launcher path is missing from the SDK", () => {
  // Detect new endpoints that get added to OpenAPI but forgotten in the SDK.
  // We special-case the admin paths and the openapi.yaml self-reference.
  const adminPrefix = "/api/admin";
  const opsExempt   = new Set(["/api/openapi.yaml", "/metrics"]);

  for (const path of documentedPaths) {
    if (path.startsWith(adminPrefix)) continue;
    if (opsExempt.has(path)) continue;
    // The /api/rpc/{instanceId} path is intentionally not in the SDK —
    // players point ethers.JsonRpcProvider at the rpcUrl returned by spawn().
    if (path.startsWith("/api/rpc/")) continue;
    // The /api/writeup/limits sub-path is informational; not surfaced as
    // a dedicated SDK method (writeup() reads it implicitly via the
    // request flow if needed).
    if (path === "/api/writeup/limits") continue;
    assert.ok(SDK_COVERED_PATHS.has(path),
      `${path} is documented but not covered by the SDK — add to SDK_COVERED_PATHS or exempt explicitly`);
  }
});
