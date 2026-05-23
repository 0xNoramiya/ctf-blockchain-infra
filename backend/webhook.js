import crypto from "node:crypto";
import { M } from "./metrics.js";

const FORGET_AFTER_MS = Number(process.env.WEBHOOK_FORGET_AFTER_MS ?? 30 * 60 * 1000);
const POLL_INTERVAL_MS = Number(process.env.WEBHOOK_POLL_INTERVAL_MS ?? 30_000);
const FETCH_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS ?? 5_000);

export class WebhookEmitter {
  constructor({ url, secret, headers = {} }) {
    this.url = url ?? null;
    this.secret = secret ?? null;
    this.extraHeaders = headers;
  }

  enabled() {
    return !!this.url;
  }

  async fire(event, payload) {
    if (!this.url) return;
    const body = JSON.stringify({
      event,
      timestamp: Math.floor(Date.now() / 1000),
      ...payload,
    });
    const headers = { "content-type": "application/json", ...this.extraHeaders };
    if (this.secret) {
      const sig = crypto.createHmac("sha256", this.secret).update(body).digest("hex");
      headers["x-ctf-signature"] = `sha256=${sig}`;
    }
    M.webhookFiredTotal.inc({ event });
    try {
      const r = await fetch(this.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!r.ok) {
        console.warn(`webhook ${event}: HTTP ${r.status}`);
        M.webhookFailedTotal.inc({ event });
      }
    } catch (e) {
      console.warn(`webhook ${event}: ${e.message ?? e}`);
      M.webhookFailedTotal.inc({ event });
    }
  }
}

export class SolveTracker {
  constructor(emitter, { intervalMs = POLL_INTERVAL_MS, forgetAfterMs = FORGET_AFTER_MS } = {}) {
    this.emitter = emitter;
    this.intervalMs = intervalMs;
    this.forgetAfterMs = forgetAfterMs;
    this.state = new Map();
    this.timer = null;
    this.checkFn = null;
  }

  _key(challengeId, player) {
    return `${challengeId}:${player.toLowerCase()}`;
  }

  start(checkFn) {
    this.checkFn = checkFn;
    if (!this.emitter.enabled()) return;
    this.timer = setInterval(() => this._poll().catch(() => {}), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  observe(challengeId, player, solved) {
    const key = this._key(challengeId, player);
    const prev = this.state.get(key);
    const now = Date.now();

    const next = { solved, lastSeen: now };
    if (prev?.solvedAt) next.solvedAt = prev.solvedAt;
    else if (solved)   next.solvedAt = now;
    this.state.set(key, next);

    if (!this.emitter.enabled()) return;
    if (prev == null) {
      if (solved) {
        M.solveFirstTotal.inc({ challenge: challengeId });
        this.emitter.fire("solve.first", {
          challenge: challengeId, player, solved: true, previous: null,
        });
      }
      return;
    }
    if (prev.solved !== solved) {
      M.solveFlipTotal.inc({
        challenge: challengeId,
        direction: solved ? "up" : "down",
      });
      this.emitter.fire("solve.flip", {
        challenge: challengeId, player, solved, previous: prev.solved,
      });
    }
  }

  scoreboard() {
    const out = {};
    for (const [key, entry] of this.state) {
      if (!entry.solvedAt) continue;
      const sep = key.indexOf(":");
      if (sep < 0) continue;
      const challengeId = key.slice(0, sep);
      const player = key.slice(sep + 1);
      const row = out[challengeId] ?? (out[challengeId] = {
        solveCount: 0,
        currentlySolved: 0,
        firstBlood: null,
        solves: [],
      });
      const ts = Math.floor(entry.solvedAt / 1000);
      row.solveCount++;
      if (entry.solved) row.currentlySolved++;
      row.solves.push({ player, ts, current: !!entry.solved });
      if (!row.firstBlood || ts < row.firstBlood.ts) {
        row.firstBlood = { player, ts };
      }
    }
    return out;
  }

  touch(challengeId, player) {
    const key = this._key(challengeId, player);
    const entry = this.state.get(key);
    if (entry) entry.lastSeen = Date.now();
  }

  async _poll() {
    if (!this.checkFn) return;
    const now = Date.now();
    for (const [key, info] of [...this.state]) {
      if (now - info.lastSeen > this.forgetAfterMs) {
        this.state.delete(key);
        continue;
      }
      const [challengeId, player] = key.split(":");
      try {
        const solved = await this.checkFn(challengeId, player);
        if (solved !== info.solved) {
          this.observe(challengeId, player, solved);
        }
      } catch {}
    }
  }
}
