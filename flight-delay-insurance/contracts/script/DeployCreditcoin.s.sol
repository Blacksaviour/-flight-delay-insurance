// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {PolicyManager} from "../src/creditcoin/PolicyManager.sol";
import {LiquidityPool} from "../src/creditcoin/LiquidityPool.sol";
import {MockUSDC} from "../src/creditcoin/MockUSDC.sol";

/// @notice Deploys the Creditcoin-side contracts and wires them together.
/// Usage:
///   forge script script/DeployCreditcoin.s.sol \
///     --rpc-url creditcoin_cc3_testnet --broadcast -vvvv
/// Requires env vars: PRIVATE_KEY, SOURCE_REPORTER_CONTRACT (FlightDelayReporter's Sepolia address,
/// from DeploySepoliaReporter.s.sol -- deploy that first)
contract DeployCreditcoin is Script {
    function run()
        external
        returns (MockUSDC usdc, PolicyManager policyManager, LiquidityPool liquidityPool)
    {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address sourceReporterContract = vm.envAddress("SOURCE_REPORTER_CONTRACT");

        vm.startBroadcast(deployerKey);

        usdc = new MockUSDC();
        policyManager = new PolicyManager(usdc);
        liquidityPool = new LiquidityPool(usdc);

        policyManager.registerSourceReporter(sourceReporterContract);
        policyManager.setLiquidityPool(address(liquidityPool));
        liquidityPool.setPolicyManager(address(policyManager));

        vm.stopBroadcast();

        console.log("MockUSDC deployed at:      ", address(usdc));
        console.log("PolicyManager deployed at: ", address(policyManager));
        console.log("LiquidityPool deployed at: ", address(liquidityPool));
        console.log("Registered source reporter:", sourceReporterContract);
        console.log("Wired LiquidityPool into PolicyManager (premiums -> pool, payouts -> pool.payOut)");
    }
}
