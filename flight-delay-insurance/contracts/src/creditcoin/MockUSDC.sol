// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDC
/// @notice A minimal 6-decimal testnet stablecoin standing in for USDC, used for premiums
/// and payouts. Not a production token — no supply cap enforcement, owner can mint freely.
contract MockUSDC is ERC20, Ownable {
    constructor() ERC20("Mock USD Coin", "mUSDC") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Faucet-style mint for hackathon testing. Owner-gated so it isn't wide open,
    /// but trivially permissive by production standards.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
