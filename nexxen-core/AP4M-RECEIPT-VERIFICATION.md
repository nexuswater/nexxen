# Read-only AP4M receipt verification

This next step verifies an **already completed** AP4M testnet payout. It cannot create a purchase, sign, redeem, fund a card, authorize a card transaction, reverse a hold or clear a transaction. No private key, API token or `.env.local` is needed. The existing $1 Marqeta hold is unchanged.

## Inputs still required

An actual NEXXEN claim ID and settlement digest, plus the independently expected channel ID, merchant payout address and exact paid RLUSD base-unit amount. Do not copy expected identity/amount from untrusted receipt content just to make it pass. Do not supply a fixture/demo receipt. The amount is an integer string with 18 decimals: **0.001 test RLUSD = `1000000000000000` base units**; **0.01 = `10000000000000000`**. Neither amount implies a USD allocation or conversion rate. No new spend is authorized by these instructions.

Create `data/ap4m-expected-order.json` locally with these five fields, replacing placeholders with the actual approved order:
```json
{
  "claimId": "<actual bytes32 claim>",
  "channelId": "<actual bytes32 channel>",
  "settlementDigest": "<actual bytes32 settlement digest>",
  "payout": "<actual approved payout address>",
  "expectedRlusdBaseUnits": "<exact positive integer amount>"
}
```
The placeholders deliberately do not pass validation. `data/` is ignored. No credentials belong in this file.

## Isolated dependency setup

From `nexxen-core/` in the reorganized repository (or the existing local core project):
```sh
cd tools/ap4m-verifier
node setup.mjs
npm install --ignore-scripts --no-audit --no-fund
node verify.mjs ../../data/ap4m-expected-order.json
```
`setup.mjs` downloads inert public SDK bytes and verifies the inspected SHA512 before saving the package; it does not install or execute sponsor code. The separate package uses **@ap4m/sdk 0.10.1** and **ethers 6.17.0**, with no dependency change to the fixture dashboard. Installation needs ordinary package-registry access; no account or signer is involved. Keep the generated lockfile for reproducibility. Do not proceed past an integrity failure or replace the pinned SDK with an unreviewed archive.

The runner imports the actual SDK `verifyClaimReceipt`, not a replacement or a simulated verifier. It performs only public GET requests and read-only chain RPC against pinned public hosts, uses no env loader, disables provider caching for fresh canonicality checks, and gives the SDK a restricted read-only provider interface. Raw provider error bodies are not printed.

## What is checked

- Pinned XRPL EVM testnet chain **1449000**, published ledger/vault/RLUSD deployment, public receipt-context schema and full context snapshot (captured 2026-10-24 22:07:55 UTC): manifest/configuration digests, deployment block 9192133 and published confirmation policy 1. A context change stops pending review; one published confirmation is not a guarantee against every future reorganization.
- Explicit expected claim/channel/settlement digest/payout/exact amount, before SDK verification.
- SDK verification of ledger claim anchoring, immutable vault payout, ClaimPaid/VoucherRedeemed/SettlementRecorded events, exact token transfer, historical balances and canonical finality.
- A separately extracted **unique ERC20 Transfer index**, with exact vault→payout and amount. `vaultPayoutEvidence.logIndex` is the **ClaimPaid** index and must not be used as the Transfer index.
- A fresh canonical payout fence after extraction. SDK rejection, wrong network, incomplete finality, ambiguous transfer or mismatched identity fails closed.

Successful output distinguishes the payout transaction from the later settlement-anchor transaction. The existing gate's legacy `settlementTxHash` claim-resolver field means the **payout transaction hash**. `createReceiptClaimResolver` adapts the verified result accordingly; no sandbox operation is invoked by the runner. The durable gate also binds the expected settlement digest in its approval digest.

## Evidence limits

The resolver's adversarial tests inject mocked SDK/provider results to test boundaries; they are **not live payout evidence**. The real dependency runtime and a real NEXXEN receipt must be exercised before claiming an AP4M payment verified. No real receipt was supplied or checked during this implementation. An RPC must support the historical calls/logs used by the official verifier; failure is not success and must not be bypassed. This verification does not prove RLUSD-to-Marqeta conversion or merchant GPU delivery.

Sources inspected: [public receipt context](https://hackathon.ap4m.build/public/evidence/context), [official SDK archive](https://hackathon.ap4m.build/sdk/ap4m-sdk.tgz), [official verification example](https://hackathon.ap4m.build/sdk/verify-receipt.mjs). SDK SHA512: `TXzVFZbzIdwS/Jh51zSsajXHK0pS1BawMjn7Xsoz1LYTLsHJkzCsOJTJzgABH1+VEKWYur5HRe305z7Mw8yYjQ==`.
