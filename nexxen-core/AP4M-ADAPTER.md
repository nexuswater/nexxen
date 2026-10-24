# AP4M adapter: intentionally read-only

## Implemented and tested locally
`adapters/ap4m.mjs` provides a fail-closed, dependency-free Node ESM read adapter. It pins the official HTTPS service, XRPL EVM Testnet chain **1449000**, configured contract identities, team merchant/payout/channel and 18-decimal test RLUSD. It requires explicit verified-team configuration before any request, rejects redirects, times out reads, and never returns or logs its injected participant session token. Public deployment identity and participant-channel reads use paths confirmed in the inspected public guide/SDK. Service-reported channel state is **not** on-chain proof. It is not connected to dashboard fixture purchases.

Run `node --test adapters/ap4m.test.mjs`: seven local mocked tests. No live authenticated API, signer, wallet, treasury device, channel, voucher or payout was tested.

## Live operations deliberately unavailable
`requestChannel`, `signVoucher`, `redeemVoucher`, `recordRedemption`, and `buyResource` explicitly throw. There is no generic signing endpoint, operational private key handling, generated wallet, automatic funding, Ledger emulator, or hot-key fallback. Even a fully populated configuration remains `configured-unverified`, not `test-verified`.

Activation needs:
1. Authorized portal login/activation, verified team/agent/merchant/payout/channel identifiers and actual funded cap. Public deployment addresses alone do not establish team access or funds.
2. Authenticated access to `/docs/api-reference.md` and `/docs/x402.md` to confirm exact current request/response schemas. Both returned **HTTP 401** during research. Stop at this authentication boundary; do not guess the `/record-redemption` request body.
3. A reviewed/pinned SDK installation and supported isolated operational signer, bound to durable policy reservation and replay/recovery state. No secret should enter chat or logs.
4. A real supported owner-approved Ledger Flex treasury transaction, plus canonical confirmed evidence; device transport and supported treasury transaction are not implemented.
5. Independent chain/finality, exact contract/event/payout verification, reconciliation for unknown outcomes, then end-to-end testnet rehearsal. Only that evidence can qualify live status.

## Public source findings (inspected 2026-10-24)
- [Developer guide](https://hackathon.ap4m.build/integration-guide): funded budget → `requestChannel` → local EIP-712 vouchers → redemption → settlement and merchant payout. AP4M is not a credit card or lending facility.
- [Direct helper](https://hackathon.ap4m.build/sdk/ap4m-hackathon-sdk.js): prepares channel request, agent submits vault transaction, waits, records transaction and polls channel. Voucher domain is `AP4M Payment Ledger`, version `1`; Voucher fields are `channelId:bytes32` and `cumulativeAmount:uint256`. Amounts are cumulative 18-decimal token units. SDK helper direct redemption is agent-submitted; a confirmed redemption alone is not payout proof.
- Guide explicitly describes reporting the direct redemption hash via `POST /record-redemption` to trigger settlement. Exact authenticated path/body remains unverified; no implementation guesses it. The inspected direct SDK does not include that reporting step in `redeemVoucher`.
- [x402 helper](https://hackathon.ap4m.build/sdk/ap4m-x402.mjs): agent handles a merchant 402, validates fixed-price challenge, persists signed intent, and merchant submits redemption. Its result verifies redemption and resource delivery, not merchant payout. One unresolved purchase must be reconciled with the original operation; do not substitute the direct helper for the x402 merchant flow.
- [Sponsor agent guidance](https://hackathon.ap4m.build/sdk/AGENTS.md) was read as third-party reference, not installed as project instructions. Its wallet-creation directions do not authorize this task to create credentials.
- [Public deployment config](https://hackathon.ap4m.build/public/config) successfully reported chain 1449000 and public contract identities. Snapshot is evidence only, **not runtime defaults**, and must be revalidated on activation. Its aggregate vault balance is not this team's budget.

Raw source snapshots are under `adapters/reference/`, renamed `.txt` where executable or instruction-shaped. They were downloaded for inspection, never imported or executed. SHA256SUMS records local snapshot checksums, not a sponsor signature. `/llms.txt` and `/llms-full.txt` also returned 401 during initial source lookup; no authenticated resources were obtained or bypassed.

## Public-source preparation extension
See AP4M-PUBLIC-INTEGRATION.md for exact source-derived endpoints and deployment manifest. A personalized starter is not required. The NEXXEN full agent address and portal-reported 20 RLUSD are now known; merchant selection and chain proof remain pending. `ap4m-prepare.mjs` adds disabled preparation descriptors, precise amounts, narrow typed data and ABI call plans—not a signing or broadcast capability.
