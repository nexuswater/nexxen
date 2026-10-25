import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseClaimReceiptContext, verifyClaimReceipt } from "@ap4m/sdk/claim-receipt";
import { ethers } from "ethers";
import { env } from "@/lib/ap4m/store";
import settledClaim from "@/config/ap4m-settled-claim.json";

/**
 * Read-only proof that an AP4M testnet payment settled: fetch the public
 * claim receipt and re-check it on-chain with the official SDK's
 * verifyClaimReceipt, plus the exact RLUSD Transfer from the vault to our
 * payout wallet. The RPC is QUICKNODE_RPC_URL when set,
 * otherwise the public XRPL EVM RPC; the result always names which one ran.
 */

const PUBLIC_RPC = "https://rpc.testnet.xrplevm.org";
const EXPLORER = "https://explorer.testnet.xrplevm.org";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** The settled claim we expect, taken from our own order, not from the receipt. */
const EXPECTED = {
  claimId: settledClaim.claimId,
  settlementDigest: settledClaim.settlementDigest,
  channelId: settledClaim.vaultPayoutEvidence.channelId,
  payout: "0xC46D99FAaE8482F3876f49cAE56B9F09057CE2B8",
  amountWei: "1000000000000000",
};

export type ProofResult = {
  verified: boolean;
  checkedAt: string;
  provider: { name: "Quicknode" | "Public XRPL EVM RPC" | "Custom RPC"; quicknode: boolean };
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

function rpc() {
  const url = process.env.QUICKNODE_RPC_URL?.trim();
  if (!url) return { url: PUBLIC_RPC, name: "Public XRPL EVM RPC" as const, quicknode: false };
  const host = new URL(url).hostname;
  const quicknode = host.endsWith(".quiknode.pro") || host.endsWith(".quicknode.pro");
  return { url, name: quicknode ? ("Quicknode" as const) : ("Custom RPC" as const), quicknode };
}

const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const topicOf = (addr: string) => "0x" + addr.slice(2).toLowerCase().padStart(64, "0");

function claimSummary() {
  const v = settledClaim.vaultPayoutEvidence;
  const s = settledClaim.settlementTransaction;
  return {
    claimId: EXPECTED.claimId,
    channelId: EXPECTED.channelId,
    settlementDigest: EXPECTED.settlementDigest,
    payout: EXPECTED.payout,
    amountRlusd: ethers.formatUnits(EXPECTED.amountWei, 18),
    settledAt: new Date(settledClaim.settlementEvidence.settledAt * 1000).toISOString(),
    receiptUrl: `${env().apiUrl}/public/evidence/claims/${EXPECTED.claimId}/${EXPECTED.settlementDigest}.json`,
    payoutTx: v.transactionHash,
    payoutTxUrl: `${EXPLORER}/tx/${v.transactionHash}`,
    settlementTx: s.transactionHash,
    settlementTxUrl: `${EXPLORER}/tx/${s.transactionHash}`,
    payoutBlock: v.blockNumber,
  };
}

function file() {
  mkdirSync(env().stateDir, { recursive: true, mode: 0o700 });
  return join(env().stateDir, "proof.json");
}

export function lastProof(): ProofResult | null {
  try {
    return JSON.parse(readFileSync(file(), "utf8"));
  } catch {
    return null;
  }
}

let running: Promise<ProofResult> | null = null;

export function verifyProof() {
  running ??= runVerification().finally(() => (running = null));
  return running;
}

async function runVerification(): Promise<ProofResult> {
  const r = rpc();
  const started = Date.now();
  const checks: { label: string; ok: boolean }[] = [];
  const provider = new ethers.JsonRpcProvider(r.url, 1449000, { staticNetwork: true, batchMaxCount: 1 });
  const result = (verified: boolean, error?: string): ProofResult => ({
    verified,
    checkedAt: new Date().toISOString(),
    provider: { name: r.name, quicknode: r.quicknode },
    durationMs: Date.now() - started,
    error,
    claim: claimSummary(),
    checks,
    sdkVersion: "@ap4m/sdk 0.10.1",
  });

  try {
    const chainId = BigInt(await provider.send("eth_chainId", []));
    checks.push({ label: `RPC is XRPL EVM Testnet (chain ${chainId})`, ok: chainId === BigInt(1449000) });
    if (chainId !== BigInt(1449000)) throw new Error("Wrong chain");

    const api = env().apiUrl;
    const get = async (path: string) => {
      const res = await fetch(api + path, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`AP4M public evidence returned ${res.status}`);
      return res.json();
    };
    const context = parseClaimReceiptContext((await get("/public/evidence/context")).receipt);
    const receipt = await get(`/public/evidence/claims/${EXPECTED.claimId}/${EXPECTED.settlementDigest}.json`);
    const v = receipt.vaultPayoutEvidence;
    const matches =
      eq(receipt.claimId, EXPECTED.claimId) &&
      eq(v?.channelId, EXPECTED.channelId) &&
      eq(v?.payout, EXPECTED.payout) &&
      v?.amount === EXPECTED.amountWei;
    checks.push({ label: "Public AP4M receipt matches our claim, channel, payout wallet and amount", ok: matches });
    if (!matches) throw new Error("Receipt does not match the expected order");

    const checked = await verifyClaimReceipt(provider, context, receipt);
    checks.push({ label: "AP4M SDK verifyClaimReceipt: claim anchored on the PaymentLedger", ok: checked.verified === true });
    checks.push({ label: "Vault payout is final", ok: checked.payoutFinal === true });
    checks.push({ label: "Settlement is final", ok: checked.settlementFinal === true });

    const tx = await provider.getTransactionReceipt(v.transactionHash);
    const transfers = (tx?.logs ?? []).filter((l) => eq(l.address, context.token) && eq(l.topics[0], TRANSFER_TOPIC));
    const exact =
      tx?.status === 1 &&
      transfers.length === 1 &&
      eq(transfers[0].topics[1], topicOf(context.vault)) &&
      eq(transfers[0].topics[2], topicOf(EXPECTED.payout)) &&
      BigInt(transfers[0].data) === BigInt(EXPECTED.amountWei);
    checks.push({ label: "Exactly 0.001 RLUSD transferred from the AP4M vault to our payout wallet", ok: exact });

    const ok = checks.every((c) => c.ok);
    const out = result(ok, ok ? undefined : "A check failed");
    writeFileSync(file(), JSON.stringify(out, null, 2));
    return out;
  } catch (error) {
    // Never fall back to another RPC silently: report the failure as-is.
    const out = result(false, (error as Error).message.slice(0, 300));
    writeFileSync(file(), JSON.stringify(out, null, 2));
    return out;
  } finally {
    provider.destroy();
  }
}
