import { test } from "node:test";
import assert from "node:assert/strict";
import { drain } from "../drain.js";

test("drain defaults to off", () => {
  drain.disable();
  const s = drain.state();
  assert.equal(s.on, false);
  assert.equal(s.reason, null);
  assert.equal(s.since, null);
});

test("enable sets reason and timestamp", () => {
  drain.disable();
  drain.enable("maintenance window 04:00 UTC");
  const s = drain.state();
  assert.equal(s.on, true);
  assert.equal(s.reason, "maintenance window 04:00 UTC");
  assert.ok(typeof s.since === "number" && s.since > 1_700_000_000);
});

test("disable clears the reason", () => {
  drain.enable("anything");
  drain.disable();
  const s = drain.state();
  assert.equal(s.on, false);
  assert.equal(s.reason, null);
});

test("enable with no reason is allowed", () => {
  drain.disable();
  drain.enable();
  assert.equal(drain.state().reason, null);
  assert.equal(drain.state().on, true);
  drain.disable();
});
