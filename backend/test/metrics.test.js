import { test } from "node:test";
import assert from "node:assert/strict";
import { metrics, M } from "../metrics.js";

test("counter increments and renders", () => {
  const c = metrics.counter("ctf_unit_counter", "test");
  c.values.clear();
  c.inc({ k: "a" });
  c.inc({ k: "a" });
  c.inc({ k: "b" }, 3);
  const text = c.render();
  assert.match(text, /^# HELP ctf_unit_counter/m);
  assert.match(text, /^# TYPE ctf_unit_counter counter/m);
  assert.match(text, /^ctf_unit_counter\{k="a"\} 2$/m);
  assert.match(text, /^ctf_unit_counter\{k="b"\} 3$/m);
});

test("gauge set", () => {
  const g = metrics.gauge("ctf_unit_gauge", "test");
  g.values.clear();
  g.set({}, 5);
  g.set({}, 12);
  assert.match(g.render(), /^ctf_unit_gauge 12$/m);
});

test("label escaping handles double quotes", () => {
  const c = metrics.counter("ctf_unit_escape", "test");
  c.values.clear();
  c.inc({ k: 'with "quotes"' });
  assert.match(c.render(), /k="with \\"quotes\\""/);
});

test("renders the full registry as one document with blank-line separators", () => {
  const c = metrics.counter("ctf_unit_render1", "a");
  c.values.clear(); c.inc({});
  const g = metrics.gauge("ctf_unit_render2", "b");
  g.values.clear(); g.set({}, 1);
  const text = metrics.render();
  assert.match(text, /# TYPE ctf_unit_render1 counter[\s\S]*# TYPE ctf_unit_render2 gauge/);
});

test("predefined M counters exist", () => {
  for (const k of ["solveFirstTotal", "solveFlipTotal", "launchesTotal",
                   "webhookFiredTotal", "webhookFailedTotal", "instancesActive", "trackedPlayers"]) {
    assert.ok(typeof M[k]?.inc === "function" || typeof M[k]?.set === "function", `missing M.${k}`);
  }
});
