import { test } from "node:test";
import assert from "node:assert/strict";
import { isRpcMethodAllowed } from "../rpc-allow.js";

test("allows core eth namespaces", () => {
  for (const m of ["eth_blockNumber", "eth_call", "eth_sendRawTransaction",
                   "net_version", "web3_clientVersion"]) {
    assert.equal(isRpcMethodAllowed(m), true, m);
  }
});

test("allows anvil/evm/debug helpers", () => {
  for (const m of ["anvil_setBalance", "evm_increaseTime", "debug_traceTransaction"]) {
    assert.equal(isRpcMethodAllowed(m), true, m);
  }
});

test("denies personal_/miner_/admin_/txpool_", () => {
  for (const m of ["personal_sign", "personal_unlockAccount", "miner_start",
                   "admin_addPeer", "txpool_content"]) {
    assert.equal(isRpcMethodAllowed(m), false, m);
  }
});

test("denies unknown namespaces", () => {
  for (const m of ["foo_bar", "eth", "rpc_doStuff", ""]) {
    assert.equal(isRpcMethodAllowed(m), false, m);
  }
});

test("rejects non-string input", () => {
  for (const m of [null, undefined, 0, 42, {}, ["eth_call"]]) {
    assert.equal(isRpcMethodAllowed(m), false);
  }
});
