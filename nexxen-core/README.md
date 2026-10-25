# NEXXEN

**Agent spending. Human control.** A runnable, payment-first hackathon MVP for business-owned agents.

## Run locally

Requires **Node.js 24+**. Install pinned dependencies with `npm ci --ignore-scripts --no-audit --no-fund`. No wallet or API key is required. Runtime rehearsals and quotes use local state only.

```sh
npm start
# Open http://127.0.0.1:3000
npm test
npm run check
```

The app enforces loopback binding: `HOST` accepts only `127.0.0.1`, `localhost`, or `::1`; other hosts fail before listening. `PORT` and `NEXXEN_DB` can override runtime settings. This demo has no authentication; do not expose it through a proxy or tunnel. Persistent demo state is stored in `data/nexxen.sqlite`. Stop the app and use a new `NEXXEN_DB` file for a fresh rehearsal. The app refuses `APP_MODE` values other than `simulation`; it does not read `.env` automatically.

## What works now

- Responsive business dashboard, service purchase, activity receipts, spending mandates, treasury-review queue, credit lab, separate Card lab, and integration status.
- Durable **SQLite `BEGIN IMMEDIATE` reservations**, idempotency, per-request and daily/weekly/monthly plus single-agent daily limits. Integer cents are local fixture accounting only, not the token's on-chain precision.
- UTC midnight daily boundaries, Monday-start weeks, calendar months. Outstanding obligations remain counted across boundaries and restarts; settled period usage resets without replenishing channel capacity.
- Within-limit fixture purchase: deterministic policy -> reservation -> clearly simulated delivery/redemption/payout. Over-limit requests are blocked before signing and queued for human review.
- Versioned deterministic credit fixtures: indicative quote or review. **No loan originated.**

## What is not live

All 20 RLUSD of demo capacity is **fixture money**. This fixture app submits no network transactions, provisions no resources, and performs no signatures, Ledger actions, live AP4M payments or payouts. A separate historical AP4M test payment has a verified payout; its proof and the Marqeta sandbox observations are displayed as timestamped historical evidence, not as outcomes of this app. AP4M is a funded payment rail, **not a credit card or loan**. The actual sponsor-approved test token must be verified before live integration. No bridge, real card issuance, native loan, lender deposit or investment implementation exists. The main **GPU funding cycle** models RLUSD → approved-provider stand-in → fixture USD card prefunding → fictional GPU merchant charge. The handoff uses independent RLUSD and USD fixtures without an exchange rate; every external outcome is explicitly simulated; no issuer, PAN, actual acceptance, conversion or purchase. RLUSD funding and USD spend remain separate, with source budget counted once and no invented income/debt. See [Card adapter](CARD-ADAPTER.md).

The Ledger review deliberately remains pending. A fixture policy edit is not device authorization and cannot expand the fixed fixture channel cap. Existing blocked orders remain immutable; a new request gets a new policy check. The app has one business and one agent, not production multitenant authorization.

Live adapters remain separate and fail closed until verified configuration and supported capabilities are provided. See [AP4M adapter status](AP4M-ADAPTER.md). No generic signing endpoint, treasury hot-key fallback or secrets-generation path is included.

## Quick rehearsal

Start with **GPU funding cycle** (`/#cards`): the default rehearsal reserves 0.01 fixture RLUSD and independently allocates $0.01 fixture USD. No exchange rate is asserted. The 0.02 RLUSD review example exceeds the dedicated 0.01 rehearsal cap and remains blocked. Shared owner limits and capacity still apply. Real historical AP4M and Marqeta observations stay separate. See [rehearsal notes](SIMULATED-HANDOFF.md). The following AP4M-only actions are diagnostic tests.


1. Buy **Inference burst (2 RLUSD)**: the receipt explicitly distinguishes implemented reservation from fixture signature/delivery/redemption/payout.
2. Buy **Training sprint (25 RLUSD)**: blocked by mandate and sent to pending treasury review. No device or transaction success is invented.
3. Inspect Mandates and Activity. Repeated request keys cannot double-charge; the daily default is 10 fixture policy units, weekly 30, monthly 80, and request cap 9. AP4M balances remain fixture RLUSD; card quotes are simulated USD. Their artificial policy-unit mapping is not a currency conversion.
4. Show both Credit lab fixtures, then integration status. Borrow/fund/compute/earn/repay and lender-side workflows remain conceptual.

## Scope and evidence

[Builder charter](BUILDER-AGENT.md) · [MVP specification](MVP.md) · [API setup](API-SETUP.md) · [Demo plan](DEMO.md) · [Build report](BUILD-REPORT.md)

Earlier specification checklists describe live acceptance goals, **not completed integration tests**. Never describe this fixture run as a verified sponsor bounty integration. Local tests documented; remote commit verification is tracked separately. No live deployment.

### Public SDK preparation
Exact inspected endpoint schemas, deployment snapshot and remaining team inputs are mapped in [AP4M public integration](AP4M-PUBLIC-INTEGRATION.md). Disabled preparation helpers produce channel-request descriptors, narrow voucher data and redemption ABI call plans only; no signing or broadcast. A personalized starter is not required for that public integration information.

### AP4M receipt → real Marqeta sandbox API code (not connected)
[Public-sandbox adapter](MARQETA-SANDBOX.md) implements documented user/card/GPA-load/authorization-simulation API shapes. [Durable payout gate](PAYOUT-SANDBOX-GATE.md) prevents replay and requires canonical payout plus independently linked claim evidence and approved reserved scope before a sandbox load. Credentials, actual account access and a verified AP4M claim resolver are still unavailable; all new checks use mocks. Production program approval is not a public-sandbox prerequisite. Conversion remains simulated; no RLUSD is forwarded to Marqeta and no live dashboard integration was activated.

## Hours/days terms and specific approval
See [implementation and readiness](TERMS-AND-APPROVALS.md). Use `/#credit` for short fixture terms and `/#activity` for exact approval challenges. Physical Ledger signing remains disabled pending trusted approver and device readiness; no hardware success is simulated. The AP4M panel now includes the SDK-verified payout alongside its preserved earlier unpaid observation.
