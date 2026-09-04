// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {LiquidityPool} from "../src/creditcoin/LiquidityPool.sol";
import {MockUSDC} from "../src/creditcoin/MockUSDC.sol";

contract LiquidityPoolTest is Test {
    LiquidityPool pool;
    MockUSDC usdc;

    address lp1 = makeAddr("lp1");
    address lp2 = makeAddr("lp2");
    address fakePolicyManager = makeAddr("fakePolicyManager");
    address claimant = makeAddr("claimant");

    function setUp() public {
        usdc = new MockUSDC();
        pool = new LiquidityPool(usdc);
        pool.setPolicyManager(fakePolicyManager);

        usdc.mint(lp1, 1_000e6);
        usdc.mint(lp2, 1_000e6);

        vm.prank(lp1);
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(lp2);
        usdc.approve(address(pool), type(uint256).max);
    }

    function test_firstDeposit_mintsOneToOne() public {
        vm.prank(lp1);
        uint256 minted = pool.deposit(100e6);
        assertEq(minted, 100e6);
        assertEq(pool.balanceOf(lp1), 100e6);
        assertEq(pool.poolBalance(), 100e6);
    }

    function test_secondDeposit_mintsProRata() public {
        vm.prank(lp1);
        pool.deposit(100e6);

        // Simulate a premium/yield event growing the pool without minting LP tokens, so
        // lp2's deposit should mint proportionally fewer LP tokens per stablecoin.
        vm.prank(lp1);
        usdc.transfer(address(pool), 100e6); // pool now holds 200 for 100 LP outstanding

        vm.prank(lp2);
        uint256 minted = pool.deposit(100e6);
        // pool had 200 stable / 100 LP supply before this deposit -> 0.5 LP per stable
        assertEq(minted, 50e6);
    }

    function test_withdraw_returnsProRataShare() public {
        vm.prank(lp1);
        pool.deposit(100e6);

        vm.prank(lp1);
        uint256 returned = pool.withdraw(100e6);
        assertEq(returned, 100e6);
        assertEq(pool.balanceOf(lp1), 0);
    }

    function test_payOut_onlyPolicyManager() public {
        vm.prank(lp1);
        pool.deposit(100e6);

        vm.prank(lp1); // not the registered policy manager
        vm.expectRevert(abi.encodeWithSelector(LiquidityPool.NotPolicyManager.selector, lp1));
        pool.payOut(claimant, 50e6);
    }

    function test_payOut_transfersFromPool() public {
        vm.prank(lp1);
        pool.deposit(100e6);

        vm.prank(fakePolicyManager);
        pool.payOut(claimant, 50e6);

        assertEq(usdc.balanceOf(claimant), 50e6);
        assertEq(pool.poolBalance(), 50e6);
    }

    function test_payOut_revertsWhenInsufficientLiquidity() public {
        vm.prank(lp1);
        pool.deposit(100e6);

        vm.prank(fakePolicyManager);
        vm.expectRevert(abi.encodeWithSelector(LiquidityPool.InsufficientPoolLiquidity.selector, 200e6, 100e6));
        pool.payOut(claimant, 200e6);
    }
}
