# Five-minute demo and evidence

## Verified workshop framing

Mastercard workshop slides reviewed by Dot specify a **five-minute live demo** and rubric: **real-world utility 25%, trust 25%, technical implementation 25%, path to production 15%, demo/story 10%**. This supersedes the earlier generic 25%-each rubric for Mastercard positioning. The [organizer schedule](https://hackathons.xrpl-commons.org/hackathons/ai-fintech-xrp-ledger-hackathon-f78ed817/schedule/6abe686a511cbb095112c1ee) lists submissions **Sunday, October 25, 12:30–1:00 PM EDT** (16:30–17:00 UTC). Target demo and submission materials ready by **12:30 PM EDT**. This published window does not establish the portal’s hard technical cutoff; upload requirements remain unverified.

AP4M [event enrollment](https://form.mastercard.com/jfe/form/SV_ewCgmPZvQhIzx8G) is confirmed submitted. Approval, kit delivery and actual test funds are still unverified, so the live run below remains conditional.

## Run of show

| Time | Show |
|---|---|
| 0:00–0:35 | Business needs a paid compute/API result; RLUSD-only enabled dropdown and explicit test environment |
| 0:35–1:10 | Fixture credit assistant explains a quote and one review/decline; prominently label no live loan |
| 1:10–2:00 | Owner reviews supported funding on Ledger Flex; actual confirmed receipt establishes funded capacity |
| 2:00–3:15 | Approved resource request -> HTTP 402 -> policy reservation -> isolated agent signature -> resource returned |
| 3:15–4:10 | Over-limit rejection and human escalation; show voucher redemption separately from confirmed settlement/payout |
| 4:10–5:00 | Linked proof, daily-cap accounting, failure handling, honest capability matrix and production dependencies |

Use the **actual approved channel cap and available test balance**. Workshop materials describe 20 test RLUSD on approval; do not reuse the older 100-unit example as if those funds exist. For example, *only if a 20-unit channel is confirmed funded*, cumulative vouchers 2 then 3 represent total 3 and an incremental second obligation of 1. An additional 18 must be rejected. Actual SDK semantics and supported units prevail.

Human review does not silently raise limits. Show a review request rather than pretending it was approved. An already-issued valid voucher remains an obligation after pause.

## Proof checklist

- [ ] PSP/participant identities and registered merchant/payout linkage, with sensitive fields redacted.
- [ ] Actual funded cap and successful Ledger-signed transaction evidence.
- [ ] HTTP 402 requirements and resource response, without credentials or reusable signed payloads.
- [ ] Voucher correlation ID, cumulative values and policy version.
- [ ] VoucherRedeemed evidence plus distinct ClaimPaid/SettlementRecorded and actual token payout, using real ABI fields.
- [ ] QuickNode request/receipt linkage and exact network, token, SDK versions.
- [ ] Over-cap rejection, concurrency/replay/recovery test results and human-review boundary.
- [ ] Implemented / simulated / unavailable feature matrix, reproducible setup and hackathon commit history.
- [ ] Ledger developer-experience feedback and supported device/app versions.

No screenshot, described flow or submitted hash alone proves settlement. Check success/finality and correct payout. No fabricated hashes, users, revenue, underwriting accuracy or card issuance.

## Fallback

If access/hardware is blocked, demonstrate only explicitly labeled local fixtures and identify the unavailable adapter. Recorded evidence is usable only if actually captured and event rules permit it. A simulation is not a working sponsor integration and must not be described as bounty-qualified. Commercial Connect may be shown separately only if a genuine sandbox response exists; it does not replace the AP4M evidence.
