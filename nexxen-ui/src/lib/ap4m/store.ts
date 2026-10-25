import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ethers } from "ethers";
import services from "@/config/services.json";

/** Settings, types and the purchase journal shared by live and demo mode. */

export const env = () => ({
  mode: (process.env.AP4M_MODE || "auto") as "auto" | "live" | "demo",
  apiUrl: process.env.AP4M_API_URL || "https://hackathon.ap4m.build",
  teamName: process.env.AP4M_TEAM_NAME ?? "",
  agentKey: process.env.AGENT_PRIVATE_KEY ?? "",
  maxChannelCap: process.env.AP4M_MAX_CHANNEL_CAP || "2",
  maxPrice: process.env.AP4M_MAX_PRICE || "1",
  /** Size of one VEREV-approved spending block (= the cap of the Channel it funds). */
  blockSize: process.env.AP4M_BLOCK_RLUSD || process.env.AP4M_MAX_CHANNEL_CAP || "0.1",
  stateDir: process.env.AP4M_STATE_DIR || ".ap4m",
  city: process.env.NEXXEN_CITY || "Bengaluru",
});

export type Mode = "live" | "demo";
export type Service = (typeof services)[number];
export { services };

export type Purchase = {
  mode: Mode;
  at: string;
  serviceId: string;
  service: string;
  seller: string;
  amountRlusd: string;
  channelId: string;
  claimId: string;
  txHash: string;
  explorerUrl: string | null;
  resource: unknown;
  /** The AI job run after payment, on the buyer's input. */
  job?: { input: string; result?: Record<string, unknown>; error?: string };
};

export type Settlement = {
  mode: Mode;
  at: string;
  channelId: string;
  amountRlusd: string;
  payoutTx: string;
  payoutExplorerUrl: string | null;
  receipts: { claim_id: string; amount_rlusd: string; receipt_url: string | null }[];
};

export type DemoChannel = { channel_id: string; channel_status: "open" | "closed"; cap: string; redeemed: string };

/** One line of the live feed. Kinds follow the team's flow vocabulary. */
export type FeedEvent = {
  at: string;
  mode: Mode;
  kind: "402" | "VEREV" | "POLICY" | "VOUCHER" | "SETTLED" | "PAYOUT" | "DECLINE" | "ERROR";
  text: string;
  /** VEREV/policy outcome for decision lines. */
  decision?: "APPROVE" | "ASK_OWNER" | "DECLINE";
  code?: number;
  txHash?: string;
  explorerUrl?: string | null;
};

/** A spending block: one decision covers one Channel, whose on-chain cap enforces it. */
export type Block = {
  at: string;
  mode: Mode;
  channelId: string;
  amountRlusd: string;
  decidedBy: "VEREV" | "POLICY";
  ref?: string;
};

export type Journal = {
  purchases: Purchase[];
  settlements: Settlement[];
  demoChannels: DemoChannel[];
  events: FeedEvent[];
  blocks: Block[];
};

function journalFile() {
  mkdirSync(env().stateDir, { recursive: true, mode: 0o700 });
  return join(env().stateDir, "journal.json");
}

export function readJournal(): Journal {
  try {
    const j = JSON.parse(readFileSync(journalFile(), "utf8"));
    return { purchases: [], settlements: [], demoChannels: [], events: [], blocks: [], ...j };
  } catch {
    return { purchases: [], settlements: [], demoChannels: [], events: [], blocks: [] };
  }
}

export function writeJournal(j: Journal) {
  writeFileSync(journalFile(), JSON.stringify(j, null, 2));
}

export function attachJob(claimId: string, job: NonNullable<Purchase["job"]>) {
  const j = readJournal();
  const p = j.purchases.find((x) => x.claimId === claimId);
  if (p) {
    p.job = job;
    writeJournal(j);
  }
}

export function addEvent(event: Omit<FeedEvent, "at">) {
  const j = readJournal();
  j.events.unshift({ at: new Date().toISOString(), ...event });
  j.events = j.events.slice(0, 500);
  writeJournal(j);
}

export const rlusd = (wei: bigint | string) => ethers.formatUnits(wei, 18);

export function checkPolicy(priceRlusd: string, seller: string) {
  if (Number(priceRlusd) > Number(env().maxPrice)) {
    throw new Error(`${seller} asks ${priceRlusd} RLUSD, above the ${env().maxPrice} RLUSD per-purchase policy`);
  }
}

export function checkChannelCap(capRlusd: string) {
  if (Number(capRlusd) <= 0 || Number(capRlusd) > Number(env().maxChannelCap)) {
    throw new Error(`Channel cap must be > 0 and ≤ the business policy of ${env().maxChannelCap} RLUSD`);
  }
}
