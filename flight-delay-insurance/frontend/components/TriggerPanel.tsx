// SPDX-License-Identifier: MIT
"use client";

import { useState, useRef } from "react";
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
 *   2. "Run Settle Pipeline" — in real mode, kicks off a Netlify Background
 *      Function (via /api/settle-start) that waits for attestation, generates
 *      the proof, and submits it to PolicyManager.execute() on Creditcoin.
 *      The browser polls /api/settle-status until it's done, since real
 *      Attestcoin attestation can take several minutes — far longer than a
 *      normal serverless function is allowed to run synchronously.
 *      In local mode (Anvil), settleForTesting() is instant, so it still
 *      calls the simple synchronous /api/settle route directly.
 *
 * See docs/technical-documentation.md for the full explanation.
 */
export default function TriggerPanel() {
  const { address, isConnected } = useAccount();
  const [policyId, setPolicyId] = useState("0");
  const [delayMinutes, setDelayMinutes] = useState("180");
  const [step, setStep] = useState<"idle" | "reporting" | "reported" | "settling" | "settled">("idle");
  const [settleResult, setSettleResult] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: reportHash, isPending: isReporting, isSuccess: reportConfirmed, writeContract: reportDelay } = useWriteContract();
  const { data: reportReceiptHash } = useWaitForTransactionReceipt({ hash: reportHash });
  const { isPending: isSettling } = useWriteContract();

  // The reporter transaction hash once confirmed — this is what the API route
  // uses to fetch the inclusion proof for the block that contains it.
  const reportTxHash = reportReceiptHash?.transactionHash || reportHash;

  const isLoading = isReporting || isSettling || step === "settling";

  const handleReportDelay = async () => {
    setStep("reporting");
    await reportDelay({
      address: CONTRACTS.flightDelayReporter as Address,
      abi: reporterAbi,
      functionName: "reportDelay",
      args: [BigInt(policyId), BigInt(delayMinutes)],
    });
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "queued":
        return "Queued...";
      case "started":
        return "Starting pipeline...";
      case "waiting_attestation":
        return "Waiting for Creditcoin to attest the Sepolia block (this can take several minutes)...";
      case "generating_proof":
        return "Generating Merkle + continuity proof...";
      case "settling":
        return "Submitting proof to PolicyManager.execute()...";
      default:
        return s;
    }
  };

  const pollStatus = (jobId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/settle-status?jobId=${jobId}`);
        const data = await res.json();

        if (data.error && res.status === 404) {
          // Job not written yet — keep polling briefly.
          return;
        }

        if (data.status === "done") {
          stopPolling();
          setSettleResult(data.message || `Settled. txHash=${data.txHash}`);
          setJobStatus(null);
          setStep("settled");
        } else if (data.status === "error") {
          stopPolling();
          setSettleResult(`Error: ${data.error || "Unknown error"}`);
          setJobStatus(null);
          setStep("idle");
        } else {
          setJobStatus(data.status);
        }
      } catch (e) {
        // Transient network hiccup while polling — keep trying.
      }
    }, 4000);
  };

  const handleSettle = async () => {
    if (!reportTxHash) {
      setSettleResult("Report the delay first — need the Sepolia tx hash.");
      return;
    }
    setStep("settling");
    setSettleResult(null);
    setJobStatus(null);

    const localMode = process.env.NEXT_PUBLIC_USE_LOCAL_SIM === "true";

    try {
      if (localMode) {
        // Local Anvil demo — settleForTesting() is instant, no need for
        // background handling.
        const res = await fetch("/api/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            policyId,
            delayMinutes,
            txHash: reportTxHash,
            mode: "local",
          }),
        });
        const data = await res.json();
        setSettleResult(data.message || data.error || JSON.stringify(data));
        setStep("settled");
        return;
      }

      // Real testnet pipeline — kick off the background function and poll
      // for status, since real attestation can take several minutes.
      const res = await fetch("/api/settle-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId,
          delayMinutes,
          txHash: reportTxHash,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.jobId) {
        setSettleResult(`Error: ${data.error || "Failed to start settle job"}`);
        setStep("idle");
        return;
      }
      setJobStatus("queued");
      pollStatus(data.jobId);
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
          {step === "settling" ? "Settling..." : "Run Settle Pipeline"}
        </button>
        {jobStatus && (
          <div className="mt-3 p-3 bg-slate-800/50 rounded-lg text-sm text-blue-300 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            {statusLabel(jobStatus)}
          </div>
        )}
        {settleResult && (
          <div className="mt-3 p-3 bg-slate-800/50 rounded-lg text-sm text-green-300">
            <pre className="whitespace-pre-wrap">{settleResult}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
