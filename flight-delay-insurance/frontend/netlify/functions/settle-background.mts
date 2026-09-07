import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { JsonRpcProvider, Wallet, Contract, Interface } from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";
import policyManagerArtifact from "../../lib/abis/PolicyManager.json" with { type: "json" };

interface PolicyManagerAction {
  SettleDelay: 0;
}
const PolicyManagerAction: PolicyManagerAction = { SettleDelay: 0 };

function safeSerialize(data: any) {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

export default async (req: Request) => {
  const { jobId, policyId, delayMinutes, reportTxHash } = await req.json();
  const store = getStore("settle-jobs");

  const update = async (status: string, extra: Record<string, any> = {}) => {
    await store.setJSON(jobId, { status, ...extra, updatedAt: Date.now() });
  };

  try {
    await update("started");

    const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL!;
    const creditcoinRpcUrl = process.env.CREDITCOIN_RPC_URL!;
    const proofBuilderUrl = process.env.PROOF_BUILDER_URL!;
    const sepoliaChainKey = Number(process.env.SEPOLIA_CHAIN_KEY!);
    const policyManagerAddress =
      process.env.NEXT_PUBLIC_POLICY_MANAGER_ADDRESS!;
    const settlerPrivateKey = process.env.SETTLER_PRIVATE_KEY!;

    const sepoliaProvider = new JsonRpcProvider(sepoliaRpcUrl);
    const creditcoinProvider = new JsonRpcProvider(creditcoinRpcUrl);
    const settlerWallet = new Wallet(settlerPrivateKey, creditcoinProvider);

    const reportReceipt = await sepoliaProvider.getTransactionReceipt(reportTxHash);
    if (!reportReceipt) {
      await update("error", { error: `Transaction ${reportTxHash} not found on Sepolia` });
      return new Response("done");
    }

    await update("waiting_attestation", { blockNumber: reportReceipt.blockNumber });
    const proofBuilder = new proofProvider.service.ProofBuilder(
      sepoliaChainKey,
      proofBuilderUrl,
      5000
    );
    await proofBuilder.waitUntilHeightAttested(sepoliaChainKey, reportReceipt.blockNumber);

    await update("generating_proof");
    const proofResult = await proofBuilder.getProof(reportTxHash);
    if (!proofResult.success || !proofResult.data) {
      await update("error", { error: `Proof generation failed: ${proofResult.error}` });
      return new Response("done");
    }
    const proofData = proofResult.data;

    await update("settling");
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

    const iface = new Interface(policyManagerArtifact.abi);
    let summary = `Settled. txHash=${settleReceipt.hash}`;
    for (const log of settleReceipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "PolicySettled") {
          summary += ` | PolicySettled: policyId=${parsed.args.policyId}, delayMinutes=${parsed.args.delayMinutes}, triggered=${parsed.args.triggered}`;
        }
      } catch {}
    }

    await update("done", safeSerialize({ txHash: settleReceipt.hash, message: summary }));
  } catch (err: any) {
    await update("error", { error: err?.message || "Unknown error" });
  }

  return new Response("done");
};

export const config: Config = {
  path: "/settle-background-invoke",
};
