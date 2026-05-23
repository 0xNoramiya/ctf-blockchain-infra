import express from "express";
import { drain } from "./drain.js";

export function mountAdmin({ launcher, solveTracker, webhook, reloadManifest, challenges, M, writeups }) {
  const router = express.Router();
  const TOKEN = process.env.ADMIN_TOKEN;

  if (!TOKEN) {
    router.use((_req, res) => res.status(404).end());
    return router;
  }

  router.use((req, res, next) => {
    const h = req.headers.authorization;
    if (!h || !h.startsWith("Bearer ") || h.slice(7) !== TOKEN) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  });

  router.get("/instances", (_req, res) => {
    const out = [];
    for (const inst of launcher.allInstances?.() ?? []) {
      out.push({
        challengeId: inst.challengeId,
        player: inst.player,
        instanceId: inst.instanceId.slice(0, 16),
        mode: inst.mode,
        rpcUrl: inst.rpcUrl,
        target: inst.target,
        createdAt: inst.createdAt,
        expiresAt: inst.expiresAt,
      });
    }
    res.json({ count: out.length, instances: out });
  });

  router.post("/instances/:challengeId/:player/kill", async (req, res) => {
    const killed = await launcher.kill(req.params.challengeId, req.params.player);
    res.json({ killed });
  });

  router.post("/instances/kill-all", async (_req, res) => {
    const ids = [...(launcher.allInstances?.() ?? [])].map(i => [i.challengeId, i.player]);
    let n = 0;
    for (const [c, p] of ids) {
      if (await launcher.kill(c, p)) n++;
    }
    res.json({ killed: n });
  });

  router.get("/solves", (_req, res) => {
    const out = [];
    for (const [key, info] of solveTracker.state) {
      const [challengeId, player] = key.split(":");
      out.push({ challengeId, player, solved: info.solved, lastSeen: Math.floor(info.lastSeen / 1000) });
    }
    res.json({ count: out.length, solves: out });
  });

  router.post("/manifest/reload", async (_req, res) => {
    try {
      const result = await reloadManifest();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/webhook/test", async (req, res) => {
    if (!webhook.enabled()) return res.status(400).json({ error: "webhook not configured" });
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    await webhook.fire(payload.event ?? "test", {
      challenge: payload.challenge ?? "test",
      player: payload.player ?? "0x0000000000000000000000000000000000000000",
      solved: !!payload.solved,
      previous: payload.previous ?? null,
      synthetic: true,
    });
    if (M) M.webhookFiredTotal.inc({ event: payload.event ?? "test" });
    res.json({ sent: true });
  });

  router.get("/drain", (_req, res) => res.json(drain.state()));
  router.post("/drain/on", (req, res) => {
    const reason = req.body?.reason ?? req.query.reason ?? null;
    drain.enable(reason);
    res.json(drain.state());
  });
  router.post("/drain/off", (_req, res) => {
    drain.disable();
    res.json(drain.state());
  });

  router.get("/challenges", (_req, res) => {
    const out = [];
    for (const [id, ch] of challenges) {
      out.push({
        id,
        mode: ch.config.mode,
        target: ch.config.target ?? null,
        image: ch.config.image ?? null,
        signerEnabled: !!ch.signerWallet,
        signerAddress: ch.signerWallet?.address ?? null,
      });
    }
    res.json({ count: out.length, challenges: out });
  });

  router.get("/writeups", (req, res) => {
    if (!writeups) return res.json({ count: 0, writeups: [] });
    const cid = req.query.challenge;
    const filter = cid ? (r => r.challenge === cid) : null;
    const all = writeups.all(filter);
    res.json({ count: all.length, writeups: all });
  });

  return router;
}
