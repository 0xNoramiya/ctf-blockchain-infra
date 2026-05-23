// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/console2.sol";

/// Emits the `CTF_META={...}` line the private-anvil launcher captures
/// from container stdout. Use inside a forge `Script.run()` after deploy.
///
/// Example:
///     CtfMeta.emit_(address(ch), abi.encodePacked(
///         '"vault":"', vm.toString(address(v)), '"'
///     ));
library CtfMeta {
    function emit_(address target) internal pure {
        console2.log(string.concat(
            "CTF_META={\"target\":\"",
            _toHex(target),
            "\"}"
        ));
    }

    /// Emit `target` plus a freeform `extra` object body (key/value
    /// pairs concatenated as `"k":"v"`, comma-separated; you assemble).
    function emit_(address target, bytes memory extraBody) internal pure {
        if (extraBody.length == 0) { emit_(target); return; }
        console2.log(string.concat(
            "CTF_META={\"target\":\"",
            _toHex(target),
            "\",\"extra\":{",
            string(extraBody),
            "}}"
        ));
    }

    function _toHex(address a) private pure returns (string memory) {
        bytes20 b = bytes20(a);
        bytes memory s = new bytes(42);
        bytes16 alphabet = 0x30313233343536373839616263646566; // "0123456789abcdef"
        s[0] = "0"; s[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            s[2 + i*2]     = alphabet[uint8(b[i]) >> 4];
            s[2 + i*2 + 1] = alphabet[uint8(b[i]) & 0x0f];
        }
        return string(s);
    }
}
