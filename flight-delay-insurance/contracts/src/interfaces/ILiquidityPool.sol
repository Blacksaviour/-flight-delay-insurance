// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Minimal interface so PolicyManager (on Creditcoin) can call into LiquidityPool
/// without importing the full contract. This keeps the two contracts decoupled and lets
/// PolicyManager treat the pool as a black box: deposit stablecoin for premiums, notify
/// the pool, and pull funds out for payouts.
interface ILiquidityPool {
    /// @notice Inform the pool that `amount` of stablecoin was transferred to it as a premium.
    /// The caller (PolicyManager) must have already transferred the funds before calling this.
    function notifyPremiumReceived(uint256 amount) external;

    /// @notice Pay `amount` of stablecoin from the pool's balance to `to`.
    /// Only the registered PolicyManager may call this.
    function payOut(address to, uint256 amount) external;
}
