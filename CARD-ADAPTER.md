# One two-leg GPU purchase cycle — simulation only

## Intended architecture
**RLUSD → approved card-funding provider → conversion / USD card prefunding → GPU vendor paid by card.** This is one desired lifecycle, not two unrelated payment alternatives. AP4M's test merchant models a funding endpoint **only as a stand-in**; it is not evidence of a Marqeta integration, partner endorsement, accepted RLUSD deposit or funded card program.

The demo's controlled cycle is `POST /api/card-cycles`. It permits only fixed approved merchant/category fixture scenarios, not arbitrary caller-supplied destination, amount or signing payload. The fictional merchant is **Fictional GPU Cloud**; NVIDIA describes the requested GPU workload, not an integrated/endorsing merchant or provisioned resource.

## Explicit fixture quote and separate accounting
- Normal source obligation: **4.50 test-RLUSD fixture units**: 4.00 conversion allocation + 0.50 fixture fee.
- Assumed fixture rate: **1.00 USD per RLUSD**. This is not a real executable conversion quote.
- Card is modeled as **prefunded with 4.00 simulated USD**, then charged 4.00 simulated USD for GPU rental.
- RLUSD source funding, fee, USD funded, USD charged and USD remaining are recorded separately.
- The owner mandate consumes the source obligation **once**. The downstream USD debit does not charge the owner budget a second time. Shared owner caps use artificial fixture policy units, not live cross-asset accounting.
- Card funding principal is a **transfer into a restricted funded balance**, not compute expense or income. Only the explicit 0.50 RLUSD fixture funding fee is a fee expense; a completed 4.00 USD merchant debit is economic service spend. A declined GPU charge leaves USD as a retained asset, not a service expense. Mandate consumption is a separate policy measure and must not be read as an expense ledger.
- Service income and borrowed principal stay **zero**. Prefunding is not credit issuance, a loan, or revenue.
- Standalone AP4M resource purchases remain diagnostic tests, not the main combined product story. The older isolated card fixture remains an internal diagnostic; the UI no longer exposes it as a separate purchase route.

## State-machine outcomes
1. `completed_fixture`: both modeled legs complete; no live payment, card, conversion or compute provisioning.
2. `funding_failed_fixture`: explicit fixture failure safely releases its reservation; no USD funded or GPU purchased. Unknown live outcomes must **not** use this release rule.
3. `gpu_declined_fixture`: funding transfer remains recorded and simulated USD remains available. It does not claim full-cycle success or roll back the prior funding leg.
4. `blocked`: large/out-of-policy funding is rejected before signing/funding and generates pending human review.

The cycle and source reservation are committed atomically in SQLite. Idempotent retries cannot duplicate either leg. A forced cycle-storage failure rolls back local source accounting. This is a fixture state machine, not distributed atomic settlement across real payment providers.

## Authority and integration boundaries
Preapproving a funding provider is **not blanket authority** to buy from any merchant. Downstream merchant/category/business limits and large-spend human approval still apply. Acceptance depends on network, program and vendor rules; no universal acceptance is promised. Ledger cannot force issuer approval or merchant acceptance.

Marqeta is **not connected**. Official signup returned HTTP 403; no account or credential was created and no bypass attempted. Stablecoin-backed cards are a real industry category, but the specific **RLUSD token/network → conversion/funding provider → Marqeta program** route is unverified. Existing stablecoin partnerships do not establish RLUSD support or program entitlement. The live issuer adapter remains unavailable; it contains no invented API calls, PANs or credentials.

Activation requires authorized program access, exact token/network support, real conversion quote/fees/finality, supported funding arrangements, confirmed program USD credit, issuer events, merchant authorization and independent reconciliation. AP4M redemption alone must never mark the card provider credited. Production also requires bank/network program approvals. No live deposits, issuance, borrowing, conversion or automatic bridge is implemented.
