#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRequire = createRequire(path.join(__dirname, "..", "backend", "package.json"));
let ethers;
try {
  const ethersMain = backendRequire.resolve("ethers");
  ({ ethers } = await import(pathToFileURL(ethersMain).href));
} catch (e) {
  console.error("error: ethers not found via backend/node_modules.");
  console.error("       run `cd backend && npm install` first.");
  process.exit(1);
}

function parseArgs(argv) {
  const opt = { dry: false, amount: "0.02", min: "0.005", rpc: null };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opt.dry = true;
    else if (a === "--amount") opt.amount = argv[++i];
    else if (a === "--min")    opt.min = argv[++i];
    else if (a === "--rpc")    opt.rpc = argv[++i];
    else pos.push(a);
  }
  return { pos, opt };
}

const { pos, opt } = parseArgs(process.argv.slice(2));
if (pos.length === 0) {
  console.error("usage: seed-faucet.js <addresses-file> [--amount 0.02] [--min 0.005]");
  process.exit(1);
}

const addressesPath = pos[0];
if (!fs.existsSync(addressesPath)) {
  console.error(`addresses file not found: ${addressesPath}`);
  process.exit(1);
}

const rawLines = fs.readFileSync(addressesPath, "utf8").split("\n");
const addresses = [];
const seen = new Set();
for (const line of rawLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const tok = trimmed.split(/[,\s]+/).find(t => t.toLowerCase().startsWith("0x"));
  if (!tok) continue;
  let addr;
  try { addr = ethers.getAddress(tok); }
  catch { console.error(`skip: not an address: ${tok}`); continue; }
  if (seen.has(addr)) continue;
  seen.add(addr);
  addresses.push(addr);
}

if (addresses.length === 0) {
  console.error("no addresses found");
  process.exit(1);
}

const RPC = opt.rpc ?? process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const provider = new ethers.JsonRpcProvider(RPC);

const wantWei = ethers.parseEther(opt.amount);
const minWei  = ethers.parseEther(opt.min);

if (opt.dry) {
  console.log(`DRY RUN — would send ${opt.amount} ETH to each of ${addresses.length} address(es)`);
  for (const a of addresses) {
    const bal = await provider.getBalance(a);
    const need = bal < minWei;
    console.log(`  ${a}  bal=${ethers.formatEther(bal)}  ${need ? "→ send" : "skip"}`);
  }
  process.exit(0);
}

if (!process.env.FAUCET_KEY) {
  console.error("FAUCET_KEY env not set (operator funding key)");
  process.exit(1);
}

const wallet = new ethers.Wallet(process.env.FAUCET_KEY, provider);
console.log(`operator: ${wallet.address}`);
const opBal = await provider.getBalance(wallet.address);
console.log(`operator balance: ${ethers.formatEther(opBal)} ETH`);
if (opBal < wantWei * BigInt(addresses.length)) {
  console.error(`operator likely under-funded for ${addresses.length} × ${opt.amount} ETH`);
  process.exit(1);
}

let nonce = await wallet.getNonce();
let sent = 0, skipped = 0, failed = 0;

for (const to of addresses) {
  try {
    const bal = await provider.getBalance(to);
    if (bal >= minWei) {
      console.log(`skip ${to}: bal ${ethers.formatEther(bal)} >= ${opt.min}`);
      skipped++;
      continue;
    }
    const tx = await wallet.sendTransaction({ to, value: wantWei, nonce: nonce++ });
    console.log(`send ${to}: ${tx.hash}`);
    sent++;
  } catch (e) {
    console.error(`fail ${to}: ${e.shortMessage ?? e.message ?? e}`);
    failed++;
  }
}

console.log(`\ndone. sent=${sent} skipped=${skipped} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
