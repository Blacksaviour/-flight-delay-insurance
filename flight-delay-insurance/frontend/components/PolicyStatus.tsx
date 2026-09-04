// SPDX-License-Identifier: MIT
"use client";

import { useAccount } from "wagmi";

import { usePolicy, usePolicyCount } from "@/lib/hooks";

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
    <div className="rounded-xl bg-slate-900/50 p-6 border border-slate-800">
      <h2 className="text-xl font-semibold mb-4">Policy Status</h2>

      {!isConnected && (
        <p className="text-slate-400">Connect your wallet to view policies.</p>
      )}

      <div className="mb-4">
        <label className="block text-sm text-slate-400 mb-1">
          Total Policies Created: {policyCount}
        </label>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {policyIds.map((id) => {
          return <PolicyRow key={id} policyId={BigInt(id)} />;
        })}
        {policyIds.length === 0 && (
          <p className="text-slate-500 text-sm">No policies found. Buy one to get started.</p>
        )}
      </div>
    </div>
  );
}

function PolicyRow({ policyId }: { policyId: bigint }) {
  const { data: policy, isLoading, error } = usePolicy(policyId);
  const statusLabels = {
    0: { label: "Active", color: "bg-blue-500" },
    1: { label: "Triggered", color: "bg-yellow-500" },
    2: { label: "Paid", color: "bg-green-500" },
    3: { label: "Expired", color: "bg-slate-500" },
  };

  if (isLoading || !policy) return null;

  const statusInfo = statusLabels[Number(policy.status) as 0 | 1 | 2 | 3] || statusLabels[0];
  const premiumUSDC = Number(policy.premium) / 1e6;
  const payoutUSDC = Number(policy.payoutAmount) / 1e6;

  return (
    <div className="grid grid-cols-5 gap-2 items-center p-3 bg-slate-800/30 rounded-lg text-sm">
      <span className="text-slate-400">#{policyId.toString()}</span>
      <span className="text-slate-300">{policy.policyholder.slice(0, 6)}...{policy.policyholder.slice(-4)}</span>
      <span className="text-slate-300">{Number(policy.thresholdMinutes)} min</span>
      <span className="text-slate-300">{payoutUSDC} USDC</span>
      <span className={`px-2 py-1 rounded text-xs font-medium text-white ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
    </div>
  );
}
