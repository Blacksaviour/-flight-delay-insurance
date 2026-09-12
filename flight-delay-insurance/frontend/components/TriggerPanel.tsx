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
  const [settleError, setSettleError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: reportHash, isPending: isReporting, isSuccess: reportConfirmed, writeContract: reportDelay } = useWriteContract();
  const { data: reportReceiptHash } = useWaitForTransactionReceipt({ hash: reportHash });
  const { isPending: isSettling } = useWriteContract();

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
        return "Waiting for Creditcoin to attest the Sepolia block — this can take several minutes...";
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

        if (data.error && res.status === 404) return;

        if (data.status === "done") {
          stopPolling();
          setSettleResult(data.message || `Settled. txHash=${data.txHash}`);
          setJobStatus(null);
          setStep("settled");
        } else if (data.status === "error") {
          stopPolling();
          setSettleError(data.error || "Unknown error");
          setJobStatus(null);
          setStep("idle");
        } else {
          setJobStatus(data.status);
        }
      } catch {
        // Transient network hiccup while polling — keep trying.
      }
    }, 4000);
  };

  const handleSettle = async () => {
    if (!reportTxHash) {
      setSettleError("Report the delay first — need the Sepolia tx hash.");
      return;
    }
    setStep("settling");
    setSettleResult(null);
    setSettleError(null);
    setJobStatus(null);

    const localMode = process.env.NEXT_PUBLIC_USE_LOCAL_SIM === "true";

    try {
      if (localMode) {
        const res = await fetch("/api/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ policyId, delayMinutes, txHash: reportTxHash, mode: "local" }),
        });
        const data = await res.json();
        if (data.error) {
          setSettleError(data.error);
        } else {
          setSettleResult(data.message || JSON.stringify(data));
        }
        setStep("settled");
        return;
      }

      const res = await fetch("/api/settle-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId, delayMinutes, txHash: reportTxHash }),
      });
      const data = await res.json();
      if (!res.ok || !data.jobId) {
        setSettleError(data.error || "Failed to start settle job");
        setStep("idle");
        return;
      }
      setJobStatus("queued");
      pollStatus(data.jobId);
    } catch (e: any) {
      setSettleError(e.message || "unknown error");
      setStep("idle");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="card-title">Attestcoin Demo Panel</h2>
          <p className="text-xs text-slate-500 mt-0.5">Real cross-chain proof pipeline</p>
        </div>
        <WalletConnect />
      </div>

      {!isConnected && (
        <p className="card-subtitle">
          Connect a wallet to interact with the contracts. You need testnet funds on
          both Creditcoin CC3 and Sepolia.
        </p>
      )}

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-creditcoin/15 text-creditcoin text-xs font-bold shrink-0">1</span>
          <h3 className="font-semibold text-slate-100">Report Delay (Sepolia)</h3>
        </div>
        <p className="card-subtitle mb-4">
          Writes the flight-delay fact as a transaction on Sepolia. Creditcoin's
          Attestcoin Protocol will automatically attest this block.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="field-label">Policy ID</label>
            <input
              type="number" value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              className="input"
              min="0"
            />
          </div>
          <div>
            <label className="field-label">Delay (minutes)</label>
            <input
              type="number" value={delayMinutes}
              onChange={(e) => setDelayMinutes(e.target.value)}
              className="input"
              min="0"
            />
          </div>
        </div>
        <button
          onClick={handleReportDelay}
          disabled={isLoading || !isConnected}
          className="btn-primary w-full"
        >
          {isReporting ? "Reporting..." : "Report Delay"}
        </button>
        {reportConfirmed && (
          <div className="result-box">✓ Reported! tx: {reportHash?.slice(0, 10)}...</div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-creditcoin/15 text-creditcoin text-xs font-bold shrink-0">2</span>
          <h3 className="font-semibold text-slate-100">Generate Proof & Settle (Creditcoin)</h3>
        </div>
        <p className="card-subtitle mb-4">
          The server-side pipeline waits for Creditcoin to attest the Sepolia block,
          generates a Merkle + continuity proof via the Attestcoin ProofBuilder, and
          submits it to{" "}
          <code className="bg-slate-800 px-1.5 py-0.5 rounded text-xs">PolicyManager.execute()</code>
          {" "}where the precompile at 0x0FD2 verifies it before any payout is released.
        </p>
        <button
          onClick={handleSettle}
          disabled={isLoading || !reportConfirmed}
          className="btn-success w-full"
        >
          {step === "settling" ? "Settling..." : "Run Settle Pipeline"}
        </button>

        {jobStatus && (
          <div className="status-pulse">
            <span className="inline-block w-2 h-2 rounded-full bg-info animate-pulse shrink-0" />
            <span className="break-words">{statusLabel(jobStatus)}</span>
          </div>
        )}

        {settleResult && (
          <div className="result-box">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
              {settleResult}
            </pre>
          </div>
        )}

        {settleError && (
          <div className="error-box">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
              Error: {settleError}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
