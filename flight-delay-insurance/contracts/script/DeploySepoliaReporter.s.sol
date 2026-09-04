// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {FlightDelayReporter} from "../src/sepolia/FlightDelayReporter.sol";

/// @notice Deploys FlightDelayReporter to Sepolia.
/// Usage:
///   forge script script/DeploySepoliaReporter.s.sol \
///     --rpc-url sepolia --broadcast --verify -vvvv
/// Requires env vars: PRIVATE_KEY, REPORTER_ADDRESS (who is allowed to call reportDelay)
contract DeploySepoliaReporter is Script {
    function run() external returns (FlightDelayReporter reporter) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address reporterAddress = vm.envAddress("REPORTER_ADDRESS");

        vm.startBroadcast(deployerKey);
        reporter = new FlightDelayReporter(reporterAddress);
        vm.stopBroadcast();

        console.log("FlightDelayReporter deployed at:", address(reporter));
        console.log("Authorized reporter address:", reporterAddress);
    }
}
