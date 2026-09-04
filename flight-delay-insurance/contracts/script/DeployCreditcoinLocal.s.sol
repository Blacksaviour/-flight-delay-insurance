// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {PolicyManager} from "../src/creditcoin/PolicyManager.sol";
import {LiquidityPool} from "../src/creditcoin/LiquidityPool.sol";
import {MockUSDC} from "../src/creditcoin/MockUSDC.sol";

/**
 * Local-development deployment (Anvil, chainId 407150).
 *
 * Deploys the Creditcoin-side contracts, wires them together, enables
 * localDevMode so settleForTesting() works (the real Attestcoin precompile
 * at 0x0FD2 does not exist on Anvil), and mints test USDC to a demo address.
 *
 * Usage:
 *   anvil --chain-id 407150 --port 8545
 *   forge script script/DeployCreditcoinLocal.s.sol \
 *     --rpc-url http://127.0.0.1:8545 \
 *     --broadcast -vvvv
 *
 * Uses the standard Anvil default accounts (hardcoded in the script),
 * so no --private-key or env vars are needed for the demo flow.
 */
contract DeployCreditcoinLocal is Script {
    function run()
        external
        returns (MockUSDC usdc, PolicyManager policyManager, LiquidityPool liquidityPool)
    {
        // Hardcoded Anvil default accounts so the script works with no
        // configuration on a fresh `anvil --chain-id 407150` run:
        //   deployer key  -> anvil account #0 (funded, for gas)
        //   sourceReporter -> anvil account #1 (stands in for the Sepolia
        //                      FlightDelayReporter address during local settle)
        uint256 deployerKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address sourceReporter = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

        // The policyholder that will receive the payout (Anvil default account #1).
        address alice = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

        vm.startBroadcast(deployerKey);

        usdc = new MockUSDC();
        policyManager = new PolicyManager(usdc);
        liquidityPool = new LiquidityPool(usdc);

        policyManager.registerSourceReporter(sourceReporter);
        policyManager.setLiquidityPool(address(liquidityPool));
        liquidityPool.setPolicyManager(address(policyManager));

        // Enable local-dev mode so the mock settle path works on Anvil.
        policyManager.setLocalDevMode(true);

        // Fund the demo policyholder and pre-seed the pool so a payout can be
        // covered even when the premium alone wouldn't be enough.
        usdc.mint(alice, 100_000e6);
        usdc.mint(address(liquidityPool), 100_000e6);

        vm.stopBroadcast();

        console.log("MockUSDC deployed at:      ", address(usdc));
        console.log("PolicyManager deployed at: ", address(policyManager));
        console.log("LiquidityPool deployed at: ", address(liquidityPool));
        console.log("Source reporter:           ", sourceReporter);
        console.log("localDevMode enabled:      ", policyManager.localDevMode());
        console.log("Demo policyholder (Alice): ", alice);
        console.log("");
        console.log("Copy these addresses into frontend/.env.local before running the app.");
    }
}
