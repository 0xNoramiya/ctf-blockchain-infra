import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm";

const BACKEND = "";
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  config: null,
  player: null,
  walletProvider: null,
  readProvider: null,
  pollers: new Map(),
};

function toast(msg, ms = 2400) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

async function api(path, opts = {}) {
  const r = await fetch(`${BACKEND}${path}`, opts);
  if (!r.ok) {
    let detail = `${r.status}`;
    try { const j = await r.json(); if (j?.error) detail = j.error; } catch {}
    throw new Error(`${path} → ${detail}`);
  }
  return r.json();
}

async function loadConfig() {
  const cfg = await api("/api/config");
  state.config = cfg;
  try {
    const limits = await api("/api/writeup/limits");
    state.config.writeupRequireSignature = !!limits.requireSignature;
    state.config.writeupMaxBytes = limits.maxBytes;
  } catch {}
  state.readProvider = new ethers.JsonRpcProvider(cfg.rpcUrl, cfg.chainId, { staticNetwork: true });

  $("#siteTitle").textContent = cfg.site?.title ?? "CTF";
  document.title = cfg.site?.title ?? "CTF";
  const sub = cfg.site?.subtitle ?? "";
  $("#siteSubtitle").textContent = sub;
  $("#siteSubtitle").hidden = !sub;
  $("#footer").textContent = cfg.site?.footer ?? "";

  $("#chainLabel").textContent = `${cfg.site?.chainName ?? "chain"} (${cfg.chainId})`;
  pollBlock();

  renderCards();
}

async function pollBlock() {
  try {
    const n = await state.readProvider.getBlockNumber();
    $("#blockLabel").textContent = `#${n}`;
  } catch {}
  setTimeout(pollBlock, 10_000);
}

setInterval(refreshBalance, 60_000);

async function refreshScoreboard() {
  if (!state.config) return;
  try {
    const r = await api("/api/scoreboard");
    renderScoreboard(r.board);
  } catch {}
}

function renderScoreboard(board) {
  const body = $("#scoreboardBody");
  if (!body) return;
  const ids = state.config.challenges.map(c => c.id);
  const hasAny = ids.some(id => board[id]?.solveCount > 0);
  if (!hasAny) {
    body.innerHTML = '<span class="scoreboard-empty">no solves yet</span>';
    return;
  }
  body.innerHTML = "";
  for (const ch of state.config.challenges) {
    const row = board[ch.id];
    const div = document.createElement("div");
    div.className = "scoreboard-row";
    const title = document.createElement("b");
    title.textContent = ch.title;
    div.appendChild(title);
    if (!row || row.solveCount === 0) {
      const empty = document.createElement("span");
      empty.className = "count";
      empty.textContent = "no solves yet";
      div.appendChild(empty);
    } else {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = `${row.currentlySolved} currently solved · ${row.solveCount} total`;
      div.appendChild(count);
      if (row.firstBlood) {
        const fb = document.createElement("div");
        fb.className = "first";
        fb.textContent = `🩸 ${shortAddr(row.firstBlood.player)} @ ${new Date(row.firstBlood.ts * 1000).toLocaleTimeString()}`;
        div.appendChild(fb);
      }
    }
    body.appendChild(div);
  }
}

setInterval(refreshScoreboard, 15_000);

function shortAddr(a) {
  if (!a) return "0x…";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function renderInfo(ul, items) {
  ul.innerHTML = "";
  for (const it of items) {
    const li = document.createElement("li");
    const b = document.createElement("b");
    b.textContent = it.label;
    const v = document.createElement("span");
    v.className = "val";
    if (it.kind === "address" || it.kind === "erc20") {
      v.classList.add("mono");
      const text = document.createElement("span");
      text.textContent = it.value;
      text.title = it.value;
      v.appendChild(text);

      const explorer = state.config?.site?.blockExplorer;
      if (explorer && ethers.isAddress(it.value)) {
        const a = document.createElement("a");
        a.className = "mini-link";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.href = `${explorer.replace(/\/$/, "")}/address/${it.value}`;
        a.textContent = "↗";
        a.title = "View on block explorer";
        v.appendChild(a);
      }

      if (it.kind === "erc20") {
        const btn = document.createElement("button");
        btn.className = "mini-link mini-link-btn";
        btn.textContent = "+ wallet";
        btn.title = `Track ${it.symbol ?? "token"} in your wallet`;
        btn.addEventListener("click", () => watchAsset(it));
        v.appendChild(btn);
      }
    } else {
      v.textContent = it.value;
    }
    li.append(b, v);
    ul.appendChild(li);
  }
}

async function watchAsset(it) {
  if (!window.ethereum) return toast("no wallet detected");
  try {
    await window.ethereum.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: it.value,
          symbol: it.symbol ?? "TOKEN",
          decimals: Number(it.decimals ?? 18),
          image: it.image ?? undefined,
        },
      },
    });
  } catch (e) {
    toast(`watch failed: ${e.message ?? e}`);
  }
}

function renderDownloads(div, downloads) {
  div.innerHTML = "";
  for (const d of downloads) {
    const a = document.createElement("a");
    a.className = "dl-link";
    a.href = d.url;
    a.download = "";
    a.textContent = `↓ ${d.label}`;
    div.appendChild(a);
  }
}

function renderCards() {
  const root = $("#cards");
  root.innerHTML = "";
  const tpl = $("#cardTpl");

  for (const ch of state.config.challenges) {
    const node = tpl.content.cloneNode(true);
    const article = $(".card", node);
    article.dataset.id = ch.id;
    article.dataset.mode = ch.mode ?? "shared";

    $(".card-id", node).textContent = ch.id.toUpperCase();
    $(".card-title", node).textContent = ch.title;
    $(".card-desc", node).textContent = ch.description;

    renderInfo($(".info", node), ch.info);
    renderDownloads($(".downloads", node), ch.downloads);

    const actions = $(".actions", node);
    if (ch.mode === "private-anvil") {
      const spawn = document.createElement("button");
      spawn.className = "btn";
      spawn.textContent = "Spawn instance";
      spawn.dataset.action = "spawn";
      spawn.disabled = true;
      actions.appendChild(spawn);

      const reset = document.createElement("button");
      reset.className = "btn btn-ghost";
      reset.textContent = "Reset state";
      reset.dataset.action = "reset";
      reset.disabled = true;
      actions.appendChild(reset);

      const kill = document.createElement("button");
      kill.className = "btn btn-ghost";
      kill.textContent = "Kill";
      kill.dataset.action = "kill";
      kill.disabled = true;
      actions.appendChild(kill);
    }
    if (ch.signer?.enabled) {
      const b = document.createElement("button");
      b.className = "btn btn-ghost";
      b.textContent = ch.signer.label ?? "Get signature";
      b.dataset.action = "sign";
      b.disabled = true;
      actions.appendChild(b);
    }
    const claim = document.createElement("button");
    claim.className = "btn";
    claim.textContent = "Claim flag";
    claim.dataset.action = "claim";
    claim.disabled = true;
    actions.appendChild(claim);

    article.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "sign") return handleSign(ch.id, article);
      if (action === "claim") return handleClaim(ch.id, article);
      if (action === "spawn") return handleSpawn(ch.id, article);
      if (action === "kill") return handleKill(ch.id, article);
      if (action === "reset") return handleReset(ch.id, article);
    });

    article.addEventListener("click", (ev) => {
      const copyBtn = ev.target.closest(".receipt-copy");
      if (!copyBtn) return;
      const v = $(".receipt-value", article).textContent;
      navigator.clipboard.writeText(v).then(
        () => toast("copied"),
        () => toast("clipboard blocked"),
      );
    });

    wireWriteup(article, ch.id);

    root.appendChild(node);
    startPolling(ch.id, article);
  }

  refreshButtons();
}

function setStatus(card, solved) {
  const el = $(".status", card);
  el.classList.toggle("status-solved", !!solved);
  el.classList.toggle("status-pending", !solved);
  el.textContent = solved ? "solved" : "pending";
  $$('button[data-action="claim"]', card).forEach(b => b.disabled = !state.player || !solved);
  const wb = $(".writeup", card);
  if (wb) {
    const id = card.dataset.id;
    const key = `writeup:${id}:${state.player ?? ""}`;
    const alreadySubmitted = state.player && localStorage.getItem(key) === "1";
    wb.hidden = !solved || alreadySubmitted;
  }
}

function startPolling(id, card) {
  const tick = async () => {
    if (!state.player) {
      setStatus(card, false);
      return;
    }
    try {
      const r = await api(`/api/status/${id}?address=${state.player}`);
      setStatus(card, !!r.solved);
      if (r.instance) renderInstance(card, r.instance);
      else if (card.dataset.mode === "private-anvil") clearInstance(card);
    } catch (e) {}
  };
  tick();
  const handle = setInterval(tick, 7_000);
  state.pollers.set(id, handle);
}

function absoluteRpcUrl(u) {
  if (!u) return u;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${location.origin}${u}`;
  return u;
}

function renderInstance(card, inst) {
  const box = $(".instance", card);
  const ul = $(".instance-fields", card);
  ul.innerHTML = "";
  const fullRpc = absoluteRpcUrl(inst.rpcUrl);
  const rows = [
    ["RPC URL", fullRpc],
    ["Target", inst.target],
    ["Expires at", new Date(inst.expiresAt * 1000).toLocaleString()],
  ];
  if (inst.mode) rows.unshift(["Mode", inst.mode]);
  for (const [k, v] of Object.entries(inst.extra ?? {})) rows.push([k, String(v)]);
  for (const [label, val] of rows) {
    const li = document.createElement("li");
    const b = document.createElement("b"); b.textContent = label;
    const span = document.createElement("span"); span.className = "val mono"; span.textContent = val;
    li.append(b, span);
    ul.appendChild(li);
  }
  box.hidden = false;

  let helpers = $(".instance-helpers", box);
  if (!helpers) {
    helpers = document.createElement("div");
    helpers.className = "instance-helpers";
    box.appendChild(helpers);
  }
  helpers.innerHTML = "";

  const addBtn = document.createElement("button");
  addBtn.className = "btn btn-mini";
  addBtn.textContent = "Add network to wallet";
  addBtn.addEventListener("click", () => addInstanceNetworkToWallet(inst, fullRpc));
  helpers.appendChild(addBtn);

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn btn-mini btn-ghost";
  copyBtn.textContent = "Copy RPC URL";
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(fullRpc).then(() => toast("copied"));
  });
  helpers.appendChild(copyBtn);

  $('button[data-action="spawn"]', card)?.setAttribute("disabled", "");
  $('button[data-action="kill"]', card)?.removeAttribute("disabled");
  $('button[data-action="reset"]', card)?.removeAttribute("disabled");
}

async function addInstanceNetworkToWallet(inst, fullRpc) {
  if (!window.ethereum) return toast("no wallet detected");
  const chainIdHex = "0x" + (31337).toString(16);
  const chainName = `ctf-${inst.instanceId.slice(0, 8)}`;
  try {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chainIdHex,
        chainName,
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: [fullRpc],
      }],
    });
    toast("network added");
  } catch (e) {
    toast(`add network failed: ${e.message ?? e}`);
  }
}

function clearInstance(card) {
  $(".instance", card).hidden = true;
  $('button[data-action="spawn"]', card)?.removeAttribute("disabled");
  $('button[data-action="kill"]', card)?.setAttribute("disabled", "");
  $('button[data-action="reset"]', card)?.setAttribute("disabled", "");
}

async function handleSpawn(id, card) {
  if (!state.player) return toast("connect a wallet first");
  const btn = $('button[data-action="spawn"]', card);
  btn.disabled = true; btn.textContent = "Spawning…";
  try {
    const r = await api(`/api/launch/${id}?address=${state.player}`, { method: "POST" });
    renderInstance(card, r.instance);
    toast("instance ready");
  } catch (e) {
    toast(`spawn failed: ${e.message}`);
    btn.disabled = false;
  } finally {
    btn.textContent = "Spawn instance";
  }
}

async function handleKill(id, card) {
  if (!state.player) return;
  try {
    await api(`/api/kill/${id}?address=${state.player}`, { method: "POST" });
    clearInstance(card);
    toast("instance killed");
  } catch (e) {
    toast(`kill failed: ${e.message}`);
  }
}

function wireWriteup(card, id) {
  const wb = $(".writeup", card);
  if (!wb) return;
  const ta = $(".writeup-textarea", wb);
  const counter = $(".writeup-counter", wb);
  const submit  = $(".writeup-submit",  wb);
  const status  = $(".writeup-status",  wb);
  const signCb  = $(".writeup-sign-cb", wb);
  const update = () => { counter.textContent = `${ta.value.length} / 4096`; };
  ta.addEventListener("input", update);
  update();

  submit.addEventListener("click", async () => {
    if (!state.player) return toast("connect a wallet first");
    const writeup = ta.value.trim();
    if (!writeup) return toast("writeup is empty");
    submit.disabled = true;
    status.hidden = true;
    try {
      const body = { writeup };
      if (signCb.checked || state.config?.writeupRequireSignature) {
        if (!state.walletProvider) throw new Error("wallet not connected");
        const timestamp = Date.now();
        const bodyHash = ethers.keccak256(ethers.toUtf8Bytes(writeup));
        const msg = `ctf-writeup\n${id}\n${state.player}\n${timestamp}\n${bodyHash}`;
        const signer = await state.walletProvider.getSigner();
        const signature = await signer.signMessage(msg);
        body.timestamp = timestamp;
        body.signature = signature;
      }
      const r = await api(`/api/writeup/${id}?address=${state.player}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      localStorage.setItem(`writeup:${id}:${state.player}`, "1");
      status.textContent = `accepted (${r.bytes} bytes${r.signed ? ", signed" : ""})`;
      status.hidden = false;
      ta.disabled = true;
      submit.style.display = "none";
    } catch (e) {
      status.textContent = `failed: ${e.message ?? e}`;
      status.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
}

async function handleReset(id, card) {
  if (!state.player) return;
  const btn = $('button[data-action="reset"]', card);
  btn.disabled = true; btn.textContent = "Resetting…";
  try {
    await api(`/api/reset/${id}?address=${state.player}`, { method: "POST" });
    toast("state reset to post-deploy snapshot");
  } catch (e) {
    toast(`reset failed: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Reset state";
  }
}

async function handleSign(id, card) {
  if (!state.player) return toast("connect a wallet first");
  try {
    const r = await api(`/api/sign/${id}?address=${state.player}`);
    const box = $(".receipt", card);
    $(".receipt-value", card).textContent = r.signature;
    box.hidden = false;
  } catch (e) {
    toast(`sign failed: ${e.message}`);
  }
}

async function handleClaim(id, card) {
  if (!state.player) return toast("connect a wallet first");
  try {
    const r = await api(`/api/flag/${id}?address=${state.player}`);
    if (!r.solved) return toast("not solved yet — keep going");
    $(".flag-value", card).textContent = r.flag;
    $(".flag", card).hidden = false;
    toast("flag claimed");
  } catch (e) {
    toast(`claim failed: ${e.message}`);
  }
}

function refreshButtons() {
  const connected = !!state.player;
  $$(".card").forEach(card => {
    const hasInstance = !$(".instance", card).hidden;
    $$("button[data-action]", card).forEach(b => {
      const a = b.dataset.action;
      if (a === "sign")  b.disabled = !connected;
      if (a === "spawn") b.disabled = !connected || hasInstance;
      if (a === "kill")  b.disabled = !connected || !hasInstance;
      if (a === "reset") b.disabled = !connected || !hasInstance;
      if (a === "claim") {
        const solved = $(".status", card).classList.contains("status-solved");
        b.disabled = !connected || !solved;
      }
    });
  });
}

async function connect() {
  if (!window.ethereum) return toast("no injected wallet detected");
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    state.player = ethers.getAddress(accounts[0]);
    state.walletProvider = new ethers.BrowserProvider(window.ethereum);
    await ensureChain();
    $("#walletAddr").textContent = shortAddr(state.player);
    $("#walletNet").textContent = state.config.site?.chainName ?? `chain ${state.config.chainId}`;
    $("#walletInfo").hidden = false;
    $("#connectBtn").hidden = true;
    refreshButtons();
    for (const id of [...state.pollers.keys()]) {
      clearInterval(state.pollers.get(id));
      const card = document.querySelector(`.card[data-id="${id}"]`);
      if (card) startPolling(id, card);
    }
    refreshBalance();
  } catch (e) {
    toast(`connect failed: ${e.message ?? e}`);
  }
}

async function refreshBalance() {
  if (!state.player || !state.readProvider) return;
  try {
    const bal = await state.readProvider.getBalance(state.player);
    const eth = Number(ethers.formatEther(bal));
    $("#balanceLabel").textContent = `${eth.toFixed(4)} ETH`;
    $("#balanceKv").hidden = false;
    const thresholdRaw = state.config.site?.lowBalanceThresholdEth ?? "0.005";
    const threshold = Number(thresholdRaw);
    const faucets = state.config.site?.faucets ?? [];
    if (eth < threshold && faucets.length > 0) {
      renderFaucetBanner(eth, threshold, faucets);
    } else {
      $("#faucetBanner").hidden = true;
    }
  } catch {}
}

function renderFaucetBanner(currentEth, thresholdEth, faucets) {
  const banner = $("#faucetBanner");
  $("#faucetBannerBalance").textContent =
    `Your balance ${currentEth.toFixed(4)} ETH is below the ${thresholdEth} ETH gas threshold.`;
  const links = $("#faucetLinks");
  links.innerHTML = "";
  for (const f of faucets) {
    const a = document.createElement("a");
    a.href = f.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = f.label;
    links.appendChild(a);
  }
  banner.hidden = false;
}

async function ensureChain() {
  const want = state.config.chainId;
  const cur = Number(await window.ethereum.request({ method: "eth_chainId" }));
  if (cur === want) return;
  const chainIdHex = "0x" + want.toString(16);
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (e) {
    // 4902 = unrecognized chain. EIP-3085: add it, then the wallet
    // typically switches automatically.
    if (e?.code === 4902 || /Unrecognized chain/i.test(e?.message ?? "")) {
      const site = state.config.site ?? {};
      const symbol = site.nativeSymbol ?? "ETH";
      const explorer = site.blockExplorer ? [site.blockExplorer] : undefined;
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: chainIdHex,
            chainName: site.chainName ?? `chain ${want}`,
            nativeCurrency: { name: symbol, symbol, decimals: 18 },
            rpcUrls: [state.config.rpcUrl],
            blockExplorerUrls: explorer,
          }],
        });
        return;
      } catch (addErr) {
        toast(`add network failed: ${addErr.message ?? addErr}`);
        throw addErr;
      }
    }
    toast(`please switch wallet to chain ${want}`);
    throw e;
  }
}

async function disconnect() {
  state.player = null;
  $("#walletInfo").hidden = true;
  $("#connectBtn").hidden = false;
  $("#balanceKv").hidden = true;
  $("#faucetBanner").hidden = true;
  $$(".card .flag").forEach(b => b.hidden = true);
  $$(".card .receipt").forEach(b => b.hidden = true);
  refreshButtons();
  try {
    await window.ethereum?.request?.({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {}
}

window.addEventListener("DOMContentLoaded", () => {
  $("#connectBtn").addEventListener("click", connect);
  $("#disconnectBtn").addEventListener("click", disconnect);
  if (window.ethereum) {
    window.ethereum.on?.("accountsChanged", (accs) => {
      if (accs.length === 0) disconnect();
      else { state.player = ethers.getAddress(accs[0]); $("#walletAddr").textContent = shortAddr(state.player); refreshButtons(); }
    });
    window.ethereum.on?.("chainChanged", () => location.reload());
  }
  loadConfig().then(() => refreshScoreboard()).catch(e => {
    $("#cards").innerHTML = `<div class="loading">failed to load config: ${e.message}</div>`;
  });
});
