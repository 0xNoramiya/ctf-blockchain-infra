import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { WebhookEmitter, SolveTracker } from "../webhook.js";

function listen(handler) {
  return new Promise(resolve => {
    const srv = http.createServer(handler);
    srv.listen(0, "127.0.0.1", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}

test("WebhookEmitter signs requests with HMAC-SHA256 when secret is set", async () => {
  const secret = "topsecret";
  let captured;
  const { srv, url } = await listen((req, res) => {
    let body = ""; req.on("data", c => body += c);
    req.on("end", () => {
      captured = { headers: req.headers, body };
      res.writeHead(200).end();
    });
  });
  try {
    const w = new WebhookEmitter({ url, secret });
    await w.fire("solve.first", { challenge: "ch01", player: "0x01", solved: true });
    const expected = crypto.createHmac("sha256", secret).update(captured.body).digest("hex");
    assert.equal(captured.headers["x-ctf-signature"], `sha256=${expected}`);
    const json = JSON.parse(captured.body);
    assert.equal(json.event, "solve.first");
    assert.equal(json.challenge, "ch01");
    assert.ok(typeof json.timestamp === "number");
  } finally { srv.close(); }
});

test("WebhookEmitter omits signature header when no secret", async () => {
  let captured;
  const { srv, url } = await listen((req, res) => {
    let body = ""; req.on("data", c => body += c);
    req.on("end", () => { captured = req.headers; res.writeHead(200).end(); });
  });
  try {
    const w = new WebhookEmitter({ url });
    await w.fire("test", {});
    assert.equal(captured["x-ctf-signature"], undefined);
  } finally { srv.close(); }
});

test("WebhookEmitter.enabled() reflects URL presence", () => {
  assert.equal(new WebhookEmitter({}).enabled(), false);
  assert.equal(new WebhookEmitter({ url: "http://x" }).enabled(), true);
});

test("SolveTracker fires solve.first only on null→true", async () => {
  const fired = [];
  const w = { enabled: () => true, fire: (event, p) => fired.push({ event, ...p }) };
  const t = new SolveTracker(w);
  t.observe("ch01", "0xabc", false);
  assert.equal(fired.length, 0, "first observation false doesn't fire");
  t.observe("ch01", "0xabc", true);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].event, "solve.flip");
});

test("SolveTracker fires solve.first when prior state is unseen", async () => {
  const fired = [];
  const w = { enabled: () => true, fire: (event, p) => fired.push({ event, ...p }) };
  const t = new SolveTracker(w);
  t.observe("ch01", "0xfresh", true);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].event, "solve.first");
  assert.equal(fired[0].previous, null);
});

test("SolveTracker fires solve.flip both directions", async () => {
  const fired = [];
  const w = { enabled: () => true, fire: (event, p) => fired.push({ event, ...p }) };
  const t = new SolveTracker(w);
  t.observe("ch", "0xa", true);                 // first
  t.observe("ch", "0xa", false);                // flip up→down
  t.observe("ch", "0xa", true);                 // flip down→up
  assert.deepEqual(fired.map(f => f.event), ["solve.first", "solve.flip", "solve.flip"]);
  assert.equal(fired[1].solved, false);
  assert.equal(fired[2].solved, true);
});

test("SolveTracker no-op when same state", () => {
  const fired = [];
  const w = { enabled: () => true, fire: (event, p) => fired.push({ event, ...p }) };
  const t = new SolveTracker(w);
  t.observe("ch", "0xa", false);
  t.observe("ch", "0xa", false);
  t.observe("ch", "0xa", false);
  assert.equal(fired.length, 0);
});
