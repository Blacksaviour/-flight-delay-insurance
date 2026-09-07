import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { policyId, delayMinutes, txHash } = body;

  if (!policyId || !txHash) {
    return NextResponse.json({ error: "policyId and txHash are required" }, { status: 400 });
  }

  const jobId = crypto.randomUUID();
  const store = getStore("settle-jobs");
  await store.setJSON(jobId, { status: "queued", updatedAt: Date.now() });

  // Fire the background function — don't await its completion.
  const baseUrl = process.env.URL || "http://localhost:8888";
  fetch(`${baseUrl}/settle-background-invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, policyId, delayMinutes, reportTxHash: txHash }),
  }).catch((e) => console.error("Failed to trigger background function:", e));

  return NextResponse.json({ jobId });
}
