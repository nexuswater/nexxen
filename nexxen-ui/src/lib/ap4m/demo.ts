import { randomBytes } from "node:crypto";
import { ethers } from "ethers";
import { contentFor } from "./content.mjs";
import {
  checkChannelCap,
  checkPolicy,
  env,
  readJournal,
  services,
  writeJournal,
  type Purchase,
  type Settlement,
} from "./store";

/**
 * Demo mode: the same AP4M purchase flow, run locally until the team's Agent
 * wallet is onboarded on the hackathon service. The agent still signs real
 * EIP-712 Vouchers (same domain and cumulative amounts as the AP4M SDK) and
 * each one is verified before the service is delivered; the Channel, the
 * on-chain redemption and the RLUSD payout are simulated and labelled as such.
 */

const CHAIN_ID = 1449000;
const LEDGER = process.env.AP4M_PAYMENT_LEDGER || "0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91";
const DOMAIN = { name: "AP4M Payment Ledger", version: "1", chainId: CHAIN_ID, verifyingContract: LEDGER };
const TYPES = { Voucher: [{ name: "channelId", type: "bytes32" }, { name: "cumulativeAmount", type: "uint256" }] };

const g = globalThis as unknown as { __ap4mDemoWallet?: ethers.Wallet };
const wallet = () =>
  (g.__ap4mDemoWallet ??= env().agentKey ? new ethers.Wallet(env().agentKey) : (ethers.Wallet.createRandom() as unknown as ethers.Wallet));

const demoHash = () => `0x${randomBytes(32).toString("hex")}`;

export function status(reason: string) {
  return {
    configured: true as const,
    mode: "demo" as const,
    demoReason: reason,
    team: env().teamName || "NEXXEN",
    agent: wallet().address,
    gasXrp: null,
    policy: { maxChannelCapRlusd: env().maxChannelCap, maxPriceRlusd: env().maxPrice },
    network: { name: "Demo (local AP4M simulation)", explorerUrl: null, chainId: CHAIN_ID },
    contracts: { paymentLedger: LEDGER },
    channels: readJournal().demoChannels.map((c) => ({ ...c, cap_wei: ethers.parseUnits(c.cap, 18).toString() })),
  };
}

const DEMO_BUDGET = process.env.AP4M_DEMO_BUDGET || "20";

export function balance() {
  const channels = readJournal().demoChannels;
  const spent = channels.reduce((sum, c) => sum + ethers.parseUnits(c.redeemed, 18), BigInt(0));
  const budget = ethers.parseUnits(DEMO_BUDGET, 18);
  const open = channels.find((c) => c.channel_status === "open");
  return {
    mode: "demo" as const,
    budgetRlusd: ethers.formatUnits(budget, 18),
    spentRlusd: ethers.formatUnits(spent, 18),
    availableRlusd: ethers.formatUnits(budget - spent, 18),
    channel: open
      ? {
          id: open.channel_id,
          capRlusd: open.cap,
          spentRlusd: open.redeemed,
          leftRlusd: ethers.formatUnits(ethers.parseUnits(open.cap, 18) - ethers.parseUnits(open.redeemed, 18), 18),
        }
      : null,
    maxPricePerPurchaseRlusd: env().maxPrice,
  };
}

export function listServices() {
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    seller: s.seller,
    description: s.description,
    input: s.input,
    listedPriceRlusd: s.priceRlusd,
    available: true,
    priceRlusd: s.priceRlusd,
  }));
}

export function openChannel(capRlusd: string) {
  checkChannelCap(capRlusd);
  const j = readJournal();
  const channel = { channel_id: demoHash(), channel_status: "open" as const, cap: capRlusd, redeemed: "0" };
  j.demoChannels.unshift(channel);
  writeJournal(j);
  return { channelId: channel.channel_id, status: "open", capRlusd };
}

export async function buyService(serviceId: string): Promise<Purchase> {
  const service = services.find((s) => s.id === serviceId);
  if (!service) throw new Error(`Unknown service ${serviceId}`);
  // 1. The seller's 402 challenge: a fixed price for this resource.
  const price = service.priceRlusd;
  checkPolicy(price, service.seller);

  // 2. A Channel with room, or a new one within policy.
  const priceWei = ethers.parseUnits(price, 18);
  let j = readJournal();
  let channel = j.demoChannels.find(
    (c) => c.channel_status === "open" && ethers.parseUnits(c.cap, 18) - ethers.parseUnits(c.redeemed, 18) >= priceWei,
  );
  if (!channel) {
    openChannel(env().maxChannelCap);
    j = readJournal();
    channel = j.demoChannels[0];
  }

  // 3. Sign the cumulative Voucher; the seller verifies it before delivering.
  const cumulative = ethers.parseUnits(channel.redeemed, 18) + priceWei;
  const voucher = { channelId: channel.channel_id, cumulativeAmount: cumulative };
  const signature = await wallet().signTypedData(DOMAIN, TYPES, voucher);
  const signer = ethers.verifyTypedData(DOMAIN, TYPES, voucher, signature);
  if (signer !== wallet().address) throw new Error("Voucher signature did not verify");

  // 4. Redemption (simulated) and delivery.
  channel.redeemed = ethers.formatUnits(cumulative, 18);
  const entry: Purchase = {
    mode: "demo",
    at: new Date().toISOString(),
    serviceId: service.id,
    service: service.name,
    seller: service.seller,
    amountRlusd: price,
    channelId: channel.channel_id,
    claimId: ethers.keccak256(signature),
    txHash: demoHash(),
    explorerUrl: null,
    resource: { service: service.id, seller: service.seller, ...(await contentFor(service.id)) },
  };
  j.purchases.unshift(entry);
  writeJournal(j);
  return entry;
}

export function settleAll(): Settlement[] {
  const j = readJournal();
  const settled = new Set(j.settlements.flatMap((s) => s.receipts.map((r) => r.claim_id)));
  const pending = j.purchases.filter((p) => p.mode === "demo" && !settled.has(p.claimId));
  const results: Settlement[] = [...new Set(pending.map((p) => p.channelId))].map((channelId) => {
    const claims = pending.filter((p) => p.channelId === channelId);
    return {
      mode: "demo",
      at: new Date().toISOString(),
      channelId,
      amountRlusd: ethers.formatUnits(claims.reduce((sum, p) => sum + ethers.parseUnits(p.amountRlusd, 18), BigInt(0)), 18),
      payoutTx: demoHash(),
      payoutExplorerUrl: null,
      receipts: claims.map((p) => ({ claim_id: p.claimId, amount_rlusd: p.amountRlusd, receipt_url: null })),
    };
  });
  if (results.length) {
    j.settlements.unshift(...results);
    writeJournal(j);
  }
  return results;
}
