/**
 * NEXXEN x402 Merchants: one AP4M Merchant server per paid service in
 * src/config/services.json, all paying out to the team's Merchant payout wallet.
 *
 *   pnpm merchants
 *
 * Needs AP4M_API_URL, MERCHANT_ID and MERCHANT_PAYOUT in .env.local (see
 * .env.example). Each server redeems Vouchers on-chain from
 * MERCHANT_SUBMITTER_KEY, or the Agent wallet when unset, which needs XRP for gas.
 */
import { boundedSubmitter } from "./bounded-submitter.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import { contentFor } from "../src/lib/ap4m/content.mjs";
import { createX402Merchant, loadX402Context } from "../src/lib/ap4m/kit/ap4m-x402.mjs";

const services = JSON.parse(readFileSync(new URL("../src/config/services.json", import.meta.url), "utf8"));

// Minimal .env.local loader (KEY=VALUE lines) so this runs with plain `node`.
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const API = process.env.AP4M_API_URL || "https://hackathon.ap4m.build";
const { MERCHANT_ID, MERCHANT_PAYOUT } = process.env;
// Redemptions are plain transactions, so any wallet with XRP gas can send them; default to the Agent wallet.
const MERCHANT_SUBMITTER_KEY = process.env.MERCHANT_SUBMITTER_KEY || process.env.AGENT_PRIVATE_KEY;
const CITY = process.env.NEXXEN_CITY || "Bengaluru";

if (!MERCHANT_ID || !MERCHANT_PAYOUT || !MERCHANT_SUBMITTER_KEY) {
  console.error("Set MERCHANT_ID, MERCHANT_PAYOUT and AGENT_PRIVATE_KEY (or MERCHANT_SUBMITTER_KEY) in .env.local (from the AP4M portal, My setup).");
  process.exit(1);
}


const context = await loadX402Context(API);
const config = await (await fetch(`${API}/public/config`)).json();
const provider = new ethers.JsonRpcProvider(process.env.AP4M_RPC_URL || config.network.rpcUrl);
const submitter = boundedSubmitter(new ethers.Wallet(MERCHANT_SUBMITTER_KEY, provider), provider);

const running = [];
for (const s of services) {
  const resourceUrl = `http://127.0.0.1:${s.port}/resource`;
  const amount = ethers.parseUnits(s.priceRlusd, 18).toString();
  const content = { service: s.id, seller: s.seller, ...(await contentFor(s.id, CITY)) };
  // A Merchant store is bound to its price and content, so each configuration gets its own
  // directory; earlier stores (and their redemption records) are kept.
  const version = createHash("sha256").update(JSON.stringify({ amount, content, MERCHANT_ID, MERCHANT_PAYOUT })).digest("hex").slice(0, 10);
  const merchant = createX402Merchant({
    context,
    provider,
    submitter,
    stateDirectory: `.ap4m/merchant-${s.id}-${version}`,
    resourceUrl,
    merchantParticipantId: MERCHANT_ID,
    payout: MERCHANT_PAYOUT,
    amount,
    content,
  });
  merchant.server.listen(s.port, "127.0.0.1", () =>
    console.log(`${s.seller.padEnd(14)} ${s.name.padEnd(28)} ${s.priceRlusd} RLUSD  ${resourceUrl}`),
  );
  running.push(merchant);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => Promise.allSettled(running.map((m) => m.close())).finally(() => process.exit(0)));
}
