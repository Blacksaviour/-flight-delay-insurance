// SPDX-License-Identifier: MIT
"use client";

import { useAccount } from "wagmi";

import { usePolicy, usePolicyCount } from "@/lib/hooks";
import type { Policy } from "@/lib/hooks";

/**
 * Displays all policies and their status. Shows a specific policy by ID
 * or lists all policies owned by the connected wallet.
 * Status values: Active -> (Triggered/Paid) or (Expired)
 */
export default function PolicyStatus() {
  const { isConnected } = useAccount();
  const { data: nextId } = usePolicyCount();
  const policyCount = nextId ? Number(nextId) : 0;

  const policyIds = Array.from({ length: policyCount }, (_, i) => i);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="card-title">Policy Status</h2>
        <span className="badge-neutral">{policyCount} total</span>
      </div>

      {!isConnected && (
        <p className="card-subtitle">Connect your wallet to view policies.</p>
      )}

      {isConnected && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {policyIds.slice().reverse().map((id) => (
            <PolicyRow key={id} policyId={BigInt(id)} />
          ))}
          {policyIds.length === 0 && (
            <p className="text-slate-500 text-sm py-6 text-center">
              No policies yet — buy one above to get started.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PolicyRow({ policyId }: { policyId: bigint }) {
  const { data: rawPolicy, isLoading } = usePolicy(policyId);
  const policy = rawPolicy as Policy | undefined;

  const statusMeta: Record<number, { label: string; badge: string }> = {
    0: { label: "Active", badge: "badge-active" },
    1: { label: "Triggered", badge: "badge-triggered" },
    2: { label: "Paid", badge: "badge-paid" },
    3: { label: "Expired", badge: "badge-expired" },
  };

  if (isLoading || !policy) return null;

  const status = statusMeta[Number(policy.status)] ?? { label: "Unknown", badge: "badge-neutral" };
  const payoutUSDC = Number(policy.payoutAmount) / 1e6;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900/50 border border-surface-border rounded-xl text-sm">
      <div className="flex items-center gap-4 min-w-0">
        <span className="text-slate-500 font-mono text-xs shrink-0">#{policyId.toString()}</span>
        <span className="text-slate-400 font-mono text-xs shrink-0 hidden sm:inline">
          {policy.policyholder.slice(0, 6)}...{policy.policyholder.slice(-4)}
        </span>
        <span className="text-slate-300 shrink-0">{Number(policy.thresholdMinutes)} min</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-slate-200 font-semibold">{payoutUSDC} USDC</span>
        <span className={status.badge}>{status.label}</span>
      </div>
    </div>
  );
}
