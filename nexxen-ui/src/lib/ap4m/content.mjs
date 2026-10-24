/**
 * What each x402 Merchant returns once a Voucher is redeemed: a single-job
 * grant. x402 Merchants serve fixed content, so the AI job itself runs after
 * payment (src/lib/ap4m/ai-tools.ts) on the buyer's input.
 */
export async function contentFor(id) {
  return { grant: "one job", service: id, terms: "Runs once on the buyer's input after on-chain redemption." };
}
