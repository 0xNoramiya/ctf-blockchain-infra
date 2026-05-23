import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { mountAdmin } from "../admin.js";

function start(app) {
  return new Promise(resolve => {
    const srv = app.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  });
}
async function fetch_(url, opts) { return await fetch(url, opts); }

test("admin router responds 404 to every path when ADMIN_TOKEN is unset", async () => {
  delete process.env.ADMIN_TOKEN;
  const app = express();
  const stubs = {
    launcher: { allInstances: () => [], kill: async () => true },
    solveTracker: { state: new Map() },
    webhook: { enabled: () => false, fire: async () => {} },
    reloadManifest: async () => ({}),
    challenges: new Map(),
    M: null,
  };
  app.use("/api/admin", mountAdmin(stubs));
  const { srv, port } = await start(app);
  try {
    for (const p of ["/api/admin/instances", "/api/admin/solves", "/api/admin/challenges",
                     "/api/admin/manifest/reload"]) {
      const r = await fetch_(`http://127.0.0.1:${port}${p}`);
      assert.equal(r.status, 404, `${p} should 404 when token unset`);
    }
  } finally { srv.close(); }
});

test("admin router enforces bearer token", async () => {
  process.env.ADMIN_TOKEN = "supersecret";
  const app = express();
  app.use(express.json());
  const stubs = {
    launcher: { allInstances: () => [{ challengeId: "ch", player: "0xabc", instanceId: "deadbeef0000000000000000000000000000000000000000000000000000beef",
                                       mode: "proxy", rpcUrl: "http://x", target: "0xdef", createdAt: 0, expiresAt: 1 }] },
    solveTracker: { state: new Map() },
    webhook: { enabled: () => false, fire: async () => {} },
    reloadManifest: async () => ({ reloaded: true, added: [], removed: [], total: 0 }),
    challenges: new Map(),
    M: null,
  };
  app.use("/api/admin", mountAdmin(stubs));
  const { srv, port } = await start(app);
  try {
    const r0 = await fetch_(`http://127.0.0.1:${port}/api/admin/instances`);
    assert.equal(r0.status, 401);

    const r1 = await fetch_(`http://127.0.0.1:${port}/api/admin/instances`, {
      headers: { authorization: "Bearer wrong" },
    });
    assert.equal(r1.status, 401);

    const r2 = await fetch_(`http://127.0.0.1:${port}/api/admin/instances`, {
      headers: { authorization: "Bearer supersecret" },
    });
    assert.equal(r2.status, 200);
    const j = await r2.json();
    assert.equal(j.count, 1);
    assert.equal(j.instances[0].challengeId, "ch");
  } finally { srv.close(); delete process.env.ADMIN_TOKEN; }
});

test("admin reload endpoint relays reloadManifest()", async () => {
  process.env.ADMIN_TOKEN = "t";
  const app = express();
  app.use(express.json());
  const stubs = {
    launcher: { allInstances: () => [] },
    solveTracker: { state: new Map() },
    webhook: { enabled: () => false, fire: async () => {} },
    reloadManifest: async () => ({ reloaded: true, added: ["ch9"], removed: [], total: 1 }),
    challenges: new Map(),
    M: null,
  };
  app.use("/api/admin", mountAdmin(stubs));
  const { srv, port } = await start(app);
  try {
    const r = await fetch_(`http://127.0.0.1:${port}/api/admin/manifest/reload`, {
      method: "POST",
      headers: { authorization: "Bearer t" },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { reloaded: true, added: ["ch9"], removed: [], total: 1 });
  } finally { srv.close(); delete process.env.ADMIN_TOKEN; }
});
