export const RPC_ALLOWED_PREFIXES = ["eth_", "net_", "web3_", "anvil_", "evm_", "debug_"];
export const RPC_DENYLIST = new Set([
  "personal_sign", "personal_sendTransaction", "personal_unlockAccount",
  "miner_start", "miner_stop",
  "admin_addPeer", "admin_removePeer",
  "txpool_content",
]);

export function isRpcMethodAllowed(method) {
  if (typeof method !== "string") return false;
  if (RPC_DENYLIST.has(method)) return false;
  return RPC_ALLOWED_PREFIXES.some(p => method.startsWith(p));
}
