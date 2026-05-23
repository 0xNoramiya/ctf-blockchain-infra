import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { ethers } from "ethers";
import { Launcher } from "./launcher.js";
import { WebhookEmitter, SolveTracker } from "./webhook.js";
import { metrics, M } from "./metrics.js";
import { mountAdmin } from "./admin.js";
import { isRpcMethodAllowed } from "./rpc-allow.js";
import { log, requestLogger } from "./logger.js";
import { drain } from "./drain.js";
import { WriteupStore } from "./writeups.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const required = ["RPC_URL", "CHAIN_ID"];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`missing required env: ${k}`);
    process.exit(1);
  }
}

const RPC_URL = process.env.RPC_URL;
const CHAIN_ID = Number(process.env.CHAIN_ID);
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
const MANIFEST_PATH = process.env.CHALLENGES_MANIFEST
  ? path.resolve(process.env.CHALLENGES_MANIFEST)
  : path.join(__dirname, "challenges.json");

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(`manifest not found: ${MANIFEST_PATH}`);
  console.error("copy challenges.example.json to challenges.json and edit");
  process.exit(1);
}

const CHAINS_PATH = path.join(__dirname, "chains.json");
const chainPresets = fs.existsSync(CHAINS_PATH)
  ? JSON.parse(fs.readFileSync(CHAINS_PATH, "utf8"))
  : {};
const chainPreset = chainPresets[String(CHAIN_ID)] ?? null;
if (chainPreset) {
  console.log(`chain preset matched: ${chainPreset.chainName} (${CHAIN_ID})`);
}

const sharedProvider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
const launcher = new Launcher();
await launcher.init();

const webhook = new WebhookEmitter({
  url: process.env.WEBHOOK_URL,
  secret: process.env.WEBHOOK_SECRET,
});
const solveTracker = new SolveTracker(webhook);
const writeups = new WriteupStore();

let manifest = null;
const challenges = new Map();

function loadChallenge(c) {
  if (!c.id || !/^[a-z0-9_-]{1,32}$/i.test(c.id)) throw new Error(`invalid challenge id ${JSON.stringify(c.id)}`);
  const mode = c.mode ?? "shared";
  if (!["shared", "private-anvil"].includes(mode)) throw new Error(`challenge ${c.id}: bad mode ${mode}`);
  if (mode === "shared" && !ethers.isAddress(c.target)) throw new Error(`shared challenge ${c.id}: bad target ${c.target}`);
  if (mode === "private-anvil" && !c.image) throw new Error(`private-anvil challenge ${c.id}: missing image`);
  const flagEnv = `FLAG_${c.id.toUpperCase()}`;
  if (!process.env[flagEnv]) throw new Error(`missing env ${flagEnv} for ${c.id}`);
  const isSolvedFn = c.isSolvedFn ?? "isSolved";

  let signerWallet = null;
  if (c.signer?.enabled) {
    const keyEnv = `SIGNER_KEY_${c.id.toUpperCase()}`;
    if (!process.env[keyEnv]) throw new Error(`${c.id} declares signer but ${keyEnv} is missing`);
    signerWallet = new ethers.Wallet(process.env[keyEnv]);
  }

  const sharedContract = mode === "shared"
    ? new ethers.Contract(c.target, [`function ${isSolvedFn}(address) view returns (bool)`], sharedProvider)
    : null;

  return {
    config: { ...c, mode },
    flag: process.env[flagEnv],
    isSolvedFn,
    sharedContract,
    signerWallet,
  };
}

function buildChallenges(m) {
  const out = new Map();
  for (const c of m.challenges ?? []) out.set(c.id, loadChallenge(c));
  if (out.size === 0) throw new Error("manifest contains no challenges");
  return out;
}

function initialLoad() {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const m = buildChallenges(manifest);
  challenges.clear();
  for (const [k, v] of m) challenges.set(k, v);
  updateChallengeMetrics();
}
try {
  initialLoad();
} catch (e) {
  console.error(`manifest error: ${e.message}`);
  process.exit(1);
}

async function reloadManifest() {
  const next = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const built = buildChallenges(next);
  const prevIds = new Set(challenges.keys());
  const nextIds = new Set(built.keys());

  const removed = [...prevIds].filter(id => !nextIds.has(id));
  for (const id of removed) {
    challenges.delete(id);
    for (const inst of [...launcher.allInstances()].filter(i => i.challengeId === id)) {
      await launcher.kill(inst.challengeId, inst.player);
    }
  }
  for (const [id, ch] of built) challenges.set(id, ch);
  manifest = next;
  updateChallengeMetrics();
  return {
    reloaded: true,
    added: [...nextIds].filter(id => !prevIds.has(id)),
    removed,
    total: challenges.size,
  };
}

function updateChallengeMetrics() {
  const byMode = new Map();
  for (const ch of challenges.values()) {
    byMode.set(ch.config.mode, (byMode.get(ch.config.mode) ?? 0) + 1);
  }
  M.challengesTotal.values.clear();
  for (const [mode, n] of byMode) M.challengesTotal.set({ mode }, n);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", (process.env.TRUST_PROXY ?? "loopback,linklocal,uniquelocal"));
app.use(requestLogger());
app.use(express.json({ limit: "256kb" }));
app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(",") }));

function mkLimiter(windowMs, max) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: "rate limited" }),
  });
}

const limits = {
  sign:    mkLimiter(10_000, Number(process.env.RATE_LIMIT_SIGN     ?? 5)),
  launch:  mkLimiter(60_000, Number(process.env.RATE_LIMIT_LAUNCH   ?? 5)),
  kill:    mkLimiter(60_000, Number(process.env.RATE_LIMIT_KILL     ?? 10)),
  reset:   mkLimiter(60_000, Number(process.env.RATE_LIMIT_RESET    ?? 10)),
  flag:    mkLimiter(10_000, Number(process.env.RATE_LIMIT_FLAG     ?? 20)),
  status:  mkLimiter(10_000, Number(process.env.RATE_LIMIT_STATUS   ?? 60)),
  rpc:     mkLimiter(10_000, Number(process.env.RATE_LIMIT_RPC      ?? 200)),
  writeup: mkLimiter(60_000, Number(process.env.RATE_LIMIT_WRITEUP  ?? 3)),
};

function publicChallenge(id, ch) {
  const c = ch.config;
  return {
    id,
    title: c.title,
    description: c.description ?? "",
    category: c.category ?? "smart-contract",
    mode: c.mode,
    target: c.target ?? null,
    info: c.info ?? [],
    downloads: c.downloads ?? [],
    timeout: c.timeout ?? null,
    signer: ch.signerWallet
      ? { enabled: true, address: ch.signerWallet.address, label: c.signer.label ?? "Get signature", type: c.signer.type ?? "personal-sign" }
      : { enabled: false },
  };
}

app.get("/api/config", (_req, res) => {
  const site = { ...(chainPreset ?? {}), ...(manifest.site ?? {}) };
  if (chainPreset?.faucets?.length && !manifest.site?.faucets?.length) {
    site.faucets = chainPreset.faucets;
  }
  res.json({
    site,
    chainId: CHAIN_ID,
    rpcUrl: RPC_URL,
    launcherEnabled: launcher.available(),
    challenges: [...challenges].map(([id, ch]) => publicChallenge(id, ch)),
  });
});

function getChallenge(req, res) {
  const ch = challenges.get(req.params.id);
  if (!ch) { res.status(404).json({ error: "unknown challenge" }); return null; }
  return ch;
}

function parsePlayer(req, res) {
  const addr = req.query.address ?? req.body?.address;
  if (typeof addr !== "string" || !ethers.isAddress(addr)) {
    res.status(400).json({ error: "bad or missing address" });
    return null;
  }
  return ethers.getAddress(addr);
}

async function resolveCheck(ch, player) {
  if (ch.config.mode === "shared") {
    return { contract: ch.sharedContract, target: ch.config.target };
  }
  const inst = launcher.get(ch.config.id, player);
  if (!inst) return null;
  const provider = new ethers.JsonRpcProvider(inst.internalUrl ?? inst.rpcUrl);
  const contract = new ethers.Contract(
    inst.target,
    [`function ${ch.isSolvedFn}(address) view returns (bool)`],
    provider,
  );
  return { contract, target: inst.target, instance: inst };
}

app.get("/api/status/:id", limits.status, async (req, res) => {
  const ch = getChallenge(req, res); if (!ch) return;
  const player = parsePlayer(req, res); if (!player) return;
  const ctx = await resolveCheck(ch, player);
  if (!ctx) {
    solveTracker.observe(ch.config.id, player, false);
    return res.json({ solved: false, spawned: false });
  }
  try {
    const ok = await ctx.contract[ch.isSolvedFn](player);
    solveTracker.observe(ch.config.id, player, !!ok);
    res.json({
      solved: !!ok,
      spawned: !!ctx.instance,
      target: ctx.target,
      ...(ctx.instance ? { instance: publicInstance(ctx.instance) } : {}),
    });
  } catch (e) {
    console.error(`status ${req.params.id}:`, e.shortMessage ?? e.message);
    res.status(502).json({ error: "rpc error" });
  }
});

app.get("/api/flag/:id", limits.flag, async (req, res) => {
  const ch = getChallenge(req, res); if (!ch) return;
  const player = parsePlayer(req, res); if (!player) return;
  const ctx = await resolveCheck(ch, player);
  if (!ctx) {
    solveTracker.observe(ch.config.id, player, false);
    return res.json({ solved: false });
  }
  try {
    const ok = await ctx.contract[ch.isSolvedFn](player);
    solveTracker.observe(ch.config.id, player, !!ok);
    if (!ok) return res.json({ solved: false });
    res.json({ solved: true, flag: ch.flag });
  } catch (e) {
    console.error(`flag ${req.params.id}:`, e.shortMessage ?? e.message);
    res.status(502).json({ error: "rpc error" });
  }
});

const WRITEUP_REQUIRE_SIG = (process.env.WRITEUP_REQUIRE_SIGNATURE ?? "false").toLowerCase() === "true";
const WRITEUP_SIG_SKEW_MS = Number(process.env.WRITEUP_SIG_SKEW_MS ?? 5 * 60 * 1000);

function writeupMessage(challengeId, player, timestamp, writeup) {
  const bodyHash = ethers.keccak256(ethers.toUtf8Bytes(writeup));
  return `ctf-writeup\n${challengeId}\n${player}\n${timestamp}\n${bodyHash}`;
}

app.post("/api/writeup/:id", limits.writeup, async (req, res) => {
  const ch = getChallenge(req, res); if (!ch) return;
  const player = parsePlayer(req, res); if (!player) return;
  const writeup = req.body?.writeup;
  if (typeof writeup !== "string" || !writeup.trim()) {
    return res.status(400).json({ error: "writeup body must be a non-empty string" });
  }

  const sig = req.body?.signature;
  const ts  = req.body?.timestamp;
  let signed = false;
  if (sig || ts || WRITEUP_REQUIRE_SIG) {
    if (typeof sig !== "string" || typeof ts !== "number") {
      return res.status(400).json({ error: "signature + numeric timestamp required" });
    }
    if (Math.abs(Date.now() - ts) > WRITEUP_SIG_SKEW_MS) {
      return res.status(400).json({ error: "stale timestamp" });
    }
    try {
      const recovered = ethers.verifyMessage(writeupMessage(ch.config.id, player, ts, writeup), sig);
      if (ethers.getAddress(recovered) !== player) {
        return res.status(401).json({ error: "signature does not match address" });
      }
      signed = true;
    } catch {
      return res.status(400).json({ error: "bad signature" });
    }
  }

  // Gate on on-chain solve so randos can't spam the file.
  const ctx = await resolveCheck(ch, player);
  if (!ctx) return res.status(403).json({ error: "no instance / not solved" });
  let solved = false;
  try { solved = !!(await ctx.contract[ch.isSolvedFn](player)); }
  catch { return res.status(502).json({ error: "rpc error checking solve" }); }
  if (!solved) return res.status(403).json({ error: "solve first" });

  try {
    const rec = writeups.append({
      challengeId: ch.config.id,
      player,
      writeup,
      ip: req.ip,
      signed,
    });
    res.json({ accepted: true, ts: rec.ts, bytes: Buffer.byteLength(rec.writeup, "utf8"), signed });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/writeup/limits", (_req, res) => res.json({
  maxBytes: writeups.maxLen,
  requireSignature: WRITEUP_REQUIRE_SIG,
  signatureSkewMs: WRITEUP_SIG_SKEW_MS,
}));

app.get("/api/scoreboard", limits.status, (_req, res) => {
  res.json({
    generatedAt: Math.floor(Date.now() / 1000),
    board: solveTracker.scoreboard(),
  });
});

app.get("/api/sign/:id", limits.sign, async (req, res) => {
  const ch = getChallenge(req, res); if (!ch) return;
  if (!ch.signerWallet) return res.status(404).json({ error: "no signer for this challenge" });
  const player = parsePlayer(req, res); if (!player) return;

  const cfg = ch.config.signer;
  const type = cfg.type ?? "personal-sign";

  try {
    if (type === "personal-sign") {
      const tmpl = cfg.template;
      if (!Array.isArray(tmpl) || tmpl.length === 0) {
        return res.status(500).json({ error: "signer template missing" });
      }
      const types = [];
      const values = [];
      for (const part of tmpl) {
        if (typeof part?.type !== "string") throw new Error("bad template part");
        types.push(part.type);
        let v = part.value;
        if (v === "$player") v = player;
        values.push(v);
      }
      const inner = ethers.solidityPackedKeccak256(types, values);
      const signature = await ch.signerWallet.signMessage(ethers.getBytes(inner));
      return res.json({ player, signature, signer: ch.signerWallet.address, type });
    }

    if (type === "eip712") {
      const { domain, types, primaryType, message } = cfg.typedData ?? {};
      if (!domain || !types || !message) {
        return res.status(500).json({ error: "eip712 typedData missing" });
      }
      const filledMessage = substitutePlayer(message, player);
      const filledDomain = substituteChainId(domain, CHAIN_ID);
      const subTypes = stripEip712Domain(types);
      const signature = await ch.signerWallet.signTypedData(filledDomain, subTypes, filledMessage);
      return res.json({
        player,
        signature,
        signer: ch.signerWallet.address,
        type,
        primaryType: primaryType ?? null,
        domain: filledDomain,
        types: subTypes,
        message: filledMessage,
      });
    }

    return res.status(400).json({ error: `unknown signer type ${type}` });
  } catch (e) {
    console.error(`sign ${req.params.id}:`, e.message);
    res.status(500).json({ error: "sign failed" });
  }
});

function substitutePlayer(obj, player) {
  if (obj === "$player") return player;
  if (Array.isArray(obj)) return obj.map(v => substitutePlayer(v, player));
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = substitutePlayer(v, player);
    return out;
  }
  return obj;
}

function substituteChainId(domain, chainId) {
  if (domain.chainId === "$chainId" || domain.chainId === null || domain.chainId === undefined) {
    return { ...domain, chainId };
  }
  return domain;
}

function stripEip712Domain(types) {
  const out = {};
  for (const [k, v] of Object.entries(types)) {
    if (k === "EIP712Domain") continue;
    out[k] = v;
  }
  return out;
}

function publicInstance(inst) {
  return {
    instanceId: inst.instanceId.slice(0, 16),
    fullInstanceId: inst.instanceId,
    mode: inst.mode,
    rpcUrl: inst.rpcUrl,
    target: inst.target,
    extra: inst.extra,
    createdAt: inst.createdAt,
    expiresAt: inst.expiresAt,
  };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function timingSafeEqStr(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

app.post("/api/rpc/:instanceId", limits.rpc, async (req, res) => {
  const inst = launcher.getById(req.params.instanceId);
  if (!inst) return res.status(404).json(jsonRpcError(null, -32004, "unknown instance"));
  if (inst.mode !== "proxy") return res.status(400).json(jsonRpcError(null, -32601, "instance not in proxy mode"));
  if (inst.accessToken) {
    const presented = req.query.t ?? req.headers["x-instance-token"];
    if (!presented || !timingSafeEqStr(String(presented), inst.accessToken)) {
      return res.status(401).json(jsonRpcError(null, -32001, "bad or missing instance token"));
    }
  }
  const now = Math.floor(Date.now() / 1000);
  if (inst.expiresAt < now) return res.status(410).json(jsonRpcError(null, -32002, "instance expired"));

  const body = req.body;
  const isArr = Array.isArray(body);
  const items = isArr ? body : [body];

  for (const item of items) {
    if (!item || typeof item !== "object" || typeof item.method !== "string") {
      return res.status(400).json(jsonRpcError(item?.id, -32600, "invalid request"));
    }
    if (!isRpcMethodAllowed(item.method)) {
      return res.status(403).json(jsonRpcError(item.id, -32601, `method ${item.method} not allowed`));
    }
  }

  try {
    const upstream = await fetch(inst.internalUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const out = await upstream.json();
    res.status(upstream.ok ? 200 : 502).json(out);
  } catch (e) {
    res.status(502).json(jsonRpcError(isArr ? null : body.id, -32000, e.message ?? "upstream error"));
  }
});

app.post("/api/launch/:id", limits.launch, async (req, res) => {
  const ch = getChallenge(req, res); if (!ch) return;
  if (ch.config.mode !== "private-anvil") return res.status(400).json({ error: "challenge is not private-anvil mode" });
  if (!launcher.available()) return res.status(503).json({ error: "launcher unavailable on this server" });
  if (drain.on) return res.status(503).json({ error: "drain mode: new launches paused", reason: drain.reason });
  const player = parsePlayer(req, res); if (!player) return;
  try {
    const inst = await launcher.launch(ch, player);
    M.launchesTotal.inc({ challenge: ch.config.id });
    res.json({ instance: publicInstance(inst) });
  } catch (e) {
    console.error(`launch ${req.params.id}:`, e.message);
    M.launchFailTotal.inc({ challenge: ch.config.id, reason: classifyError(e) });
    res.status(500).json({ error: e.message });
  }
});

function classifyError(e) {
  const msg = (e?.message ?? "").toLowerCase();
  if (msg.includes("docker run failed")) return "docker_run";
  if (msg.includes("anvil never")) return "anvil_timeout";
  if (msg.includes("no free port")) return "port_exhausted";
  if (msg.includes("launcher unavailable")) return "no_docker";
  return "other";
}

app.post("/api/kill/:id", limits.kill, async (req, res) => {
  const ch = getChallenge(req, res); if (!ch) return;
  if (ch.config.mode !== "private-anvil") return res.status(400).json({ error: "challenge is not private-anvil mode" });
  const player = parsePlayer(req, res); if (!player) return;
  const killed = await launcher.kill(ch.config.id, player);
  res.json({ killed });
});

app.post("/api/reset/:id", limits.reset, async (req, res) => {
  const ch = getChallenge(req, res); if (!ch) return;
  if (ch.config.mode !== "private-anvil") return res.status(400).json({ error: "challenge is not private-anvil mode" });
  if (drain.on) return res.status(503).json({ error: "drain mode: resets paused", reason: drain.reason });
  const player = parsePlayer(req, res); if (!player) return;
  const r = await launcher.reset(ch.config.id, player);
  if (!r.ok) return res.status(400).json({ error: r.reason });
  solveTracker.observe(ch.config.id, player, false);
  res.json({ reset: true });
});

app.get("/api/instance/:id", (req, res) => {
  const ch = getChallenge(req, res); if (!ch) return;
  if (ch.config.mode !== "private-anvil") return res.status(400).json({ error: "challenge is not private-anvil mode" });
  const player = parsePlayer(req, res); if (!player) return;
  const inst = launcher.get(ch.config.id, player);
  if (!inst) return res.json({ instance: null });
  res.json({ instance: publicInstance(inst) });
});

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  challenges: challenges.size,
  launcher: launcher.available(),
  drain: drain.state(),
}));

const OPENAPI_PATH = path.join(__dirname, "openapi.yaml");
if (fs.existsSync(OPENAPI_PATH)) {
  const openapiText = fs.readFileSync(OPENAPI_PATH, "utf8");
  app.get("/api/openapi.yaml", (_req, res) => {
    res.set("Content-Type", "application/yaml");
    res.send(openapiText);
  });
}

if (process.env.FRONTEND_PATH) {
  const fp = path.resolve(process.env.FRONTEND_PATH);
  if (fs.existsSync(fp)) {
    app.use(express.static(fp));
    log.info("serving frontend statically", { dir: fp });
  } else {
    log.warn("FRONTEND_PATH set but missing", { dir: fp });
  }
}

metrics.onScrape(r => {
  r.gauge("ctf_instances_active", "currently-running launcher instances per challenge")
    .values.clear();
  if (launcher.available()) {
    for (const [chId, n] of launcher.countByChallenge()) {
      M.instancesActive.set({ challenge: chId }, n);
    }
  }
  M.trackedPlayers.set({}, solveTracker.state.size);
  M.drainEnabled.set({}, drain.on ? 1 : 0);
});

app.get("/metrics", (_req, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4");
  res.send(metrics.render());
});

app.use("/api/admin", mountAdmin({
  launcher, solveTracker, webhook, reloadManifest, challenges, M, writeups,
}));

solveTracker.start(async (challengeId, playerAddr) => {
  const ch = challenges.get(challengeId);
  if (!ch) return false;
  const ctx = await resolveCheck(ch, ethers.getAddress(playerAddr));
  if (!ctx) return false;
  try {
    return !!(await ctx.contract[ch.isSolvedFn](playerAddr));
  } catch {
    return false;
  }
});

app.listen(PORT, HOST, () => {
  log.info("backend listening", {
    host: HOST, port: PORT, chain: CHAIN_ID,
    manifest: MANIFEST_PATH,
    launcher: launcher.available(),
    webhook: webhook.enabled(),
    challenges: [...challenges.keys()],
  });
  for (const [id, ch] of challenges) {
    log.info("challenge loaded", {
      id,
      mode: ch.config.mode,
      target: ch.config.target ?? null,
      image: ch.config.image ?? null,
      timeout: ch.config.timeout ?? null,
      signer: ch.signerWallet?.address ?? null,
    });
  }
});
