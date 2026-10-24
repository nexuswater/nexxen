# MVP: one controlled RLUSD purchase

## Scope

**User:** a business operating an agent that needs a paid compute/API service. **Outcome:** a delivered resource and independently verified settlement, with enforceable spending boundaries.

1. Owner selects approved merchant, daily/weekly/monthly spending mandate, per-request cap and testnet environment. Enforce every configured limit; routine purchases within this mandate are autonomous.
2. Owner reviews and approves supported treasury funding on Ledger Flex. Model 0908 is a user-supplied hardware identifier, not firmware.
3. Agent requests an approved resource and receives HTTP 402 requirements.
4. Deterministic policy checks merchant, asset, network, amount, mandate and current capacity; atomically reserves the incremental obligation.
5. Isolated operational signer produces the sponsor-specified voucher. Model never receives signing keys or arbitrary-sign authority.
6. Resource delivery, voucher redemption and token settlement are tracked separately.
7. Over-limit requests block before signing and create a treasurer-review item. The treasurer reviews and signs a supported treasury funding transaction or mandate-increase operation using Ledger Flex. Record the specific authorized policy change separately where it is off-chain; do not pretend every mandate is a contract transaction. Confirm any on-chain action, then recheck policy, outstanding reservations and actual funded/channel capacity before retrying. Hardware approval cannot bypass a contract cap; if the required operation is unsupported or capacity remains insufficient, stay blocked. A plain “approve” in model output is not authorization.

## Two demo flows

1. **Within mandate:** the agent autonomously purchases one approved compute/service resource from available test funding; no routine Ledger prompt.
2. **Over mandate:** block -> treasurer review -> supported Ledger-approved funding/mandate action -> confirmation and full capacity/policy recheck -> retry only if permitted. Cancellation, failed signing or unavailable funding leaves the request blocked.

## Credit and currency

One narrow underwriting assistant gathers fixture evidence, requests deterministic affordability/quote calculations and explains reason codes. Show one feasible and one review/decline outcome, labeled **simulated underwriting; no loan originated**. Rate policy is versioned; the assistant cannot override it.

Desired future cycle: quote a client with margin -> borrow RLUSD -> fund AP4M -> rent compute -> deliver -> earn -> repay. This is a planned lifecycle, not an implemented end-to-end claim. Borrowing remains fixture/simulation unless actually implemented and evidenced; it is outside the current live payment demo. AP4M spends funded capacity, not a second credit-card debt. No automatic native XRPL/EVM bridge is assumed. The lender-side UI is conceptual/planned, outside the main live demo, with no live allocation or yield claim.

Use only the sponsor-approved test RLUSD identity. Do not substitute Mainnet RLUSD metadata or an arbitrary token with the same symbol. XRP test gas/reserves, where needed, do not expand the payment currency scope. Dropdown alternatives stay disabled; no multicurrency integration, FX or bridge in this MVP.

## Accounting contract

- Separate settled free cash, channel-locked cash, issued obligations, redeemed claims and settled payout.
- Enforce business-wide daily/weekly/monthly mandates and agent limits across concurrent requests with atomic reservations.
- Each configured period must name its timezone (default proposal: UTC) and reset boundary, including week start and calendar-month semantics. Pending obligations survive period rollover and process restarts. Never reset them into reusable capacity.
- Record cumulative voucher increments once: watermarks 10 then 15 mean total 15, not 25.
- Maintain `settled <= redeemed <= cap`; issued but unredeemed obligations also consume capacity.
- Reconcile unknown/time-out outcomes before retrying or releasing reservations.
- Service delivery does not establish settlement; redemption is not available seller cash.

## Excluded

Live credit issuance, native loans/vaults, lender deposits, automatic surplus investment, production underwriting, new stablecoins, cross-chain transfers, live virtual-card issuance, broad currency coverage and public deployment. Commercial Connect sandbox access may be evaluated separately without blocking AP4M.

## Acceptance checklist — not yet executed

- [ ] Startup reports each adapter as unavailable/simulated/test-verified; missing identifiers disable transaction paths.
- [ ] Wrong chain, token contract, merchant or payout fails before signing.
- [ ] Actual owner-approved Ledger transaction has a successful confirmed receipt; denial/disconnection cannot fall back to a treasury hot key.
- [ ] Approved routine purchase needs no new treasury-device touch.
- [ ] Parallel requests cannot overspend configured daily/weekly/monthly, business, agent or funded-channel limits.
- [ ] Over-cap request blocks and creates review; treasurer Ledger approval changes only supported authorized funding/mandate state, then policy and funded capacity are rechecked before retry. No contract-cap or repeated-signing bypass.
- [ ] HTTP 402, agent signature, resource response, redemption and separate payout evidence link to one order.
- [ ] Replays, cumulative updates, duplicate logs and restarts cannot double-charge or inflate receipts.
- [ ] Daily/weekly/monthly rollover preserves outstanding obligations; expired/cancelled reservations release only after safe reconciliation.
- [ ] Fixture credit is labeled; missing/stale evidence escalates; no fabricated approval or loan hash.
- [ ] Prompt-injected merchant content cannot change policy, destination or signing authority.
- [ ] Logs/receipts contain no credentials, reusable vouchers or private evidence.
- [ ] Five-minute rehearsal matches implemented/simulated/unavailable status exactly.
