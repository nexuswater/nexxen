import { join } from "node:path";
import { decodeX402PaymentRequired } from "@ap4m/sdk";
import { ethers } from "ethers";
import * as demo from "./demo";
import sdk from "./kit/ap4m-hackathon-sdk.cjs";
import { buyResource, loadX402Context } from "./kit/ap4m-x402.mjs";
import { blockApprover } from "./verev";
import {
  addEvent,
  checkChannelCap,
  checkPolicy,
  env,
  readJournal,
  rlusd,
  services,
  writeJournal,
  type Mode,
  type Purchase,
  type Service,
  type Settlement,
} from "./store";

export type { Purchase, Settlement } from "./store";
export { readJournal } from "./store";

/**
 * NEXXEN's AP4M agent. It decides and pays on its own inside the policy the
 * business sets once in .env.local (AP4M_MAX_PRICE per purchase,
 * AP4M_MAX_CHANNEL_CAP per Channel).
 *
 * AP4M_MODE picks the backend:
 *   live  Mastercard XRPL hackathon service (XRPL EVM Testnet, RLUSD)
 *   demo  local simulation with real signed Vouchers (see demo.ts)
 *   auto  live when the Agent wallet can sign in, otherwise demo (default)
 * Keys come only from the environment and never leave this process.
 */

type Channel = {
  channel_id: string;
  channel_status: string;
  cap_wei: string;
  payout: string;
  merchant_id: string;
  failure: string | null;
};

type State = {
  token?: { value: string; expires: number };
  config?: {
    network: { name: string; rpcUrl: string; explorerUrl: string; chainId: number };
    contracts: { paymentLedger: string };
  };
  context?: Awaited<ReturnType<typeof loadX402Context>>;
  mode?: { value: Mode; reason: string; checked: number };
  queue: Promise<unknown>;
};
const g = globalThis as unknown as { __ap4mAgent?: State };
const state: State = (g.__ap4mAgent ??= { queue: Promise.resolve() });

/** buyResource handles one purchase at a time per state directory. */
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = state.queue.then(fn, fn);
  state.queue = next.catch(() => undefined);
  return next;
}

// ── Mode ──

export async function mode(): Promise<{ value: Mode; reason: string }> {
  const e = env();
  if (e.mode === "demo") return { value: "demo", reason: "AP4M_MODE=demo" };
  if (e.mode === "live") return { value: "live", reason: "AP4M_MODE=live" };
  if (state.mode && Date.now() - state.mode.checked < 60_000) return state.mode;

  const missing = [!e.teamName && "AP4M_TEAM_NAME", !e.agentKey && "AGENT_PRIVATE_KEY"].filter(Boolean);
  let result: { value: Mode; reason: string };
  if (missing.length) {
    result = { value: "demo", reason: `Live AP4M needs ${missing.join(", ")} in .env.local` };
  } else {
    try {
      await token();
      result = { value: "live", reason: "Agent wallet signed in to AP4M" };
    } catch (error) {
      result = { value: "demo", reason: (error as Error).message };
    }
  }
  state.mode = { ...result, checked: Date.now() };
  return result;
}

// ── Live AP4M ──

async function config() {
  state.config ??= await (await fetch(`${env().apiUrl}/public/config`)).json();
  return state.config!;
}

async function chain() {
  const c = await config();
  const provider = new ethers.JsonRpcProvider(process.env.AP4M_RPC_URL || c.network.rpcUrl);
  const wallet = new ethers.Wallet(env().agentKey, provider);
  return { provider, wallet, c };
}

async function token() {
  if (state.token && state.token.expires > Date.now() + 60_000) return state.token.value;
  const { wallet } = await chain();
  const session = await sdk.signIn(env().apiUrl, env().teamName, wallet).catch((error: Error) => {
    throw new Error(
      `${error.message} The Agent wallet ${wallet.address} is not on team "${env().teamName}" yet: sign in to ` +
        `https://hackathon.ap4m.build/participant with the team's funding wallet and add it under My setup ` +
        `(AP4M_TEAM_NAME in .env.local must match the registered team name).`,
    );
  });
  state.token = { value: session.token, expires: Date.now() + session.expiresInSeconds * 1000 };
  return session.token;
}

async function liveStatus() {
  const c = await config();
  const { provider, wallet } = await chain();
  const [gas, channels] = await Promise.all([provider.getBalance(wallet.address), sdk.listChannels(env().apiUrl, await token())]);
  const detailed = await Promise.all(
    channels.map(async (ch) => {
      if (ch.channel_status !== "open") return { ...ch, cap: rlusd(ch.cap_wei), redeemed: null };
      const s = await sdk.getChannelState(provider, c.contracts.paymentLedger, ch.channel_id);
      return { ...ch, cap: rlusd(s.cap), redeemed: rlusd(s.redeemed) };
    }),
  );
  return {
    configured: true as const,
    mode: "live" as const,
    team: env().teamName,
    agent: wallet.address,
    gasXrp: ethers.formatEther(gas),
    policy: { maxChannelCapRlusd: env().maxChannelCap, maxPriceRlusd: env().maxPrice },
    network: c.network,
    contracts: c.contracts,
    channels: detailed,
  };
}

async function openChannelWithRoom(minimumRlusd: string) {
  const { provider, c } = await chain();
  const channels = (await sdk.listChannels(env().apiUrl, await token())) as Channel[];
  for (const ch of channels.filter((x) => x.channel_status === "open")) {
    const s = await sdk.getChannelState(provider, c.contracts.paymentLedger, ch.channel_id);
    if (s.cap - s.redeemed >= ethers.parseUnits(minimumRlusd, 18)) return ch.channel_id;
  }
  return null;
}

/** Live price from the Merchant's own 402 challenge (needs an open Channel). */
async function quote(service: Service, channelId: string) {
  const res = await fetch(`http://127.0.0.1:${service.port}/resource`, {
    headers: { "X-AP4M-CHANNEL-ID": channelId },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status !== 402) return { available: false, reason: `HTTP ${res.status}` };
  const required = decodeX402PaymentRequired(res.headers.get("PAYMENT-REQUIRED") ?? "");
  return { available: true, priceRlusd: rlusd(required.accepts[0].amount) };
}

async function liveServices() {
  const channelId = await openChannelWithRoom("0").catch(() => null);
  return Promise.all(
    services.map(async (s) => {
      const live = channelId
        ? await quote(s, channelId).catch(() => ({ available: false, reason: "merchant offline (run pnpm merchants)" }))
        : { available: null, reason: "no open Channel yet; listed price shown" };
      return {
        id: s.id,
        name: s.name,
        seller: s.seller,
        description: s.description,
        input: s.input,
        listedPriceRlusd: s.priceRlusd,
        ...live,
      };
    }),
  );
}

async function liveOpenChannel(capRlusd: string) {
  checkChannelCap(capRlusd);
  const { wallet } = await chain();
  const ch = await sdk.requestChannel(env().apiUrl, await token(), wallet, { capRlusd });
  return { channelId: ch.channel_id, status: ch.channel_status, capRlusd: rlusd(ch.cap_wei) };
}

/**
 * Buy one service over x402: read the Merchant's 402, check it against the
 * policy, sign the Voucher, let the Merchant redeem it on-chain, report it.
 */
/** An open Channel funded by an approved spending block, with room for `minimumRlusd`. */
async function blockChannelWithRoom(minimumRlusd: string) {
  const approved = new Set(readJournal().blocks.filter((b) => b.mode === "live").map((b) => b.channelId));
  if (!approved.size) return null;
  const { provider, c } = await chain();
  const channels = (await sdk.listChannels(env().apiUrl, await token())) as Channel[];
  for (const ch of channels.filter((x) => x.channel_status === "open" && approved.has(x.channel_id))) {
    const st = await sdk.getChannelState(provider, c.contracts.paymentLedger, ch.channel_id);
    if (st.cap - st.redeemed >= ethers.parseUnits(minimumRlusd, 18)) return ch.channel_id;
  }
  return null;
}

/**
 * Ask for a new spending block (VEREV, or the owner's policy until VEREV is
 * wired) and fund it as a Channel capped at the block size.
 */
async function openApprovedBlock(wallet: string) {
  const blockRlusd = env().blockSize;
  const bal = await liveBalance();
  const d = await blockApprover.approveBlock({
    agent: wallet,
    blockRlusd,
    availableRlusd: bal.availableRlusd,
    spentRlusd: bal.spentRlusd,
  });
  const label = d.decidedBy;
  if (d.decision !== "APPROVE") {
    addEvent({
      mode: "live",
      kind: "DECLINE",
      decision: d.decision,
      code: d.code,
      text: `${label} ${d.decision === "ASK_OWNER" ? "ASK OWNER" : "DECLINE"} · ${blockRlusd} RLUSD block · ${d.reason}`,
    });
    throw new Error(
      d.decision === "ASK_OWNER"
        ? `${label} needs the owner's approval for a ${blockRlusd} RLUSD block (${d.reason})`
        : `${label} declined a ${blockRlusd} RLUSD block (${d.reason})`,
    );
  }
  addEvent({ mode: "live", kind: label, decision: "APPROVE", text: `APPROVE · ${blockRlusd} RLUSD block · ${d.reason}` });
  const ch = await liveOpenChannel(blockRlusd);
  const j = readJournal();
  j.blocks.unshift({ at: new Date().toISOString(), mode: "live", channelId: ch.channelId, amountRlusd: blockRlusd, decidedBy: label, ref: d.ref });
  writeJournal(j);
  addEvent({ mode: "live", kind: "VOUCHER", text: `Channel opened · ${blockRlusd} RLUSD cap · ${short(ch.channelId)}` });
  return ch.channelId;
}

const short = (hex: string) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;

/**
 * Buy one service over x402 inside an approved spending block: read the
 * Merchant's 402, check the price policy, sign the cumulative Voucher, let the
 * Merchant redeem it on-chain, report it. One block decision per Channel.
 */
async function liveBuy(serviceId: string): Promise<Purchase> {
  const service = services.find((s) => s.id === serviceId);
  if (!service) throw new Error(`Unknown service ${serviceId}`);
  const { provider, wallet, c } = await chain();

  let channelId = await blockChannelWithRoom(service.priceRlusd);
  if (!channelId) channelId = await openApprovedBlock(wallet.address);

  const q = await quote(service, channelId);
  if (!q.available) throw new Error(`${service.seller} is unavailable: ${q.reason}`);
  addEvent({ mode: "live", kind: "402", text: `${service.seller} quotes ${q.priceRlusd} RLUSD per call` });
  try {
    checkPolicy(q.priceRlusd!, service.seller);
  } catch (error) {
    addEvent({ mode: "live", kind: "DECLINE", decision: "DECLINE", text: `POLICY DECLINE · ${(error as Error).message}` });
    throw error;
  }

  state.context ??= await loadX402Context(env().apiUrl);
  const purchase = await buyResource({
    context: state.context,
    provider,
    wallet,
    stateDirectory: join(env().stateDir, "agent"),
    resourceUrl: `http://127.0.0.1:${service.port}/resource`,
    channelId,
    maximumAmount: ethers.parseUnits(env().maxPrice, 18).toString(),
    operation: `${service.id}-${Date.now()}`,
  });
  const explorerUrl = `${c.network.explorerUrl}/tx/${purchase.transactionHash}`;
  addEvent({ mode: "live", kind: "VOUCHER", text: `EIP-712 signed · ${q.priceRlusd} RLUSD · channel ${short(channelId)}` });
  addEvent({
    mode: "live",
    kind: "SETTLED",
    text: `VoucherRedeemed · ${service.seller} · tx ${short(purchase.transactionHash)}`,
    txHash: purchase.transactionHash,
    explorerUrl,
  });

  const record = await fetch(`${env().apiUrl}/public/participant/record-redemption`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ tx_hash: purchase.transactionHash }),
  });
  if (!record.ok) console.warn("[ap4m] record-redemption failed", record.status, await record.text());

  const entry: Purchase = {
    mode: "live",
    at: new Date().toISOString(),
    serviceId: service.id,
    service: service.name,
    seller: service.seller,
    amountRlusd: q.priceRlusd!,
    channelId,
    claimId: purchase.claimId,
    txHash: purchase.transactionHash,
    explorerUrl,
    resource: purchase.resource,
  };
  const j = readJournal();
  j.purchases.unshift(entry);
  writeJournal(j);
  return entry;
}

async function liveSettle() {
  const c = await config();
  const j = readJournal();
  const settledClaims = new Set(j.settlements.flatMap((s) => s.receipts.map((r) => r.claim_id)));
  const channelIds = [
    ...new Set(j.purchases.filter((p) => p.mode === "live" && !settledClaims.has(p.claimId)).map((p) => p.channelId)),
  ];
  const results: Settlement[] = [];
  for (const channelId of channelIds) {
    const s = await sdk.settle(env().apiUrl, await token(), channelId);
    addEvent({
      mode: "live",
      kind: "PAYOUT",
      text: `RLUSD paid to seller · ${s.amount_rlusd} RLUSD · tx ${short(s.payout_tx)}`,
      txHash: s.payout_tx,
      explorerUrl: `${c.network.explorerUrl}/tx/${s.payout_tx}`,
    });
    results.push({
      mode: "live",
      at: new Date().toISOString(),
      channelId,
      amountRlusd: s.amount_rlusd,
      payoutTx: s.payout_tx,
      payoutExplorerUrl: `${c.network.explorerUrl}/tx/${s.payout_tx}`,
      receipts: s.receipts ?? [],
    });
  }
  if (results.length) {
    j.settlements.unshift(...results);
    writeJournal(j);
  }
  return results;
}

type Balance = {
  mode: Mode;
  budgetRlusd: string;
  spentRlusd: string;
  availableRlusd: string;
  channel: { id: string; capRlusd: string; spentRlusd: string; leftRlusd: string } | null;
  maxPricePerPurchaseRlusd: string;
};

/** Team budget (organizer allocation) minus everything redeemed on the team's Channels. */
async function liveBalance(): Promise<Balance> {
  const { provider, c } = await chain();
  const me = await (
    await fetch(`${env().apiUrl}/public/participant/me`, { headers: { Authorization: `Bearer ${await token()}` } })
  ).json();
  const budget = ethers.parseUnits(String(me.team?.rlusd_allocation ?? me.paymentState?.allocation_cap ?? "0"), 18);
  const channels = (await sdk.listChannels(env().apiUrl, await token())).filter((ch) => ch.channel_status !== "failed");
  let spent = BigInt(0);
  let open: Balance["channel"] = null;
  for (const ch of channels) {
    const st = await sdk.getChannelState(provider, c.contracts.paymentLedger, ch.channel_id);
    spent += st.redeemed;
    if (ch.channel_status === "open" && !open) {
      open = { id: ch.channel_id, capRlusd: rlusd(st.cap), spentRlusd: rlusd(st.redeemed), leftRlusd: rlusd(st.cap - st.redeemed) };
    }
  }
  return {
    mode: "live",
    budgetRlusd: rlusd(budget),
    spentRlusd: rlusd(spent),
    availableRlusd: rlusd(budget - spent),
    channel: open,
    maxPricePerPurchaseRlusd: env().maxPrice,
  };
}

// ── Public API (used by tools and the UI) ──

/** Agent wallet address and XRP gas balance (null in demo, where no gas is spent). */
export async function wallet() {
  const m = await mode();
  if (m.value === "demo") return { mode: m.value, address: demo.status(m.reason).agent, xrp: null, explorerUrl: null };
  const { provider, wallet: w, c } = await chain();
  return {
    mode: m.value,
    address: w.address,
    xrp: ethers.formatEther(await provider.getBalance(w.address)),
    explorerUrl: `${c.network.explorerUrl}/address/${w.address}`,
  };
}

export async function balance(): Promise<Balance> {
  return (await mode()).value === "live" ? liveBalance() : demo.balance();
}

export async function status() {
  const m = await mode();
  return m.value === "live" ? liveStatus() : demo.status(m.reason);
}

export async function listServices() {
  return (await mode()).value === "live" ? liveServices() : demo.listServices();
}

export async function openChannel(capRlusd: string) {
  return (await mode()).value === "live" ? liveOpenChannel(capRlusd) : demo.openChannel(capRlusd);
}

export function buyService(serviceId: string) {
  return serialized(async () => ((await mode()).value === "live" ? liveBuy(serviceId) : demo.buyService(serviceId)));
}

export async function settleAll() {
  return (await mode()).value === "live" ? liveSettle() : demo.settleAll();
}
