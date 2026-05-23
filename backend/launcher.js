import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Docker from "dockerode";
import { ethers } from "ethers";

const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const PUBLIC_HOST = process.env.PUBLIC_HOST ?? "127.0.0.1";
const PORT_RANGE_START = Number(process.env.INSTANCE_PORT_START ?? 30000);
const PORT_RANGE_END = Number(process.env.INSTANCE_PORT_END ?? 30999);
const DEFAULT_TIMEOUT = Number(process.env.INSTANCE_DEFAULT_TIMEOUT ?? 1800);
const RPC_MODE = (process.env.INSTANCE_RPC_MODE ?? "proxy").toLowerCase();
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "";
const INSTANCE_NETWORK = process.env.INSTANCE_NETWORK ?? "bridge";
const STATE_PATH = process.env.INSTANCE_STATE_PATH ?? "/tmp/ctf-instances.json";

export class Launcher {
  constructor() {
    this.docker = null;
    this.instancesByPlayer = new Map();
    this.instancesById = new Map();
    this.usedPorts = new Set();
    this.reapTimer = null;
  }

  available() {
    return !!this.docker;
  }

  async init() {
    try {
      this.docker = new Docker({ socketPath: DOCKER_SOCKET });
      await this.docker.ping();
      this.reapTimer = setInterval(() => this._reap().catch(() => {}), 15_000);
      console.log(`launcher: docker reachable via ${DOCKER_SOCKET}`);
      await this._restoreFromDisk();
    } catch (e) {
      this.docker = null;
      console.warn(`launcher: docker unavailable (${e.code ?? e.message}); private-anvil challenges disabled`);
    }
  }

  async _restoreFromDisk() {
    if (!fs.existsSync(STATE_PATH)) return;
    let saved;
    try { saved = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); }
    catch (e) {
      console.warn(`launcher: state file ${STATE_PATH} unreadable (${e.message}); ignoring`);
      return;
    }
    if (!Array.isArray(saved?.instances)) return;
    let restored = 0;
    let dropped  = 0;
    for (const inst of saved.instances) {
      try {
        const c = this.docker.getContainer(inst.instanceId);
        const info = await c.inspect();
        if (!info.State?.Running) { dropped++; continue; }
        this.instancesByPlayer.set(this._key(inst.challengeId, inst.player), inst);
        this.instancesById.set(inst.instanceId, inst);
        if (inst.port != null) this.usedPorts.add(inst.port);
        restored++;
      } catch {
        dropped++;
      }
    }
    if (restored || dropped) {
      console.log(`launcher: restored ${restored} instance(s) from ${STATE_PATH}; dropped ${dropped} stale entry/ies`);
      this._persist();
    }
  }

  _persist() {
    try {
      const dir = path.dirname(STATE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        version: 1,
        savedAt: Math.floor(Date.now() / 1000),
        instances: [...this.instancesByPlayer.values()],
      };
      const tmp = `${STATE_PATH}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, STATE_PATH);
    } catch (e) {
      console.warn(`launcher: persist failed (${e.message})`);
    }
  }

  _key(challengeId, player) {
    return `${challengeId}:${ethers.getAddress(player).toLowerCase()}`;
  }

  _allocatePort() {
    for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) {
      if (!this.usedPorts.has(p)) {
        this.usedPorts.add(p);
        return p;
      }
    }
    throw new Error("no free port");
  }

  async launch(challenge, player) {
    if (!this.docker) throw new Error("launcher unavailable");
    if (!challenge.config.image) throw new Error("challenge missing image");

    const key = this._key(challenge.config.id, player);
    if (this.instancesByPlayer.has(key)) {
      return this.instancesByPlayer.get(key);
    }

    const useHostPort = RPC_MODE === "direct";
    const port = useHostPort ? this._allocatePort() : null;
    const ttl = challenge.config.timeout ?? DEFAULT_TIMEOUT;
    const containerName = `ctf-${challenge.config.id}-${player.slice(2, 10).toLowerCase()}`;

    let container;
    try {
      container = await this.docker.createContainer({
        name: containerName,
        Image: challenge.config.image,
        Env: buildEnv(challenge, player),
        HostConfig: {
          AutoRemove: true,
          NetworkMode: INSTANCE_NETWORK,
          ...(useHostPort
            ? { PortBindings: { "8545/tcp": [{ HostPort: String(port) }] } }
            : {}),
          Memory: 512 * 1024 * 1024,
          CpuShares: 512,
          PidsLimit: 256,
          RestartPolicy: { Name: "no" },
        },
        ExposedPorts: { "8545/tcp": {} },
        Labels: {
          "ctf.challenge": challenge.config.id,
          "ctf.player": player.toLowerCase(),
          "ctf.created": String(Date.now()),
        },
      });
      await container.start();
    } catch (e) {
      if (port !== null) this.usedPorts.delete(port);
      throw new Error(`docker run failed: ${e.message}`);
    }

    const containerIp = await this._inspectIp(container);
    const internalUrl = `http://${containerIp}:8545`;
    const meta = await this._waitForAnvilReady(container, internalUrl);

    const accessToken = crypto.randomBytes(24).toString("hex");
    const rpcUrl = useHostPort
      ? `http://${PUBLIC_HOST}:${port}`
      : `${PUBLIC_BASE_URL}/api/rpc/${container.id}?t=${accessToken}`;

    let snapshotId = null;
    try {
      snapshotId = await this._jsonRpc(internalUrl, "evm_snapshot", []);
    } catch (e) {
      console.warn(`launcher: evm_snapshot failed for ${container.id.slice(0, 12)}: ${e.message}`);
    }

    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    const instance = {
      instanceId: container.id,
      challengeId: challenge.config.id,
      player: ethers.getAddress(player),
      containerName,
      mode: useHostPort ? "direct" : "proxy",
      rpcUrl,
      internalUrl,
      containerIp,
      port,
      target: meta.target,
      extra: meta.extra ?? {},
      snapshotId,
      accessToken,
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt,
    };

    this.instancesByPlayer.set(key, instance);
    this.instancesById.set(container.id, instance);
    this._persist();
    return instance;
  }

  getById(instanceId) {
    return this.instancesById.get(instanceId) ?? null;
  }

  allInstances() {
    return [...this.instancesByPlayer.values()];
  }

  async reset(challengeId, player) {
    const inst = this.get(challengeId, player);
    if (!inst) return { ok: false, reason: "no instance" };
    if (inst.snapshotId == null) return { ok: false, reason: "no snapshot" };
    try {
      const reverted = await this._jsonRpc(inst.internalUrl, "evm_revert", [inst.snapshotId]);
      if (!reverted) return { ok: false, reason: "revert returned false" };
      inst.snapshotId = await this._jsonRpc(inst.internalUrl, "evm_snapshot", []);
      this._persist();
      return { ok: true, instanceId: inst.instanceId, snapshotId: inst.snapshotId };
    } catch (e) {
      return { ok: false, reason: e.message ?? "rpc error" };
    }
  }

  async _jsonRpc(url, method, params) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message ?? String(j.error.code));
    return j.result;
  }

  countByChallenge() {
    const out = new Map();
    for (const inst of this.instancesByPlayer.values()) {
      out.set(inst.challengeId, (out.get(inst.challengeId) ?? 0) + 1);
    }
    return out;
  }

  async _inspectIp(container) {
    const info = await container.inspect();
    const nets = info.NetworkSettings?.Networks ?? {};
    const chosen = nets[INSTANCE_NETWORK] ?? Object.values(nets)[0];
    const ip = chosen?.IPAddress;
    if (!ip) throw new Error("container has no IP on its network");
    return ip;
  }

  async kill(challengeId, player) {
    const key = this._key(challengeId, player);
    const instance = this.instancesByPlayer.get(key);
    if (!instance) return false;
    try {
      const c = this.docker.getContainer(instance.instanceId);
      await c.stop({ t: 2 }).catch(() => {});
      await c.remove({ force: true }).catch(() => {});
    } catch {}
    this.instancesByPlayer.delete(key);
    this.instancesById.delete(instance.instanceId);
    if (instance.port != null) this.usedPorts.delete(instance.port);
    this._persist();
    return true;
  }

  get(challengeId, player) {
    return this.instancesByPlayer.get(this._key(challengeId, player)) ?? null;
  }

  async _waitForAnvilReady(container, rpcUrl, attempts = 25) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    let meta = { target: null };

    for (let i = 0; i < attempts; i++) {
      try {
        await provider.getBlockNumber();
        meta = await this._readChallengeMeta(container);
        if (meta.target && ethers.isAddress(meta.target)) return meta;
      } catch {}
      await new Promise(r => setTimeout(r, 600));
    }
    throw new Error("anvil never became ready / no addresses emitted");
  }

  async _readChallengeMeta(container) {
    const logBuf = await container.logs({ stdout: true, stderr: false, follow: false });
    const text = stripDockerLogHeaders(logBuf.toString("binary"));
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("CTF_META=")) continue;
      try {
        return JSON.parse(trimmed.slice("CTF_META=".length));
      } catch {}
    }
    return { target: null };
  }

  async _reap() {
    if (!this.docker) return;
    const now = Math.floor(Date.now() / 1000);
    for (const [key, inst] of this.instancesByPlayer) {
      if (inst.expiresAt > now) continue;
      console.log(`launcher: reaping expired instance ${inst.instanceId.slice(0, 12)} for ${key}`);
      try {
        const c = this.docker.getContainer(inst.instanceId);
        await c.stop({ t: 2 }).catch(() => {});
        await c.remove({ force: true }).catch(() => {});
      } catch {}
      this.instancesByPlayer.delete(key);
      this.instancesById.delete(inst.instanceId);
      if (inst.port != null) this.usedPorts.delete(inst.port);
    }
    this._persist();
  }
}

function buildEnv(challenge, player) {
  const env = [
    `PLAYER=${player}`,
    `CHALLENGE_ID=${challenge.config.id}`,
  ];
  const fork = challenge.config.fork;
  if (fork?.url) env.push(`FORK_URL=${fork.url}`);
  if (fork?.blockNumber !== undefined && fork?.blockNumber !== null) {
    env.push(`FORK_BLOCK_NUMBER=${fork.blockNumber}`);
  }
  for (const [k, v] of Object.entries(challenge.config.env ?? {})) {
    env.push(`${k}=${v}`);
  }
  return env;
}

function stripDockerLogHeaders(s) {
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (i + 8 <= s.length && [1, 2].includes(s.charCodeAt(i))) {
      const size = (s.charCodeAt(i + 4) << 24) | (s.charCodeAt(i + 5) << 16) |
                   (s.charCodeAt(i + 6) << 8) | s.charCodeAt(i + 7);
      out += s.slice(i + 8, i + 8 + size);
      i += 8 + size;
    } else {
      out += s[i];
      i++;
    }
  }
  return out;
}
