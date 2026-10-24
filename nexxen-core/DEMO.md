# Five-minute demo and evidence

## Verified workshop framing

Mastercard workshop slides reviewed by Dot specify a **five-minute live demo** and rubric: **real-world utility 25%, trust 25%, technical implementation 25%, path to production 15%, demo/story 10%**. This supersedes the earlier generic 25%-each rubric for Mastercard positioning. The [organizer schedule](https://hackathons.xrpl-commons.org/hackathons/ai-fintech-xrp-ledger-hackathon-f78ed817/schedule/6abe686a511cbb095112c1ee) lists submissions **Sunday, October 25, 12:30–1:00 PM EDT** (16:30–17:00 UTC). Target demo and submission materials ready by **12:30 PM EDT**. This published window does not establish the portal’s hard technical cutoff; upload requirements remain unverified.

AP4M [event enrollment](https://form.mastercard.com/jfe/form/SV_ewCgmPZvQhIzx8G) is confirmed submitted. Approval, kit delivery and actual test funds are still unverified, so the live run below remains conditional.

## Run of show

| Time | Show |
|---|---|
| 0:00–0:35 | Business needs compute/service; testnet RLUSD, owner-defined daily/weekly/monthly mandate and actual funded capacity |
| 0:35–1:50 | Flow 1: within mandate -> HTTP 402 -> atomic reservation -> agent signature -> resource delivered, without routine hardware approval |
| 1:50–2:20 | Flow 2: over-limit request blocks before signing and escalates to the business treasurer |
| 2:20–3:35 | Treasurer reviews supported funding/mandate action on Ledger Flex; confirm action, recheck policy and funded/contract capacity, then retry only if permitted |
| 3:35–4:30 | Link delivery and voucher redemption to distinct confirmed settlement/payout; show cap accounting and remaining obligations |
| 4:30–5:00 | Honest capability matrix and future quote-with-margin -> borrow -> fund AP4M -> compute -> deliver -> earn -> repay story; borrowing remains simulated |

Use the **actual approved channel cap and available test balance**. Workshop materials describe 20 test RLUSD on approval; do not reuse the older 100-unit example as if those funds exist. For example, *only if a 20-unit channel is confirmed funded*, cumulative vouchers 2 then 3 represent total 3 and an incremental second obligation of 1. An additional 18 must be rejected. Actual SDK semantics and supported units prevail.

Human review does not silently raise limits or bypass a contract cap. Show an actual supported Ledger-approved action and the resulting policy/funded-capacity recheck; distinguish an off-chain mandate update from an on-chain funding transaction. If the SDK cannot support the action, signing is denied or sufficient capacity is unavailable, show the request staying blocked rather than pretending approval or retry succeeded. An already-issued valid voucher remains an obligation after pause.

AP4M is a funded payment flow, not a second credit-card debt. The future borrowing cycle is fixture/simulation unless actually implemented and evidenced; no automatic native/EVM bridge is assumed. Lender-side screens may be discussed separately as conceptual/planned, outside the main live demo, with no live allocation or yield claim. Keep fixture credit quotes optional rather than displacing either payment flow.

## Proof checklist

- [ ] PSP/participant identities and registered merchant/payout linkage, with sensitive fields redacted.
- [ ] Actual funded cap and successful Ledger-signed transaction evidence.
- [ ] HTTP 402 requirements and resource response, without credentials or reusable signed payloads.
- [ ] Voucher correlation ID, cumulative values and policy version.
- [ ] VoucherRedeemed evidence plus distinct ClaimPaid/SettlementRecorded and actual token payout, using real ABI fields.
- [ ] QuickNode request/receipt linkage and exact network, token, SDK versions.
- [ ] Within-mandate autonomous purchase and over-limit block -> Ledger treasurer action -> confirmed policy/capacity recheck -> permitted retry, or truthful blocked state.
- [ ] Daily/weekly/monthly period boundaries, concurrency/replay/recovery test results and human-review boundary; hardware approval cannot override contract limits.
- [ ] Implemented / simulated / unavailable feature matrix, reproducible setup and hackathon commit history.
- [ ] Ledger developer-experience feedback and supported device/app versions.

No screenshot, described flow or submitted hash alone proves settlement. Check success/finality and correct payout. No fabricated hashes, users, revenue, underwriting accuracy or card issuance.

## Fallback

If access/hardware is blocked, demonstrate only explicitly labeled local fixtures and identify the unavailable adapter. Recorded evidence is usable only if actually captured and event rules permit it. A simulation is not a working sponsor integration and must not be described as bounty-qualified. Commercial Connect may be shown separately only if a genuine sandbox response exists; it does not replace the AP4M evidence.
