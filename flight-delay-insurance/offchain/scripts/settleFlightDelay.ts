/**
 * End-to-end flight-delay settlement pipeline.
 *
 * This is the real, functional Attestcoin Protocol integration described in the PRD:
 *   1. Report a flight delay as a transaction on Sepolia (FlightDelayReporter.reportDelay).
 *   2. Wait for that block to be attested on Creditcoin.
 *   3. Fetch a Merkle + continuity inclusion proof for that transaction from the Proof
 *      Builder service.
 *   4. Submit the proof to PolicyManager.execute() on Creditcoin, which verifies it
 *      synchronously via the Native Query Verifier precompile (0x0FD2) before paying out.
 *
 * Nothing about steps 2-4 is simulated -- the payout is genuinely gated on real proof
 * verification. The only simplification (disclosed in the PRD) is that step 1 is triggered
 * by a single team-controlled reporter wallet rather than a live flight-status feed or a
 * decentralized attester set.
 *
 * Usage: npx tsx scripts/settleFlightDelay.ts <policyId> <delayMinutes>
 */
import "dotenv/config";
import { JsonRpcProvider, Wallet, Contract, Interface } from "ethers";
import { chainInfo, proofProvider } from "@gluwa/usc-sdk";
import flightDelayReporterArtifact from "../abi/FlightDelayReporter.json";
import policyManagerArtifact from "../abi/PolicyManager.json";

interface PolicyManagerAction {
  SettleDelay: 0;
}
const PolicyManagerAction: PolicyManagerAction = { SettleDelay: 0 };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  const [, , policyIdArg, delayMinutesArg] = process.argv;
  if (!policyIdArg || !delayMinutesArg) {
    console.error("Usage: npx tsx scripts/settleFlightDelay.ts <policyId> <delayMinutes>");
    process.exit(1);
  }
  const policyId = BigInt(policyIdArg);
  const delayMinutes = BigInt(delayMinutesArg);

  const sepoliaRpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const creditcoinRpcUrl = requireEnv("CREDITCOIN_RPC_URL");
  const proofBuilderUrl = requireEnv("PROOF_BUILDER_URL");
  const sepoliaChainKey = Number(requireEnv("SEPOLIA_CHAIN_KEY"));
  const reporterAddress = requireEnv("FLIGHT_DELAY_REPORTER_ADDRESS");
  const policyManagerAddress = requireEnv("POLICY_MANAGER_ADDRESS");
  const reporterPrivateKey = requireEnv("REPORTER_PRIVATE_KEY");
  const settlerPrivateKey = requireEnv("SETTLER_PRIVATE_KEY");

  const sepoliaProvider = new JsonRpcProvider(sepoliaRpcUrl);
  const creditcoinProvider = new JsonRpcProvider(creditcoinRpcUrl);

  const reporterWallet = new Wallet(reporterPrivateKey, sepoliaProvider);
  const settlerWallet = new Wallet(settlerPrivateKey, creditcoinProvider);

  // ---- Step 1: report the delay on Sepolia ----
  console.log(`\n[1/4] Reporting delay: policyId=${policyId}, delayMinutes=${delayMinutes} on Sepolia...`);
  const reporterContract = new Contract(
    reporterAddress,
    flightDelayReporterArtifact.abi,
    reporterWallet
  );
  const reportTx = await reporterContract.reportDelay(policyId, delayMinutes);
  const reportReceipt = await reportTx.wait();
  if (!reportReceipt) throw new Error("reportDelay transaction did not confirm");
  console.log(`      Reported. txHash=${reportReceipt.hash}, block=${reportReceipt.blockNumber}`);

  // ---- Step 2: wait for Creditcoin to attest that block ----
  console.log(`\n[2/4] Waiting for block ${reportReceipt.blockNumber} to be attested on Creditcoin...`);
  const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(creditcoinProvider);
  const proofBuilder = new proofProvider.service.ProofBuilder(sepoliaChainKey, proofBuilderUrl, 5000);
  await proofBuilder.waitUntilHeightAttested(sepoliaChainKey, reportReceipt.blockNumber);
  console.log("      Attested.");

  // ---- Step 3: generate the inclusion proof ----
  console.log(`\n[3/4] Generating inclusion proof for ${reportReceipt.hash}...`);
  const proofResult = await proofBuilder.getProof(reportReceipt.hash);
  if (!proofResult.success || !proofResult.data) {
    throw new Error(`Proof generation failed: ${proofResult.error}`);
  }
  const proofData = proofResult.data;
  console.log(`      Proof ready. headerNumber=${proofData.headerNumber}, cached=${proofData.cached}`);

  // ---- Step 4: submit to PolicyManager on Creditcoin ----
  console.log("\n[4/4] Submitting proof to PolicyManager.execute()...");
  const policyManager = new Contract(policyManagerAddress, policyManagerArtifact.abi, settlerWallet);

  const settleTx = await policyManager.execute(
    PolicyManagerAction.SettleDelay,
    proofData.chainKey,
    proofData.headerNumber,
    proofData.txBytes,
    proofData.merkleProof.root,
    proofData.merkleProof.siblings,
    proofData.continuityProof.lowerEndpointDigest,
    proofData.continuityProof.roots
  );
  const settleReceipt = await settleTx.wait();
  if (!settleReceipt) throw new Error("execute() transaction did not confirm");

  console.log(`      Settled. txHash=${settleReceipt.hash}`);

  // Decode PolicySettled event for a human-readable summary.
  const iface = new Interface(policyManagerArtifact.abi);
  for (const log of settleReceipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "PolicySettled") {
        console.log(
          `\nPolicySettled: policyId=${parsed.args.policyId}, delayMinutes=${parsed.args.delayMinutes}, triggered=${parsed.args.triggered}`
        );
      }
    } catch {
      // not a PolicyManager event, ignore
    }
  }
}

main().catch((err) => {
  console.error("\nsettleFlightDelay failed:", err);
  process.exitCode = 1;
});
