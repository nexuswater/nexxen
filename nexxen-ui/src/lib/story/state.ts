import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ethers } from "ethers";
import { balance, buyService } from "@/lib/ap4m/agent";
import { runJob } from "@/lib/ap4m/ai-tools";
import { attachJob, env } from "@/lib/ap4m/store";
import { calculateTermQuote, type TermInput, type TermQuote } from "./terms";

/**
 * The hackathon walkthrough: demo financing, the agent's (simulated) card,
 * the owner's signed exception and the audit trail. Card purchases and
 * financing are simulations; the owner's signature is verified for real
 * against OWNER_APPROVER_ADDRESS.
 */

/**
 * The small purchase is a real AP4M payment to our PixelForge seller (GPU image
 * render, paid from the agent wallet). The large one is a simulated card
 * purchase from a fictional GPU merchant, funded by the demo financing.
 */
export const CARD_ITEMS = [
  {
    id: "gpu-small",
    name: "GPU image render",
    merchant: "PixelForge · AP4M seller agent",
    amount: "0.001",
    rail: "ap4m",
    serviceId: "generate-image",
    prompt: "Studio product shot of a matte black wireless speaker on a marble table, soft light, 3D render",
  },
  { id: "gpu-large", name: "A100 GPU · 2 hours", merchant: "CloudGPU · fictional card merchant", amount: "3.50", rail: "card" },
] as const;

export const JOB = {
  client: "Lumen Studio (sample client)",
  title: "Render 40 product shots in 3D",
  paysRlusd: "8.00",
  computeRlusd: "4.70",
};

export function policy() {
  const owner = process.env.OWNER_APPROVER_ADDRESS?.trim();
  return {
    cardLimit: Number(process.env.STORY_CARD_LIMIT_RLUSD || "2").toFixed(2),
    exceptionMax: Number(process.env.STORY_EXCEPTION_MAX_RLUSD || "5").toFixed(2),
    blockSize: env().blockSize,
    maxPrice: env().maxPrice,
    owner: owner && ethers.isAddress(owner) ? ethers.getAddress(owner) : null,
    ownerDevice: process.env.OWNER_APPROVER_DEVICE || "Ledger Flex",
    approvalTtlSeconds: 300,
  };
}

type Check = { label: string; ok: boolean; detail: string };

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
  /** Real AP4M payment details (rail "ap4m" only). */
  payment?: { txHash: string; explorerUrl: string | null; claimId: string; channelId: string; mode: "live" | "demo" };
  /** The seller's delivered result, e.g. the rendered image. */
  result?: { imageUrl?: string; prompt?: string; renderer?: string; error?: string };
  /** For a reservation: the blocked request it was created from. */
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

export type AuditEntry = { at: string; kind: string; text: string; ref?: string };

export type Story = {
  run: number;
  quotes: (TermQuote & { id: string; acceptedAt?: string })[];
  orders: CardOrder[];
  approvals: Approval[];
  audit: AuditEntry[];
};

const empty = (run = 1): Story => ({ run, quotes: [], orders: [], approvals: [], audit: [] });

function file() {
  mkdirSync(env().stateDir, { recursive: true, mode: 0o700 });
  return join(env().stateDir, "story.json");
}

export function readStory(): Story {
  try {
    return { ...empty(), ...JSON.parse(readFileSync(file(), "utf8")) };
  } catch {
    return empty();
  }
}

function save(s: Story) {
  writeFileSync(file(), JSON.stringify(s, null, 2));
  return s;
}

function audit(s: Story, kind: string, text: string, ref?: string) {
  s.audit.unshift({ at: new Date().toISOString(), kind, text, ref });
}

const cents = (v: string) => Math.round(Number(v) * 100);
const money = (c: number) => (c / 100).toFixed(2);

export function financing(s: Story) {
  const accepted = s.quotes.find((q) => q.acceptedAt);
  const budget = accepted ? cents(accepted.amount) : 0;
  // Only card purchases draw on the financed card budget; AP4M payments come from the agent wallet.
  const used = s.orders
    .filter((o) => o.rail === "card" && (o.status === "approved" || o.status === "reserved"))
    .reduce((t, o) => t + cents(o.amount), 0);
  return { accepted: accepted ?? null, budget: money(budget), used: money(used), remaining: money(budget - used) };
}

export function quote(input: TermInput) {
  const s = readStory();
  const q = { id: randomUUID(), ...calculateTermQuote(input) };
  s.quotes = [q, ...s.quotes.filter((x) => x.acceptedAt)].slice(0, 20);
  audit(s, "QUOTE", `Demo financing quote: ${q.amount} RLUSD for ${q.duration} ${q.unit}, repay ${q.total}`, q.id);
  return save(s);
}

export function accept(quoteId: string) {
  const s = readStory();
  const q = s.quotes.find((x) => x.id === quoteId);
  if (!q) throw new Error("Unknown quote; request a new one.");
  if (q.acceptedAt) return s;
  if (Date.now() >= Date.parse(q.expiresAt)) throw new Error("Quote expired; request a new one.");
  if (s.quotes.some((x) => x.acceptedAt)) throw new Error("A financing quote is already accepted for this run. Reset to start over.");
  q.acceptedAt = new Date().toISOString();
  audit(s, "FINANCING", `Demo financing accepted: ${q.amount} RLUSD card budget, repay ${q.total} by ${q.dueAt} (simulated, no loan)`, q.id);
  return save(s);
}

function record(order: Omit<CardOrder, "id" | "at">) {
  const s = readStory();
  const full: CardOrder = { id: randomUUID(), at: new Date().toISOString(), ...order };
  s.orders.unshift(full);
  audit(s, full.status.toUpperCase(), `${full.item} · ${full.amount} RLUSD: ${full.reason}`, full.id);
  return save(s);
}

/** The allowed purchase: a real AP4M payment from the agent wallet, then the seller renders the image. */
async function buyOverAp4m(item: Extract<(typeof CARD_ITEMS)[number], { rail: "ap4m" }>) {
  const limit = policy().cardLimit;
  const b = await balance();
  const checks: Check[] = [
    { label: "Agent wallet budget", ok: Number(item.amount) <= Number(b.availableRlusd), detail: `${item.amount} of ${Number(b.availableRlusd).toFixed(3)} RLUSD available` },
    { label: "Owner's per-purchase limit", ok: Number(item.amount) <= Number(limit), detail: `${item.amount} vs ${limit} RLUSD limit` },
  ];
  const base = { itemId: item.id, item: item.name, merchant: item.merchant, amount: item.amount, rail: "ap4m" as const };
  if (!checks.every((c) => c.ok)) return record({ ...base, status: "declined", reason: "Outside the agent's budget or limit", checks });

  let receipt;
  try {
    receipt = await buyService(item.serviceId);
  } catch (error) {
    return record({ ...base, status: "declined", reason: `AP4M payment did not go through: ${(error as Error).message}`, checks });
  }
  const live = receipt.mode === "live";
  checks.push({
    label: "Paid over Mastercard AP4M",
    ok: true,
    detail: live ? `Signed voucher redeemed on XRPL EVM Testnet · ${receipt.amountRlusd} RLUSD` : "Demo mode: simulated channel",
  });
  let result: CardOrder["result"] = { prompt: item.prompt };
  try {
    const out = await runJob(item.serviceId, { input: item.prompt });
    result = {
      prompt: item.prompt,
      imageUrl: typeof out.image_url === "string" ? out.image_url : undefined,
      renderer: typeof out.renderer === "string" ? out.renderer : undefined,
    };
    attachJob(receipt.claimId, { input: item.prompt, result: out });
  } catch (error) {
    result = { prompt: item.prompt, error: `Paid, but the render failed: ${(error as Error).message}` };
    attachJob(receipt.claimId, { input: item.prompt, error: result.error });
  }
  checks.push({ label: "Seller delivered", ok: !result.error, detail: result.error ?? "Image rendered after the payment was confirmed" });
  return record({
    ...base,
    amount: receipt.amountRlusd,
    status: "approved",
    reason: live ? "Within budget and limit: the agent paid on its own, for real, on testnet" : "Within budget and limit (demo mode)",
    checks,
    payment: { txHash: receipt.txHash, explorerUrl: receipt.explorerUrl, claimId: receipt.claimId, channelId: receipt.channelId, mode: receipt.mode },
    result,
  });
}

/** Re-run the seller's job for a purchase that was paid but not delivered. No new payment is made. */
export async function redeliver(orderId: string) {
  const order = readStory().orders.find((o) => o.id === orderId);
  const item = CARD_ITEMS.find((i) => i.id === order?.itemId);
  if (!order || !order.payment || order.status !== "approved" || item?.rail !== "ap4m") throw new Error("Only a paid AP4M purchase can be redelivered.");
  if (!order.result?.error) throw new Error("This purchase was already delivered.");
  let result: CardOrder["result"];
  try {
    const out = await runJob(item.serviceId, { input: item.prompt });
    result = {
      prompt: item.prompt,
      imageUrl: typeof out.image_url === "string" ? out.image_url : undefined,
      renderer: typeof out.renderer === "string" ? out.renderer : undefined,
    };
    attachJob(order.payment.claimId, { input: item.prompt, result: out });
  } catch (error) {
    result = { prompt: item.prompt, error: `Paid, but the render failed again: ${(error as Error).message}` };
  }
  const s = readStory();
  const o = s.orders.find((x) => x.id === orderId)!;
  o.result = result;
  o.checks = [
    ...o.checks.filter((c) => c.label !== "Seller delivered"),
    { label: "Seller delivered", ok: !result.error, detail: result.error ?? "Delivered on retry; the original payment covers it" },
  ];
  audit(s, result.error ? "DELIVERY_FAILED" : "DELIVERED", `${o.item}: ${result.error ?? "delivered on retry, no new payment"}`, o.id);
  return save(s);
}

export async function buyOnCard(itemId: string) {
  const item = CARD_ITEMS.find((i) => i.id === itemId);
  if (!item) throw new Error("Unknown item.");
  if (item.rail === "ap4m") return buyOverAp4m(item);

  const s = readStory();
  const p = policy();
  const f = financing(s);
  const amount = cents(item.amount);
  const withinLimit = amount <= cents(p.cardLimit);
  const funded = amount <= cents(f.remaining);

  const checks: Check[] = [
    { label: "Card budget", ok: funded, detail: `${item.amount} of ${f.remaining} RLUSD remaining` },
    { label: "Owner's per-purchase limit", ok: withinLimit, detail: `${item.amount} vs ${p.cardLimit} RLUSD limit` },
  ];
  let status: CardOrder["status"];
  let reason: string;
  if (!f.accepted) {
    status = "declined";
    reason = "No card budget yet: accept a demo financing quote first";
  } else if (!funded) {
    status = "declined";
    reason = "Not enough card budget";
  } else if (!withinLimit) {
    status = "blocked";
    reason = "Over the owner's per-purchase limit: blocked before payment, owner approval required";
  } else {
    status = "approved";
    reason = "Within budget and limit: card authorization approved (simulated)";
    checks.push({ label: "Card authorization", ok: true, detail: "Simulated approval; no network or issuer call" });
  }

  return record({ itemId: item.id, item: item.name, merchant: item.merchant, amount: item.amount, status, reason, checks, rail: "card" });
}

function challengeMessage(order: CardOrder, agent: string, expiresAt: string, nonce: string) {
  const p = policy();
  return [
    "NEXXEN OWNER APPROVAL - ONE EXCEPTION",
    "Business: NEXXEN demo business",
    `Agent: ${agent}`,
    `Request: ${order.id}`,
    `Item: ${order.item.replace("·", "-")}`,
    `Merchant: ${order.merchant}`,
    `Amount: ${order.amount} RLUSD`,
    `Exception: per-purchase limit (${p.cardLimit} RLUSD) for this request only`,
    "Uses: once",
    `Expires: ${expiresAt}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export function prepareApproval(orderId: string, agent: string) {
  const s = readStory();
  const order = s.orders.find((o) => o.id === orderId);
  if (!order || order.status !== "blocked") throw new Error("Only a blocked request can be sent for approval.");
  if (cents(order.amount) > cents(policy().exceptionMax)) throw new Error("Request is above the owner's exception authority.");
  if (s.approvals.some((a) => a.orderId === orderId && a.status === "consumed")) throw new Error("This request is already approved.");
  const expiresAt = new Date(Date.now() + policy().approvalTtlSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const approval: Approval = {
    id: randomUUID(),
    at: new Date().toISOString(),
    orderId,
    message: challengeMessage(order, agent, expiresAt, randomBytes(16).toString("hex")),
    expiresAt,
    status: "pending",
    expectedSigner: policy().owner,
  };
  // One live challenge per request.
  s.approvals = s.approvals.filter((a) => !(a.orderId === orderId && a.status === "pending"));
  s.approvals.unshift(approval);
  audit(s, "APPROVAL_REQUESTED", `Owner approval requested for ${order.item} · ${order.amount} RLUSD`, approval.id);
  return save(s);
}

export function submitApproval(approvalId: string, signature: string, via: "wallet" | "pasted") {
  const owner = policy().owner;
  if (!owner) throw new Error("OWNER_APPROVER_ADDRESS is not set, so no signature can be trusted.");
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error("Signature must be a 65-byte hex string.");
  const s = readStory();
  const a = s.approvals.find((x) => x.id === approvalId);
  if (!a || a.status !== "pending") throw new Error("Approval request is unknown, denied or already used.");
  if (Date.now() >= Date.parse(a.expiresAt)) throw new Error("Approval request expired; prepare a new one.");
  if (a.expectedSigner !== owner) throw new Error("The owner address changed; prepare a new approval request.");
  const order = s.orders.find((o) => o.id === a.orderId);
  if (!order || order.status !== "blocked") throw new Error("The original request is no longer blocked.");

  let signer: string;
  try {
    signer = ethers.getAddress(ethers.verifyMessage(a.message, signature));
  } catch {
    throw new Error("Signature could not be verified.");
  }
  if (signer !== owner) {
    audit(s, "APPROVAL_REJECTED", `Signature from ${signer} is not the owner's key`, a.id);
    save(s);
    throw new Error(`Signed by ${signer}, not the owner's key ${owner}.`);
  }
  if (cents(order.amount) > cents(financing(s).remaining)) throw new Error("A signature creates no funds: card budget is insufficient.");

  // The original blocked request is kept as-is; a separate reservation consumes budget once.
  const reservation: CardOrder = {
    id: randomUUID(),
    at: new Date().toISOString(),
    itemId: order.itemId,
    item: order.item,
    merchant: order.merchant,
    amount: order.amount,
    status: "reserved",
    reason: "Reserved under the owner's signed one-time exception",
    checks: [
      { label: "Owner signature", ok: true, detail: `Recovered ${signer}` },
      { label: "Card budget", ok: true, detail: `${order.amount} of ${financing(s).remaining} RLUSD remaining` },
    ],
    fromOrderId: order.id,
    approvalId: a.id,
    rail: "card",
  };
  s.orders.unshift(reservation);
  Object.assign(a, { status: "consumed", signer, signature, via, verifiedAt: new Date().toISOString(), reservationId: reservation.id });
  audit(s, "APPROVAL_SIGNED", `Owner ${signer} signed one exception for request ${order.id.slice(0, 8)}`, a.id);
  audit(s, "RESERVED", `Reserved ${order.amount} RLUSD for ${order.item}; original request stays blocked`, reservation.id);
  return save(s);
}

export function denyApproval(approvalId: string) {
  const s = readStory();
  const a = s.approvals.find((x) => x.id === approvalId);
  if (!a || a.status !== "pending") throw new Error("Approval request is not pending.");
  a.status = "denied";
  audit(s, "APPROVAL_DENIED", "Owner denied the exception; the request stays blocked", a.id);
  return save(s);
}

/** Start a fresh rehearsal. The previous run is kept in story-archive.json. */
export function resetStory() {
  const s = readStory();
  const archive = join(env().stateDir, "story-archive.json");
  let runs: Story[] = [];
  try {
    runs = JSON.parse(readFileSync(archive, "utf8"));
  } catch {}
  if (s.audit.length) writeFileSync(archive, JSON.stringify([s, ...runs].slice(0, 50), null, 2));
  return save(empty(s.run + 1));
}
