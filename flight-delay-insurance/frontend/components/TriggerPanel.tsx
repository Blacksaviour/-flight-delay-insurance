// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Address } from "viem";

import { CONTRACTS } from "@/lib/config";
import { reporterAbi } from "@/lib/hooks";
import WalletConnect from "./WalletConnect";

/**
 * Admin / demo panel. In production this would be a decentralized data feed;
 * for the hackathon it uses the team-controlled reporter wallet on Sepolia.
 *
 * The two-step flow:
 *   1. reportDelay()  — emits FlightDelayReported on Sepolia (user's wallet)
 *   2. "Run Settle Pipeline" — calls the /api/settle server endpoint which
 *      waits for attestation, generates the proof, and submits it to
 *      PolicyManager.execute() on Creditcoin.
 *
 * See docs/technical-documentation.md for the full explanation.
 */
export default function TriggerPanel() {
  const { address, isConnected } = useAccount();
  const [policyId, setPolicyId] = useState("0");
  const [delayMinutes, setDelayMinutes] = useState("180");
  const [step, setStep] = useState<"idle" | "reporting" | "reported" | "settling" | "settled">("idle");
  const [settleResult, setSettleResult] = useState<string | null>(null);

  const { data: reportHash, isPending: isReporting, isSuccess: reportConfirmed, writeContract: reportDelay } = useWriteContract();
  const { data: reportReceiptHash } = useWaitForTransactionReceipt({ hash: reportHash });
  const { isPending: isSettling } = useWriteContract();

  // The reporter transaction hash once confirmed — this is what the API route
  // uses to fetch the inclusion proof for the block that contains it.
  const reportTxHash = reportReceiptHash?.transactionHash || reportHash;

  const isLoading = isReporting || isSettling;

  const handleReportDelay = async () => {
    setStep("reporting");
    await reportDelay({
      address: CONTRACTS.flightDelayReporter as Address,
      abi: reporterAbi,
      functionName: "reportDelay",
      args: [BigInt(policyId), BigInt(delayMinutes)],
    });
  };

  const handleSettle = async () => {
    if (!reportTxHash) {
      setSettleResult("Report the delay first — need the Sepolia tx hash.");
      return;
    }
    setStep("settling");
    setSettleResult(null);

    try {
      // Local mode (Anvil, chainId 407150) skips the real proof pipeline and
      // calls PolicyManager.settleForTesting(); the UI keeps working unchanged.
      // Set NEXT_PUBLIC_USE_LOCAL_SIM=true in .env.local for the local demo.
      const localMode = process.env.NEXT_PUBLIC_USE_LOCAL_SIM === "true";
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId,
          delayMinutes,
          txHash: reportTxHash,
          mode: localMode ? "local" : "real",
        }),
      });
      const data = await res.json();
      setSettleResult(data.message || data.error || JSON.stringify(data));
      setStep("settled");
    } catch (e: any) {
      setSettleResult(`Error: ${e.message || "unknown error"}`);
      setStep("idle");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Attestcoin Demo Panel</h2>
        <WalletConnect />
      </div>

      {!isConnected && (
        <p className="text-slate-400 mb-4">
          Connect a wallet to interact with the contracts. You need testnet funds on
          both Creditcoin CC3 and Sepolia.
        </p>
      )}

      <div className="rounded-xl bg-slate-900/50 p-6 border border-slate-800">
        <h3 className="font-semibold mb-3">1. Report Delay (Sepolia)</h3>
        <p className="text-sm text-slate-400 mb-3">
          Writes the flight-delay fact as a transaction on Sepolia. Creditcoin's
          Attestcoin Protocol will automatically attest this block.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Policy ID</label>
            <input
              type="number" value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-creditcoin"
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Delay (minutes)</label>
            <input
              type="number" value={delayMinutes}
              onChange={(e) => setDelayMinutes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-creditcoin"
              min="0"
            />
          </div>
        </div>
        <button
          onClick={handleReportDelay}
          disabled={isLoading || !isConnected}
          className="px-4 py-2 bg-creditcoin hover:bg-creditcoin-dark disabled:opacity-50 rounded-lg font-medium transition"
        >
          {isReporting ? "Reporting..." : "Report Delay"}
        </button>
        {reportConfirmed && (
          <p className="mt-3 text-sm text-green-400">
            Reported! tx: {reportHash?.slice(0, 10)}...
          </p>
        )}
      </div>

      <div className="rounded-xl bg-slate-900/50 p-6 border border-slate-800">
        <h3 className="font-semibold mb-3">2. Generate Proof & Settle (Creditcoin)</h3>
        <p className="text-sm text-slate-400 mb-3">
          The server-side pipeline will: wait for Creditcoin to attest the Sepolia
          block, generate a Merkle + continuity proof via the Attestcoin ProofBuilder,
          and submit it to <code className="bg-slate-800 px-1 rounded">PolicyManager.execute()</code>
          where the precompile at 0x0FD2 verifies it before any payout is released.
        </p>
        <button
          onClick={handleSettle}
          disabled={isLoading || !reportConfirmed}
          className="px-4 py-2 bg-success hover:bg-emerald-600 disabled:opacity-50 rounded-lg font-medium transition"
        >
          {isSettling ? "Settling..." : "Run Settle Pipeline"}
        </button>
        {settleResult && (
          <div className="mt-3 p-3 bg-slate-800/50 rounded-lg text-sm text-green-300">
            <pre className="whitespace-pre-wrap">{settleResult}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
