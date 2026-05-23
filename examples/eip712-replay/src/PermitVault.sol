// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// EIP-712 permit-style vault. A trusted signer issues typed-data
/// authorizations to withdraw a fixed amount; the caller submits the
/// signature on-chain to redeem.
///
/// Bug: the Permit struct doesn't include a nonce. EIP-712 protects
/// against malleability and gives nice wallet UX, but it does NOT
/// auto-prevent replay — the *type* and the *struct content* together
/// determine the digest, and if the struct content doesn't change per
/// use, the same digest is valid forever.
///
/// Mitigation in production: include `uint256 nonce` in the Permit
/// struct, track `mapping(address => uint256) nonces` on-chain, and
/// increment after each use. The OpenZeppelin ERC20Permit reference
/// implementation is the canonical pattern.
contract PermitVault {
    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant PERMIT_TYPEHASH = keccak256(
        "Permit(address spender,uint256 amount,uint256 deadline)"
    );

    address public immutable signer;
    IERC20  public immutable token;

    uint256 public constant AUTHORIZED_AMOUNT = 100 ether;
    uint256 public constant SOLVE_THRESHOLD   = 1000 ether;

    constructor(address _signer, IERC20 _token) {
        signer = _signer;
        token  = _token;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("PermitVault"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    function permit(uint256 amount, uint256 deadline, bytes calldata sig) external {
        require(block.timestamp <= deadline, "expired");
        require(amount == AUTHORIZED_AMOUNT, "amount");

        bytes32 structHash = keccak256(abi.encode(
            PERMIT_TYPEHASH,
            msg.sender,           // spender == caller
            amount,
            deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        require(_recover(digest, sig) == signer, "bad sig");

        require(token.transfer(msg.sender, amount), "tf");
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
            r  := calldataload(s.offset)
            vs := calldataload(add(s.offset, 32))
            v  := shr(248, calldataload(add(s.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(d, v, r, vs);
    }
}
