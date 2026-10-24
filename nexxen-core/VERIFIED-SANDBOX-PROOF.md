# Verified isolated Marqeta sandbox proof

**Date:** 2026-10-24. **Evidence:** user-local execution and screenshots reviewed by the coordinating assistant, not API execution by the builder. Screenshots and secrets are not published here.

## Observed sequence

1. The user privately configured their sandbox credentials and successfully read card products.
2. A dedicated NEXXEN sandbox user, virtual card and product were created with explicit approval. All three JIT funding selectors were disabled; default product was not modified.
3. A zero-balance $1 authorization returned **1016 / DECLINED**, simulated network **MASTERCARD**, no JIT observed.
4. Exactly one approved $1 sandbox GPA load completed. GET evidence matched the saved order, user, USD amount, COMPLETION/code0000 and linked transaction. Returned funding-source metadata did not prove request-alias mapping; that mapping remains unverified. No replacement load was made during recovery.
5. The originally approved positive $1 authorization returned **0000 / PENDING**, simulated network **MASTERCARD**, no JIT observed.
6. Final USD GPA: **ledger $1.00, available $0.00, pending credits $0.00**. Recovery reported `EXISTING_SANDBOX_SMOKE_HOLD_VERIFIED` and `holdVerified:true`.

## What this establishes—and does not

This is a successful isolated sandbox authorization hold using prefunded sandbox USD, not credit issuance. It is not clearing, settlement, a real GPU rental, production card acceptance or production Mastercard affiliation. No AP4M payout funded this test; no RLUSD conversion or transfer to Marqeta is proved. Canonical funding-alias binding remains unverified. The existing $1 hold is left untouched—no reversal or clearing was authorized.

The reusable implementation remains disabled without approved runtime configuration. Tests use mocks, not these private credentials. A future AP4M-triggered sandbox load must independently pass the unchanged canonical payout gate and the durable sandbox operation checks; this proof cannot substitute for a payout receipt.
