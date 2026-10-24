# AP4M payout → Marqeta public-sandbox load gate

## Implemented locally, not connected
`adapters/payout-gate.mjs` introduces a durable receipt gate separate from the local dashboard simulation. It is disabled by default and has no public HTTP mutation endpoint. It requires runtime dependencies backed by verified configuration: an approved-order lookup with an **active atomic owner reservation**, a canonical payout verifier, an approved Marqeta sandbox adapter and non-JIT card-product verification. The dashboard does not silently activate it.

No real RPC, AP4M signature/transaction, Marqeta account/card/load or authorization API was exercised in this build. The tests use mock RPC/claim and sandbox responses. The exact production AP4M claim-to-payout resolver is not implemented; it must be supplied from independently verified deployment ABI/service proof. A generic token transfer alone is insufficient.

## Durable proof and replay boundaries
- A unique database key `(chainId, transactionHash, payoutLogIndex)` prevents the same payout from funding multiple orders. Order identity is separately unique and immutable.
- Successful canonical receipt, confirmation depth, pinned **test RLUSD token**, configured payout source, exact payout destination and amount are checked. Receipt/log block and transaction identity must agree.
- The independent claim resolver must bind the exact channel, claim and payout transaction/log. Redemption alone never credits the card provider.
- Approved order includes exact simulated USD amount, user token, reservation identity and immutable source payout identity. Changing the binding or revoking the reservation blocks dispatch.
- A stable operation token and `dispatching` state are persisted **before** the GPA load POST. Compare-and-swap protects concurrent dispatch.
- Timeouts, malformed responses and mismatches become `unknown`. Restarts use `GET /gpaorders/{token}` reconciliation only. A 404 is inconclusive; no blind POST replay or capacity release occurs.
- The returned status exposes no credentials, PAN/CVV, raw provider responses or internal operation/user tokens. `sandbox_funded` only means the bound sandbox GPA load was verified. Card authorization, clearing and GPU delivery remain separate and unverified.

## Economics remain simulated
An actual future AP4M testnet payout can trigger a real **sandbox API** load using the documented sandbox funding source. That does **not** send RLUSD to Marqeta, convert it, prove sponsor merchant forwarding, or establish that Marqeta accepts this token/network. The AP4M test merchant remains a demonstration stand-in. Source card funding principal is a transfer/restricted balance, not income or GPU expense. Fee and merchant charge accounting remain separate.

Marqeta authorization simulation is a documented sandbox endpoint, not a real GPU merchant purchase. HTTP success is insufficient: adapter response code/state must be checked. Approval is not clearing/settlement. Default reloadable card products can auto-JIT fund; a strict provider-funded demonstration requires a verified non-JIT product so missing source funding cannot be hidden by automatic sandbox funding.

## Exact next inputs — no secrets in chat
1. Authorized Marqeta public-sandbox access and assigned sandbox API URL. Signup was previously blocked by HTTP 403; no bypass or account creation performed. **Production program approval is not a prerequisite to public-sandbox testing.**
2. Application/admin-access credentials supplied securely through an approved runtime secret mechanism, never chat or code. No credentials were generated or saved by this task.
3. Actual returned sandbox user/card/product tokens and verified **non-JIT** card configuration/network. No invented token or automatic second card creation (which can terminate an earlier card).
4. An independently confirmed AP4M settlement payout and exact selected merchant/payout/channel/claim binding; active owner reservation and explicit fixture conversion/USD load approval.
5. Implemented verified claim/payout resolver and persistent private gate database. Then run the approved sandbox operation, reconcile its load, authorize the simulated merchant charge and inspect actual response states independently.
