# NEXXEN build report — 2026-10-24

## Delivered
A runnable local Node.js 24 application, without external dependencies or an install step. `npm start` opens a loopback server at http://127.0.0.1:3000. Dashboard source is `public/`; durable accounting is `lib/store.mjs`; HTTP server is `server.mjs`. Builder charter was written before implementation.

### Implemented locally
- Responsive six-view dashboard: overview, activity and receipts, spending mandates, optional credit lab, separate Card lab, integration status.
- Approved service catalog, server-owned integer-cent prices, deterministic policy, durable SQLite immediate transactions, idempotency with conflicting replay rejection.
- Per-request, business daily/weekly/monthly, single-agent daily, and funded fixture capacity limits. Outstanding reservations survive period rollover and process restart. UTC midnight/Monday/calendar-month semantics explicit.
- Within-mandate purchase with separately labeled fixture delivery/redemption/payout stages. Over-limit request produces an immutable blocked order and pending treasurer-review item; duplicate submissions cannot duplicate review or spending.
- Versioned fixture credit quote and stale/insufficient-evidence review outcome.
- Read-only AP4M adapter with pinned official host, chain/contract/channel checks, timeouts, and no live signing methods. Not wired into fixture purchases.
- JSON-only mutation endpoints, same-origin/host checks, restrictive content security policy, escaped dynamic UI text, no generic signing API.

### Simulated / unavailable / planned
- All 20 RLUSD of funded capacity and all payment-stage outcomes are fixtures. No real tokens, transaction hashes, deployed contracts, service delivery or sponsor settlement.
- Live AP4M transaction flow, isolated signer, cumulative-voucher update/reconciliation, receipt finality/payout verification and unknown-network-outcome recovery are **not implemented**. Local reservations are durable but are not a substitute for full chain reconciliation.
- Ledger Flex treasury signing, supported funding action, actual user approval and confirmation are **unavailable**. No approve button fabricates success; no hot-key fallback. A fixture mandate edit cannot raise funded capacity.
- Live credit, lender allocation, real card issuance, bridges, FX and loans are outside this build. Multi-business authorization, multi-agent identity, production security/rate limiting and full free-cash/escrow accounting are not implemented. This local unauthenticated demo must not be publicly exposed.

## Verification
- `npm test`: **25 passing automated tests** at this report's initial build. Tests cover actual multiple concurrent SQLite connections, all limit families, funded-cap immutability, idempotent purchases and settlement, restart, UTC rollover, pending obligations, caller injection rejection, HTTP origin guard and unavailable treasury, deterministic credit, seven mocked AP4M adapter checks, plus a fail-closed card interface and shared-budget/separate-capacity card fixture checks.
- `npm run check`: Node syntax validation for server, store and frontend.
- Live server startup, HTTP requests, all three served UI assets, responsive CSS presence, retained retry-key code, and GPU/card fixture metadata verified locally. These source/HTTP assertions are not rendered browser tests.
- **Visual browser QA not completed**: installed Chromium failed under the execution sandbox (`socket() failed: Operation not permitted`). Escalated invocation failed environment sandbox setup (`bwrap: Can't create file at /home/agent/.codex/sessions: Read-only file system`). No attempt was made to access or modify that restricted path. Responsive CSS and interaction code were reviewed statically, but no rendered screenshot or browser-interaction pass is claimed.
- No live sponsor credentials, team funds, hardware, signing, blockchain transaction, or payout was tested. Local tests documented; remote commit verification is tracked separately. No live deployment.

## Activation prerequisites
1. User signs into the authorized NEXXEN sponsor portal using their own wallet; verify team activation, exact participant/merchant/payout/channel metadata and actual test funds. Never request a seed/private key in chat.
2. Obtain authenticated API reference access. Public sources were inspected only; authenticated `/docs/*` returned HTTP 401. Do not bypass that gate or guess request bodies.
3. Implement reviewed SDK-backed direct/x402 flow separately, binding policy reservation to isolated operational signing, cumulative obligations, retries and reconciliation. Direct redemption and merchant x402 redemption are different flows.
4. Integrate a supported real Ledger Flex treasury transaction, confirm it, then recheck policy and funded contract capacity. Hardware approval does not create funds or override channel caps.
5. Independently verify actual on-chain redemption and separate settlement/payout, and complete desktop/mobile visual QA before demonstrating live sponsor integration.

Public source details and retained source snapshots: [AP4M-ADAPTER.md](AP4M-ADAPTER.md). Existing `MVP.md` and `DEMO.md` remain target acceptance plans, not completed live evidence.

## Authorized virtual-card extension
A separate Card lab and unavailable issuer adapter were added after explicit user authorization. Requested merchant/purpose and fixture policy-equivalent amount are displayed; card and AP4M reservations share owner mandates but use separate rail capacity. No fake PAN, actual card issuance, merchant acceptance or RLUSD conversion is implied. See CARD-ADAPTER.md.

## Startup concurrency correction
Root verification caught an intermittent SQLite lock during connection initialization. The original code set `journal_mode=WAL` before `busy_timeout`. Initialization now installs busy waiting first, reads the current journal mode rather than unnecessarily resetting WAL, and retries only idempotent startup/schema operations on SQLite BUSY/LOCKED with a bounded deadline; failed initialization closes its connection. Payment operations are never blindly retried. The original 12-connection reservation assertions remain intact, and a new regression starts 12 independent connections against a brand-new database with no pre-created schema.

After the fix: 15 consecutive full-suite passes, then after adding the new-database regression **20 consecutive full-suite runs with 24/24 tests passing each**, followed by `npm run check` passing. Node 24 is the tested runtime; Node 22 workshop compatibility has not been verified.

## Final reviewer corrections
The unauthenticated server now rejects non-loopback HOST values before listening (including 0.0.0.0, :: and private/public network hosts); regression coverage exercises four rejected hosts. Shared mandate labels use **fixture policy units**, AP4M amounts remain fixture **RLUSD**, and card quotes use **simulated USD** with a separately stated artificial policy-unit cost—no currency conversion. A proxy/tunnel must not expose this unauthenticated local demo. Final verification: 25/25 tests and syntax checks pass.

## Public SDK preparation extension
The public-source reconciliation is in AP4M-PUBLIC-INTEGRATION.md. A personalized starter is not required. Added disabled-by-default channel-request descriptors, exact 18-decimal amount conversion, narrow EIP-712 voucher plans with cumulative-increment checks, and redemption ABI call plans. No signing, broadcast, executable calldata, or guessed record-redemption body is supplied. The known full agent address and screenshot-reported organizer deposit are recorded without claiming chain proof; merchant selection remains pending. Read-only readiness is exposed at /api/ap4m-preparation. Current suite: **30/30 passing**, syntax checks pass. This does not change the dashboard fixture funds or activate a live adapter.

## User-corrected two-leg lifecycle
The main UI/story is now one cycle: RLUSD → approved-provider stand-in → fixture conversion and USD card prefunding → GPU merchant card charge. A durable simulation-only cycle state machine separates source RLUSD, fee, USD funded/spent/remaining, with no service income or borrowed principal. Source mandate accounting occurs once. Funding failure cannot create downstream success; GPU decline preserves funded USD and source funding transfer; large spends block for human review. Forced cycle-storage failure rolls back local funding accounting. This is not distributed real-provider atomicity or evidence of RLUSD/Marqeta acceptance. No real transaction/API/card/conversion was activated.

Accounting clarification: source funding principal is a transfer to restricted USD card capacity, not compute expense or income. Only the separately recorded fixture funding fee and a completed merchant charge are economic expenses. A GPU decline retains the card asset. Owner mandate consumption at source is deliberately separate from expense accounting. Current verification: **39/39 passing tests**, including non-browser six-view template smoke and cycle restart/replay; browser visual QA still unverified.

## Documented public-sandbox adapter and durable payout gate
Added exact official Marqeta public-sandbox API methods, sanitized responses, non-JIT funding guard and disabled-by-default runtime authorization. Added durable unique receipt/order gate, canonical token payout checks, independently supplied AP4M claim resolver requirement, active atomic reservation binding, pre-POST persisted operation token, cross-connection dispatch CAS and GET-only unknown-outcome reconciliation. Real sandbox credentials/account access and production claim/payout resolver remain unavailable; no actual provider call, user/card creation, AP4M transaction or signature occurred. Public sandbox does not require production program approval. Authorization is not clearing or GPU delivery. Public config snapshot newline now matches remote file and its SHA256 entry was refreshed. Root reported prior main commit c9be037b761164027ff965d07d07332c00769596 verified separately; this increment has not been remotely committed by this builder.

Sandbox increment verification: **57/57 tests passed in five consecutive full-suite runs**; npm run check passed; all retained reference checksums passed. Includes mocked documented Marqeta GPA adapter ↔ durable receipt-gate interoperability; no external sandbox/chain call occurred. Visual browser QA remains unverified.
