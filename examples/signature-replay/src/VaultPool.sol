// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IChallenge} from "@infra/IChallenge.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// Vault holding a large reserve of token. An off-chain signer issues
/// authorization "receipts" that let the recipient withdraw a fixed
/// amount. The verifier checks the signature recovers to the signer and
/// the caller matches the receipt's recipient. That's it.
///
/// The bug, also see Taiko TimelockTokenPool H-05 finding (Solodit):
///   - no nonce / consumed-sig flag
///   - no deadline / expiry
/// → one valid signature is reusable forever.
contract VaultPool is IChallenge {
    address public immutable signer;
    IERC20 public immutable token;

    uint256 public constant AUTHORIZED_AMOUNT = 100 ether;
    uint256 public constant SOLVE_THRESHOLD = 1000 ether;

    constructor(address _signer, IERC20 _token) {
        signer = _signer;
        token = _token;
    }

    function withdraw(address to, uint256 amount, bytes calldata sig) external {
        require(msg.sender == to, "only recipient");
        bytes32 inner = keccak256(abi.encodePacked("Withdraw", to, amount));
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
        require(_recover(digest, sig) == signer, "bad sig");
        require(amount == AUTHORIZED_AMOUNT, "tf");
        require(token.transfer(to, amount), "tf");
    }

    function isSolved(address who) external view returns (bool) {
        return token.balanceOf(who) >= SOLVE_THRESHOLD;
    }

    function _recover(bytes32 d, bytes calldata s) private pure returns (address) {
        if (s.length != 65) return address(0);
        bytes32 r;
        bytes32 vs;
        uint8 v;
        assembly {
            r := calldataload(s.offset)
            vs := calldataload(add(s.offset, 32))
            v := shr(248, calldataload(add(s.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(d, v, r, vs);
    }
}
