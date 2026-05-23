import { test } from "node:test";
import assert from "node:assert/strict";
import { SolveTracker } from "../webhook.js";

function silentEmitter() {
  return { enabled: () => false, fire: async () => {} };
}

test("scoreboard() starts empty", () => {
  const t = new SolveTracker(silentEmitter());
  assert.deepEqual(t.scoreboard(), {});
});

test("scoreboard() records solve.first with timestamps", () => {
  const t = new SolveTracker(silentEmitter());
  t.observe("ch01", "0xabc", true);
  t.observe("ch01", "0xdef", true);
  const b = t.scoreboard();
  assert.equal(b.ch01.solveCount, 2);
  assert.equal(b.ch01.currentlySolved, 2);
  assert.ok(b.ch01.firstBlood);
  assert.equal(typeof b.ch01.firstBlood.ts, "number");
  assert.equal(b.ch01.solves.length, 2);
});

test("scoreboard() preserves firstBlood across flips", async () => {
  const t = new SolveTracker(silentEmitter());
  t.observe("koth", "0xalice", true);
  const firstBlood1 = t.scoreboard().koth.firstBlood;
  await new Promise(r => setTimeout(r, 2));
  t.observe("koth", "0xalice", false);       // dethroned
  t.observe("koth", "0xbob", true);          // bob takes throne
  const board = t.scoreboard();
  assert.equal(board.koth.currentlySolved, 1, "only bob is currently solved");
  assert.equal(board.koth.solveCount, 2, "alice + bob in total");
  // First blood stays with alice since her solvedAt is earlier.
  assert.equal(board.koth.firstBlood.player.toLowerCase(), "0xalice");
  assert.equal(board.koth.firstBlood.ts, firstBlood1.ts);
});

test("never-solved observations don't appear on the board", () => {
  const t = new SolveTracker(silentEmitter());
  t.observe("ch", "0x1", false);
  t.observe("ch", "0x2", false);
  assert.deepEqual(t.scoreboard(), {});
});

test("re-solve after flip keeps original solvedAt", async () => {
  const t = new SolveTracker(silentEmitter());
  t.observe("ch", "0xa", true);
  const ts1 = t.scoreboard().ch.firstBlood.ts;
  await new Promise(r => setTimeout(r, 5));
  t.observe("ch", "0xa", false);
  await new Promise(r => setTimeout(r, 5));
  t.observe("ch", "0xa", true);
  assert.equal(t.scoreboard().ch.firstBlood.ts, ts1, "ts must not regress on re-solve");
});
