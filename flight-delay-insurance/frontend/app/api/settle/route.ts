import { NextRequest, NextResponse } from "next/server";
import { JsonRpcProvider, Wallet, Contract, Interface } from "ethers";
import { chainInfo, proofProvider } from "@gluwa/usc-sdk";

import policyManagerArtifact from "../../../lib/abis/PolicyManager.json";

/**
 * Server-side settle pipeline.
 *
 * Mirrors offchain/scripts/settleFlightDelay.ts — the real Attestcoin integration.
 * The policy purchase and reportDelay happen client-side (wallet signs those txs).
 * This route takes the reporter tx hash and:
 *   1. Waits for Creditcoin to attest the Sepolia block (waitUntilHeightAttested).
 *   2. Fetches the Merkle + continuity inclusion proof (getProof).
 *   3. Submits it to PolicyManager.execute() on Creditcoin, which verifies it
 *      synchronously via the Native Query Verifier precompile (0x0FD2) before
 *      paying out.
 *
 * Env vars (server-side): SEPOLIA_RPC_URL, CREDITCOIN_RPC_URL, PROOF_BUILDER_URL,
 *   SEPOLIA_CHAIN_KEY, SETTLER_PRIVATE_KEY, NEXT_PUBLIC_POLICY_MANAGER_ADDRESS.
 */
interface PolicyManagerAction {
  SettleDelay: 0;
}
const PolicyManagerAction: PolicyManagerAction = { SettleDelay: 0 };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getAddress(name: string): string {
  return process.env["NEXT_PUBLIC_" + name] || process.env[name] || "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const policyId = body.policyId as string;
    const reportTxHash = (body.txHash as string) || "";
    const local = body.mode === "local"; // local Anvil demo vs real testnet pipeline

    if (!policyId) {
      return NextResponse.json({ error: "policyId is required" }, { status: 400 });
    }

    // -----------------------------------------------------------------------
    // LOCAL MODE — for the Anvil-based local demo (chainId 407150).
    // The real Attestcoin precompile (0x0FD2) does not exist on Anvil, so we
    // use PolicyManager.settleForTesting(), which exercises the exact same
    // decode -> threshold-check -> pool payout logic but skips the precompile.
    // -----------------------------------------------------------------------
    if (local) {
      const creditcoinRpcUrl = requireEnv("CREDITCOIN_RPC_URL");
      const policyManagerAddress = getAddress("POLICY_MANAGER_ADDRESS");
      const settlerPrivateKey = requireEnv("SETTLER_PRIVATE_KEY");
      if (!policyManagerAddress) {
        return NextResponse.json(
          { error: "POLICY_MANAGER_ADDRESS not configured in .env.local" },
          { status: 500 }
        );
      }
      const delayMinutes = Number(body.delayMinutes || 0);
      const creditcoinProvider = new JsonRpcProvider(creditcoinRpcUrl);
      const settlerWallet = new Wallet(settlerPrivateKey, creditcoinProvider);
      const policyManager = new Contract(
        policyManagerAddress,
        policyManagerArtifact.abi,
        settlerWallet
      );
      const tx = await policyManager.settleForTesting(
        BigInt(policyId),
        BigInt(delayMinutes)
      );
      const receipt = await tx.wait();
      if (!receipt) throw new Error("settleForTesting transaction did not confirm");
      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
        message: `Settled (local sim). txHash=${receipt.hash}`,
      });
    }

    if (!reportTxHash) {
      return NextResponse.json(
        {
          error:
            "report txHash is required. Report the delay on Sepolia first " +
            "(the demo panel does this), then pass the resulting tx hash.",
        },
        { status: 400 }
      );
    }

    const sepoliaRpcUrl = requireEnv("SEPOLIA_RPC_URL");
    const creditcoinRpcUrl = requireEnv("CREDITCOIN_RPC_URL");
    const proofBuilderUrl = requireEnv("PROOF_BUILDER_URL");
    const sepoliaChainKey = Number(requireEnv("SEPOLIA_CHAIN_KEY"));
    const policyManagerAddress = getAddress("POLICY_MANAGER_ADDRESS");
    const settlerPrivateKey = requireEnv("SETTLER_PRIVATE_KEY");

    if (!policyManagerAddress) {
      return NextResponse.json(
        { error: "POLICY_MANAGER_ADDRESS not configured in .env.local" },
        { status: 500 }
      );
    }

    const sepoliaProvider = new JsonRpcProvider(sepoliaRpcUrl);
    const creditcoinProvider = new JsonRpcProvider(creditcoinRpcUrl);
    const settlerWallet = new Wallet(settlerPrivateKey, creditcoinProvider);

    // Verify the tx exists on Sepolia.
    const reportReceipt = await sepoliaProvider.getTransactionReceipt(reportTxHash);
    if (!reportReceipt) {
      return NextResponse.json(
        { error: `Transaction ${reportTxHash} not found on Sepolia` },
        { status: 400 }
      );
    }

    // 1. Wait for Creditcoin to attest that Sepolia block.
    console.log(`Waiting for block ${reportReceipt.blockNumber} to be attested...`);
    const proofBuilder = new proofProvider.service.ProofBuilder(sepoliaChainKey, proofBuilderUrl, 5000);
    await proofBuilder.waitUntilHeightAttested(sepoliaChainKey, reportReceipt.blockNumber);

    // 2. Generate the Merkle + continuity inclusion proof.
    console.log("Generating proof...");
    const proofResult = await proofBuilder.getProof(reportTxHash);
    if (!proofResult.success || !proofResult.data) {
      return NextResponse.json(
        { error: `Proof generation failed: ${proofResult.error}` },
        { status: 500 }
      );
    }
    const proofData = proofResult.data;

    // 3. Submit to PolicyManager.execute() on Creditcoin.
    console.log("Submitting to PolicyManager.execute()...");
    const policyManager = new Contract(
      policyManagerAddress,
      policyManagerArtifact.abi,
      settlerWallet
    );
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

    // Decode PolicySettled event for a human-readable summary.
    const iface = new Interface(policyManagerArtifact.abi);
    let summary = `Settled. txHash=${settleReceipt.hash}`;
    for (const log of settleReceipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "PolicySettled") {
          summary += ` | PolicySettled: policyId=${parsed.args.policyId}, delayMinutes=${parsed.args.delayMinutes}, triggered=${parsed.args.triggered}`;
        }
      } catch {
        // not a PolicyManager event, ignore
      }
    }

    return NextResponse.json({ success: true, txHash: settleReceipt.hash, message: summary });
  } catch (err: any) {
    console.error("settle API failed:", err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
