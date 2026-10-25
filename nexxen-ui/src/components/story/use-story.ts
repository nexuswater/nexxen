"use client";
import { useCallback, useEffect, useState } from "react";

export type Check = { label: string; ok: boolean; detail: string };

export type Quote = {
  id: string;
  amount: string;
  duration: number;
  unit: "hours" | "days";
  hours: number;
  annualRateBps: number;
  interest: string;
  total: string;
  createdAt: string;
  dueAt: string;
  expiresAt: string;
  convention: string;
  acceptedAt?: string;
};

export type CardOrder = {
  id: string;
  at: string;
  itemId: string;
  item: string;
  merchant: string;
  amount: string;
  status: "approved" | "blocked" | "declined" | "reserved";
  reason: string;
  checks: Check[];
  rail: "ap4m" | "card";
  payment?: { txHash: string; explorerUrl: string | null; claimId: string; channelId: string; mode: "live" | "demo" };
  result?: { imageUrl?: string; prompt?: string; renderer?: string; error?: string };
  fromOrderId?: string;
  approvalId?: string;
};

export type Approval = {
  id: string;
  at: string;
  orderId: string;
  message: string;
  expiresAt: string;
  status: "pending" | "consumed" | "denied";
  expectedSigner: string | null;
  signer?: string;
  signature?: string;
  via?: "wallet" | "pasted";
  verifiedAt?: string;
  reservationId?: string;
};

export type StoryData = {
  run: number;
  quotes: Quote[];
  orders: CardOrder[];
  approvals: Approval[];
  audit: { at: string; kind: string; text: string; ref?: string }[];
  policy: {
    cardLimit: string;
    exceptionMax: string;
    blockSize: string;
    maxPrice: string;
    owner: string | null;
    ownerDevice: string;
    approvalTtlSeconds: number;
  };
  financing: { accepted: Quote | null; budget: string; used: string; remaining: string };
  items: readonly { id: string; name: string; merchant: string; amount: string; rail: "ap4m" | "card" }[];
  job: { client: string; title: string; paysRlusd: string; computeRlusd: string };
  agent: string | null;
};

export type Proof = {
  verified: boolean;
  checkedAt: string;
  provider: { name: string; quicknode: boolean };
  durationMs: number;
  error?: string;
  claim: {
    claimId: string;
    channelId: string;
    settlementDigest: string;
    payout: string;
    amountRlusd: string;
    settledAt: string;
    receiptUrl: string;
    payoutTx: string;
    payoutTxUrl: string;
    settlementTx: string;
    settlementTxUrl: string;
    payoutBlock: number;
  };
  checks: { label: string; ok: boolean }[];
  sdkVersion: string;
};

/** Walkthrough state from /api/story; every action returns the new state. */
export function useStory() {
  const [data, setData] = useState<StoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/story", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Could not load the walkthrough state."));
  }, []);

  const act = useCallback(async (body: Record<string, unknown>) => {
    setBusy(String(body.action));
    setError(null);
    try {
      const res = await fetch("/api/story", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.run) setData(json);
      if (json.error) setError(json.error);
      return res.ok ? (json as StoryData) : null;
    } catch {
      setError("Request failed.");
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  return { data, error, busy, act, refresh, clearError: () => setError(null) };
}

/** Last receipt verification, and a fresh one on demand. */
export function useProof() {
  const [proof, setProof] = useState<Proof | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch("/api/proof", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProof(j.proof))
      .catch(() => {});
  }, []);

  const verify = useCallback(async () => {
    setRunning(true);
    try {
      const j = await (await fetch("/api/proof", { method: "POST" })).json();
      setProof(j.proof);
    } finally {
      setRunning(false);
    }
  }, []);

  return { proof, running, verify };
}
