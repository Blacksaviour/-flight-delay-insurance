// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {PolicyManager} from "../src/creditcoin/PolicyManager.sol";
import {LiquidityPool} from "../src/creditcoin/LiquidityPool.sol";
import {MockUSDC} from "../src/creditcoin/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {INativeQueryVerifier} from "../src/vendor/VerifierInterface.sol";
import {MockNativeQueryVerifier} from "./mocks/MockNativeQueryVerifier.sol";
import {EvmV1Fixtures} from "./helpers/EvmV1Fixtures.sol";

contract PolicyManagerTest is Test {
    address constant PRECOMPILE_ADDRESS = 0x0000000000000000000000000000000000000FD2;
    bytes32 constant DELAY_EVENT_SIGNATURE = keccak256("FlightDelayReported(uint256,uint256)");

    PolicyManager policyManager;
    LiquidityPool liquidityPool;
    MockUSDC usdc;
    MockNativeQueryVerifier mockVerifier;

    address owner = address(this);
    address alice = makeAddr("alice");
    address sourceReporter = makeAddr("sourceReporter"); // stands in for FlightDelayReporter on Sepolia

    uint256 constant PREMIUM = 10e6; // 10 mUSDC
    uint256 constant PAYOUT = 200e6; // 200 mUSDC
    uint256 constant THRESHOLD_MINUTES = 120;

    function setUp() public {
        // Deploy the mock verifier's code, then place it at the real precompile address so
        // PolicyManager's inherited VERIFIER (bound to 0x0FD2 at construction) calls our mock.
        mockVerifier = new MockNativeQueryVerifier();
        vm.etch(PRECOMPILE_ADDRESS, address(mockVerifier).code);
        // vm.etch only copies runtime bytecode, not storage. The freshly-etched address starts
        // with all storage slots zeroed, so `nextResult` defaults to false until set explicitly.
        MockNativeQueryVerifier(PRECOMPILE_ADDRESS).setNextResult(true);

        usdc = new MockUSDC();
        liquidityPool = new LiquidityPool(IERC20(address(usdc)));
        policyManager = new PolicyManager(usdc);
        policyManager.registerSourceReporter(sourceReporter);

        // Wire the LiquidityPool into PolicyManager (DeFi-track integration).
        policyManager.setLiquidityPool(address(liquidityPool));
        liquidityPool.setPolicyManager(address(policyManager));

        // Fund alice and seed the pool with enough liquidity to cover payouts that exceed
        // the premium collected (PREMIUM < PAYOUT in _purchase()).
        usdc.mint(alice, 1_000e6);
        usdc.mint(owner, 1_000e6);
        usdc.mint(address(liquidityPool), 1_000e6); // pre-seed LP capital

        vm.prank(alice);
        usdc.approve(address(policyManager), type(uint256).max);
    }

    function _purchase() internal returns (uint256 policyId) {
        vm.prank(alice);
        policyId = policyManager.purchasePolicy(THRESHOLD_MINUTES, PAYOUT, PREMIUM);
    }

    function _submitProof(uint256 policyId, uint256 delayMinutes, uint64 chainKey, uint64 blockHeight) internal {
        bytes memory encodedTx =
            EvmV1Fixtures.buildDelayReportTx(sourceReporter, policyId, delayMinutes, DELAY_EVENT_SIGNATURE);

        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](1);
        siblings[0] = INativeQueryVerifier.MerkleProofEntry({hash: keccak256("sibling"), isLeft: true});

        bytes32[] memory continuityRoots = new bytes32[](1);
        continuityRoots[0] = keccak256("root");

        policyManager.execute(
            uint8(PolicyManager.PolicyAction.SettleDelay),
            chainKey,
            blockHeight,
            encodedTx,
            keccak256("merkleRoot"),
            siblings,
            keccak256("lowerEndpoint"),
            continuityRoots
        );
    }

    // ---------- purchasePolicy ----------

    function test_purchasePolicy_pullsPremiumAndStoresPolicy() public {
        uint256 aliceBalanceBefore = usdc.balanceOf(alice);
        uint256 poolBalanceBefore = usdc.balanceOf(address(liquidityPool));

        uint256 policyId = _purchase();

        assertEq(policyId, 0);
        assertEq(usdc.balanceOf(alice), aliceBalanceBefore - PREMIUM);
        // Premium flows to the LiquidityPool, not PolicyManager itself.
        assertEq(usdc.balanceOf(address(liquidityPool)), poolBalanceBefore + PREMIUM);

        PolicyManager.Policy memory policy = policyManager.getPolicy(policyId);
        assertEq(policy.policyholder, alice);
        assertEq(policy.thresholdMinutes, THRESHOLD_MINUTES);
        assertEq(policy.payoutAmount, PAYOUT);
        assertEq(uint8(policy.status), uint8(PolicyManager.PolicyStatus.Active));
    }

    function test_purchasePolicy_incrementsPolicyIds() public {
        uint256 first = _purchase();
        uint256 second = _purchase();
        assertEq(first, 0);
        assertEq(second, 1);
    }

    function test_purchasePolicy_revertsOnZeroPayout() public {
        vm.prank(alice);
        vm.expectRevert(PolicyManager.ZeroAmount.selector);
        policyManager.purchasePolicy(THRESHOLD_MINUTES, 0, PREMIUM);
    }

    function test_purchasePolicy_revertsWhenLiquidityPoolNotRegistered() public {
        PolicyManager freshManager = new PolicyManager(usdc);
        freshManager.registerSourceReporter(sourceReporter);

        vm.prank(alice);
        vm.expectRevert(PolicyManager.LiquidityPoolNotRegistered.selector);
        freshManager.purchasePolicy(THRESHOLD_MINUTES, PAYOUT, PREMIUM);
    }

    function test_setLiquidityPool_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        policyManager.setLiquidityPool(makeAddr("somePool"));
    }

    // ---------- settle: triggered payout ----------

    function test_settle_paysOutWhenDelayExceedsThreshold() public {
        // Premium == payout here purely so the pool is self-covering for this single policy,
        // avoiding any need to fake pool accounting. In a real deployment the pool would be
        // backed by many policies' premiums (and/or LiquidityPool LP capital), so premium
        // would be a small fraction of the payout, not equal to it.
        vm.prank(alice);
        uint256 policyId = policyManager.purchasePolicy(THRESHOLD_MINUTES, PAYOUT, PAYOUT);

        uint256 aliceBalanceBefore = usdc.balanceOf(alice);
        uint256 poolBalanceBefore = usdc.balanceOf(address(liquidityPool));

        _submitProof(policyId, 180, 1, 100);

        PolicyManager.Policy memory policy = policyManager.getPolicy(policyId);
        assertEq(uint8(policy.status), uint8(PolicyManager.PolicyStatus.Paid));
        assertEq(usdc.balanceOf(alice), aliceBalanceBefore + PAYOUT);
        // Payout is pulled from the LiquidityPool, so its balance drops by the payout amount.
        assertEq(usdc.balanceOf(address(liquidityPool)), poolBalanceBefore - PAYOUT);
    }

    function test_settle_paysFromPoolWhenPremiumBelowPayout() public {
        // PREMIUM (10e6) < PAYOUT (200e6), so the pool must be pre-funded (done in setUp)
        // to cover the shortfall. This tests the real LP-capital-backed payout path.
        uint256 policyId = _purchase();

        uint256 aliceBalanceBefore = usdc.balanceOf(alice);

        _submitProof(policyId, 180, 1, 100);

        PolicyManager.Policy memory policy = policyManager.getPolicy(policyId);
        assertEq(uint8(policy.status), uint8(PolicyManager.PolicyStatus.Paid));
        assertEq(usdc.balanceOf(alice), aliceBalanceBefore + PAYOUT);
    }

    // ---------- settle: not triggered ----------

    function test_settle_expiresWhenDelayBelowThreshold() public {
        uint256 policyId = _purchase();

        _submitProof(policyId, 30, 1, 100);

        PolicyManager.Policy memory policy = policyManager.getPolicy(policyId);
        assertEq(uint8(policy.status), uint8(PolicyManager.PolicyStatus.Expired));
    }

    // ---------- guards ----------

    function test_settle_revertsWhenProofVerificationFails() public {
        uint256 policyId = _purchase();
        // vm.etch already copied bytecode; re-point storage writes go to PRECOMPILE_ADDRESS,
        // so flip the flag through that address directly.
        MockNativeQueryVerifier(PRECOMPILE_ADDRESS).setNextResult(false);

        bytes memory encodedTx =
            EvmV1Fixtures.buildDelayReportTx(sourceReporter, policyId, 180, DELAY_EVENT_SIGNATURE);
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](1);
        siblings[0] = INativeQueryVerifier.MerkleProofEntry({hash: keccak256("s"), isLeft: true});
        bytes32[] memory continuityRoots = new bytes32[](1);
        continuityRoots[0] = keccak256("r");

        vm.expectRevert("Proof of inclusion verification failed");
        policyManager.execute(
            uint8(PolicyManager.PolicyAction.SettleDelay),
            1,
            100,
            encodedTx,
            keccak256("merkleRoot"),
            siblings,
            keccak256("lowerEndpoint"),
            continuityRoots
        );
    }

    function test_settle_revertsWhenEventEmittedByUnregisteredContract() public {
        uint256 policyId = _purchase();
        address impostor = makeAddr("impostor");

        bytes memory encodedTx = EvmV1Fixtures.buildDelayReportTx(impostor, policyId, 180, DELAY_EVENT_SIGNATURE);
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](1);
        siblings[0] = INativeQueryVerifier.MerkleProofEntry({hash: keccak256("s2"), isLeft: false});
        bytes32[] memory continuityRoots = new bytes32[](1);
        continuityRoots[0] = keccak256("r2");

        vm.expectRevert(PolicyManager.DelayEventNotFromRegisteredReporter.selector);
        policyManager.execute(
            uint8(PolicyManager.PolicyAction.SettleDelay),
            2,
            200,
            encodedTx,
            keccak256("merkleRoot2"),
            siblings,
            keccak256("lowerEndpoint2"),
            continuityRoots
        );
    }

    function test_settle_revertsOnReplay() public {
        uint256 policyId = _purchase();
        _submitProof(policyId, 30, 1, 100);

        // Second submission of the exact same (chainKey, blockHeight, merkleRoot, siblings)
        // must be rejected by ASCBase's replay protection.
        bytes memory encodedTx =
            EvmV1Fixtures.buildDelayReportTx(sourceReporter, policyId, 30, DELAY_EVENT_SIGNATURE);
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](1);
        siblings[0] = INativeQueryVerifier.MerkleProofEntry({hash: keccak256("sibling"), isLeft: true});
        bytes32[] memory continuityRoots = new bytes32[](1);
        continuityRoots[0] = keccak256("root");

        vm.expectRevert("Query already processed");
        policyManager.execute(
            uint8(PolicyManager.PolicyAction.SettleDelay),
            1,
            100,
            encodedTx,
            keccak256("merkleRoot"),
            siblings,
            keccak256("lowerEndpoint"),
            continuityRoots
        );
    }

    function test_registerSourceReporter_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        policyManager.registerSourceReporter(makeAddr("someReporter"));
    }
}
