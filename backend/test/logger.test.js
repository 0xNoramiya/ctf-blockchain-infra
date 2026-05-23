import { test } from "node:test";
import assert from "node:assert/strict";
import { safePath, statusToLevel } from "../logger.js";

test("safePath redacts ?address query params", () => {
  const u = "/api/status/ch01?address=0xAbC1234567890abcDEF1234567890ABCdef123456&other=keep";
  const out = safePath(u);
  assert.match(out, /^\/api\/status\/ch01\?/);
  assert.match(out, /address=0xAbC1.*3456/);
  assert.match(out, /\.{3}/);
  assert.match(out, /other=keep/);
});

test("safePath leaves unrelated paths untouched", () => {
  assert.equal(safePath("/api/health"), "/api/health");
  assert.equal(safePath("/metrics"), "/metrics");
});

test("safePath accepts an Express-shaped req object", () => {
  const req = { originalUrl: "/api/flag/ch01?address=0xCAFEBABE", url: "/api/flag/ch01" };
  assert.match(safePath(req), /address=0xCAFE/);
});

test("statusToLevel maps HTTP statuses to log levels", () => {
  assert.equal(statusToLevel(200), "info");
  assert.equal(statusToLevel(204), "info");
  assert.equal(statusToLevel(301), "info");
  assert.equal(statusToLevel(400), "warn");
  assert.equal(statusToLevel(404), "warn");
  assert.equal(statusToLevel(429), "warn");
  assert.equal(statusToLevel(500), "error");
  assert.equal(statusToLevel(502), "error");
  assert.equal(statusToLevel(503), "error");
});
