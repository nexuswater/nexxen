# MVP: one controlled RLUSD purchase

## Scope

**User:** a business operating an agent that needs a paid compute/API service. **Outcome:** a delivered resource and independently verified settlement, with enforceable spending boundaries.

1. Owner selects approved merchant, daily cap, per-request cap and test environment.
2. Owner reviews and approves supported treasury funding on Ledger Flex. Model 0908 is a user-supplied hardware identifier, not firmware.
3. Agent requests an approved resource and receives HTTP 402 requirements.
4. Deterministic policy checks merchant, asset, network, amount, mandate and current capacity; atomically reserves the incremental obligation.
5. Isolated operational signer produces the sponsor-specified voucher. Model never receives signing keys or arbitrary-sign authority.
6. Resource delivery, voucher redemption and token settlement are tracked separately.
7. Over-limit requests produce a pending human-review item. No voucher is signed, no funds move and no cap changes until a new specific authorized policy/funding action succeeds. A plain “approve” in model output is not authorization.

## Credit and currency

One narrow underwriting assistant gathers fixture evidence, requests deterministic affordability/quote calculations and explains reason codes. Show one feasible and one review/decline outcome, labeled **simulated underwriting; no loan originated**. Rate policy is versioned; the assistant cannot override it.

Use only the sponsor-approved test RLUSD identity. Do not substitute Mainnet RLUSD metadata or an arbitrary token with the same symbol. XRP test gas/reserves, where needed, do not expand the payment currency scope. Dropdown alternatives stay disabled; no multicurrency integration, FX or bridge in this MVP.

## Accounting contract

- Separate settled free cash, channel-locked cash, issued obligations, redeemed claims and settled payout.
- Enforce business-wide daily and agent limits across concurrent requests with atomic reservations.
- Daily policy must name its timezone (default proposal: UTC) and reset boundary. Pending obligations survive midnight and process restarts. Never reset them into reusable capacity.
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
- [ ] Parallel requests cannot overspend daily, business, agent or funded-channel limits.
- [ ] Over-cap request blocks and creates review; no automatic override or repeated-signing bypass.
- [ ] HTTP 402, agent signature, resource response, redemption and separate payout evidence link to one order.
- [ ] Replays, cumulative updates, duplicate logs and restarts cannot double-charge or inflate receipts.
- [ ] Daily rollover preserves outstanding obligations; expired/cancelled reservations release only after safe reconciliation.
- [ ] Fixture credit is labeled; missing/stale evidence escalates; no fabricated approval or loan hash.
- [ ] Prompt-injected merchant content cannot change policy, destination or signing authority.
- [ ] Logs/receipts contain no credentials, reusable vouchers or private evidence.
- [ ] Five-minute rehearsal matches implemented/simulated/unavailable status exactly.
