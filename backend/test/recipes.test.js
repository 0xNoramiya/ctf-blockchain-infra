import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES = path.resolve(__dirname, "..", "..", "examples");

function exampleDirs() {
  return fs.readdirSync(EXAMPLES, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(EXAMPLES, d.name, "foundry.toml")))
    .map(d => d.name);
}

test("examples/ has at least one example", () => {
  const dirs = exampleDirs();
  assert.ok(dirs.length > 0, "no examples discovered under examples/");
});

test("every example ships a .ctf-smoke.json", () => {
  const missing = [];
  for (const dir of exampleDirs()) {
    if (!fs.existsSync(path.join(EXAMPLES, dir, ".ctf-smoke.json"))) missing.push(dir);
  }
  assert.deepEqual(missing, [], `missing recipes: ${missing.join(", ")}`);
});

test("every recipe parses + declares spec + challengeId", () => {
  const ids = new Set();
  for (const dir of exampleDirs()) {
    const p = path.join(EXAMPLES, dir, ".ctf-smoke.json");
    let data;
    try { data = JSON.parse(fs.readFileSync(p, "utf8")); }
    catch (e) { assert.fail(`${p}: invalid JSON — ${e.message}`); }
    assert.equal(data.spec, "ctf-smoke/v1", `${p}: spec must be ctf-smoke/v1`);
    assert.ok(data.challengeId && /^[a-z0-9_-]{1,32}$/i.test(data.challengeId),
      `${p}: challengeId must match [a-z0-9_-]{1,32}`);
    assert.ok(!ids.has(data.challengeId),
      `${p}: challengeId ${data.challengeId} duplicates an earlier recipe`);
    ids.add(data.challengeId);
  }
});

test("every recipe also ships a solver script", () => {
  const missing = [];
  for (const dir of exampleDirs()) {
    const solver = path.join(EXAMPLES, dir, "solver", "solve.js");
    if (!fs.existsSync(solver)) missing.push(dir);
  }
  assert.deepEqual(missing, [], `recipes without solvers: ${missing.join(", ")}`);
});

test("fundTokens entries reference labels that also appear in fromInfo", () => {
  // Catches typo-class bugs where the recipe declares fundTokens on a
  // label that won't exist when ctf-admin reads /api/config.
  for (const dir of exampleDirs()) {
    const p = path.join(EXAMPLES, dir, ".ctf-smoke.json");
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!data.fundTokens) continue;
    const fromInfoLabels = new Set(Object.values(data.fromInfo ?? {}));
    for (const label of Object.keys(data.fundTokens)) {
      assert.ok(fromInfoLabels.has(label),
        `${p}: fundTokens label "${label}" is not declared in fromInfo`);
    }
  }
});
