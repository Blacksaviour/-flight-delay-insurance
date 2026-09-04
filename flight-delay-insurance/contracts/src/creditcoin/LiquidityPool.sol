// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title LiquidityPool
/// @notice DeFi-track extension. LPs deposit stablecoin and receive LP tokens representing a
/// pro-rata claim on the pool. Premiums from PolicyManager flow in; payouts flow out. LP token
/// value rises as premiums accumulate and falls when payouts are made, so depositors are
/// implicitly underwriting policy risk in exchange for premium yield.
///
/// MVP SCOPE: single undifferentiated pool, no risk tranching. Tranches (senior/junior) are a
/// stretch goal noted in the PRD, not implemented here.
contract LiquidityPool is ERC20, Ownable, ReentrancyGuard {
    IERC20 public immutable STABLECOIN;

    /// @notice The only address allowed to pull funds out for payouts (the PolicyManager).
    address public policyManager;

    error ZeroAddress();
    error ZeroAmount();
    error NotPolicyManager(address caller);
    error InsufficientPoolLiquidity(uint256 requested, uint256 available);

    event PolicyManagerSet(address indexed policyManager);
    event Deposited(address indexed provider, uint256 stableAmount, uint256 lpMinted);
    event Withdrawn(address indexed provider, uint256 lpBurned, uint256 stableAmount);
    event PremiumReceived(uint256 amount);
    event PayoutSent(address indexed to, uint256 amount);

    modifier onlyPolicyManager() {
        if (msg.sender != policyManager) revert NotPolicyManager(msg.sender);
        _;
    }

    constructor(IERC20 stablecoin) ERC20("Insurance Pool LP Token", "ipLP") Ownable(msg.sender) {
        if (address(stablecoin) == address(0)) revert ZeroAddress();
        STABLECOIN = stablecoin;
    }

    /// @notice One-time wiring: point this pool at the PolicyManager that's allowed to pull
    /// premiums in and payouts out.
    function setPolicyManager(address _policyManager) external onlyOwner {
        if (_policyManager == address(0)) revert ZeroAddress();
        policyManager = _policyManager;
        emit PolicyManagerSet(_policyManager);
    }

    /// @notice Deposit stablecoin, receive LP tokens proportional to your share of the pool's
    /// current stablecoin balance. First depositor mints 1:1.
    function deposit(uint256 amount) external nonReentrant returns (uint256 lpMinted) {
        if (amount == 0) revert ZeroAmount();

        uint256 poolBalanceBefore = STABLECOIN.balanceOf(address(this));
        uint256 supply = totalSupply();

        lpMinted = supply == 0 ? amount : (amount * supply) / poolBalanceBefore;

        bool ok = STABLECOIN.transferFrom(msg.sender, address(this), amount);
        require(ok, "Deposit transfer failed");

        _mint(msg.sender, lpMinted);
        emit Deposited(msg.sender, amount, lpMinted);
    }

    /// @notice Burn LP tokens for your pro-rata share of the pool's current stablecoin balance.
    function withdraw(uint256 lpAmount) external nonReentrant returns (uint256 stableAmount) {
        if (lpAmount == 0) revert ZeroAmount();

        uint256 supply = totalSupply();
        uint256 currentPoolBalance = STABLECOIN.balanceOf(address(this));
        stableAmount = (lpAmount * currentPoolBalance) / supply;

        _burn(msg.sender, lpAmount);

        bool ok = STABLECOIN.transfer(msg.sender, stableAmount);
        require(ok, "Withdraw transfer failed");

        emit Withdrawn(msg.sender, lpAmount, stableAmount);
    }

    /// @notice Called by PolicyManager when a policy premium should be added to the pool.
    /// PolicyManager must have already transferred `amount` of stablecoin to this contract
    /// before calling this (this function only emits/accounts; it does not pull funds).
    function notifyPremiumReceived(uint256 amount) external onlyPolicyManager {
        emit PremiumReceived(amount);
    }

    /// @notice Called by PolicyManager to pay out a triggered policy directly from pool funds.
    function payOut(address to, uint256 amount) external onlyPolicyManager nonReentrant {
        uint256 available = STABLECOIN.balanceOf(address(this));
        if (amount > available) revert InsufficientPoolLiquidity(amount, available);

        bool ok = STABLECOIN.transfer(to, amount);
        require(ok, "Payout transfer failed");

        emit PayoutSent(to, amount);
    }

    /// @notice Current stablecoin backing the pool.
    function poolBalance() external view returns (uint256) {
        return STABLECOIN.balanceOf(address(this));
    }

    /// @notice Current redeemable value of 1 LP token, scaled by 1e18 for precision.
    function lpTokenValue() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 1e18;
        return (STABLECOIN.balanceOf(address(this)) * 1e18) / supply;
    }
}
