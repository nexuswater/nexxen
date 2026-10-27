/**
 * Display fixture for the sandbox virtual card.
 *
 * PAN, last four, CVV, and expiration are copied from the public sample
 * response on Marqeta's "Show card PAN" page:
 * https://www.marqeta.com/docs/core-api/cards/show-pan
 *
 * That sample is documentation, not a NEXXEN account, not a live credential,
 * and not a card this app can charge. Do not import this module from API
 * routes, spend policy, limits, lending, payments, wallet, or signing code.
 *
 * The published sample's `expiration` field is "1220" while its
 * `expiration_time` is "2026-12-31T23:59:59Z". This fixture keeps `expiration`
 * as published and does not invent a corrected date.
 *
 * Cardholder name is the repo's own sandbox fixture user
 * (first_name NEXXEN, last_name Sandbox in nexxen-core setup), not the
 * docs sample name line.
 */

export const MARQETA_SANDBOX_VIRTUAL_CARD = {
  kind: "sandbox-fixture",
  sourceLabel: "SANDBOX DATA ONLY",
  sourceName: "Marqeta public showpan sample",
  sourceUrl: "https://www.marqeta.com/docs/core-api/cards/show-pan",
  cardholderName: "NEXXEN SANDBOX",
  pan: "1111111824981865",
  lastFour: "1865",
  expiration: "1220",
  cvv: "137",
  networkName: "XRPL EVM Sidechain",
  environmentName: "Testnet",
} as const;

function assertSandboxFixture(card: typeof MARQETA_SANDBOX_VIRTUAL_CARD) {
  if (!/^\d{16}$/.test(card.pan) || !card.pan.endsWith(card.lastFour) || card.lastFour.length !== 4) {
    throw new Error("Sandbox fixture PAN must be 16 digits ending in lastFour");
  }
  if (!/^\d{3}$/.test(card.cvv)) {
    throw new Error("Sandbox fixture CVV must be 3 digits");
  }
  if (!/^\d{4}$/.test(card.expiration)) {
    throw new Error("Sandbox fixture expiration must be four digits (MMYY)");
  }
}

assertSandboxFixture(MARQETA_SANDBOX_VIRTUAL_CARD);

export function groupPan(pan: string): string {
  return pan.replace(/(.{4})/g, "$1 ").trim();
}

export function maskPan(lastFour: string): string {
  return `•••• •••• •••• ${lastFour}`;
}

export function formatExpiration(mmyy: string): string {
  return `${mmyy.slice(0, 2)}/${mmyy.slice(2, 4)}`;
}
