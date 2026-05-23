import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WriteupStore } from "../writeups.js";

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "writeups-")); }

test("append writes one JSON line and increments file", () => {
  const dir = tmp();
  const store = new WriteupStore(path.join(dir, "writeups.jsonl"));
  const rec = store.append({
    challengeId: "ch01",
    player: "0xabc",
    writeup: "# how I did it\nflash loan -> exploit -> profit",
    ip: "203.0.113.1",
  });
  assert.equal(rec.challenge, "ch01");
  assert.equal(rec.player, "0xabc");
  assert.match(rec.ts, /^\d{4}-\d{2}-\d{2}T/);
  const lines = fs.readFileSync(store.filePath, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]).writeup, rec.writeup);
});

test("empty / non-string writeup rejected", () => {
  const store = new WriteupStore(path.join(tmp(), "w.jsonl"));
  assert.throws(() => store.append({ challengeId: "x", player: "0x1", writeup: "   " }));
  assert.throws(() => store.append({ challengeId: "x", player: "0x1", writeup: 42 }));
  assert.throws(() => store.append({ challengeId: "x", player: "0x1", writeup: null }));
});

test("writeup over max length rejected", () => {
  const store = new WriteupStore(path.join(tmp(), "w.jsonl"));
  const huge = "x".repeat(store.maxLen + 1);
  assert.throws(() => store.append({ challengeId: "x", player: "0x1", writeup: huge }));
});

test("all() returns records, optional filter", () => {
  const store = new WriteupStore(path.join(tmp(), "w.jsonl"));
  store.append({ challengeId: "a", player: "0x1", writeup: "alpha" });
  store.append({ challengeId: "b", player: "0x2", writeup: "beta"  });
  store.append({ challengeId: "a", player: "0x3", writeup: "gamma" });
  assert.equal(store.all().length, 3);
  const onlyA = store.all(r => r.challenge === "a");
  assert.equal(onlyA.length, 2);
  assert.deepEqual(onlyA.map(r => r.player).sort(), ["0x1", "0x3"]);
});

test("all() on missing file returns empty", () => {
  const store = new WriteupStore(path.join(tmp(), "never-existed.jsonl"));
  assert.deepEqual(store.all(), []);
});
