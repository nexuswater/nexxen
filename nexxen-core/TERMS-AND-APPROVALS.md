# Short terms and specific approval

## Current supported state

`/#credit` provides amount and duration sliders with exact inputs and hour/day presets. Amount range is 0.01–10.00 fixture RLUSD; duration is 1–168 whole hours or 1–7 whole days. The server's TERM_POLICY can narrow these bounds. Rate and fees are server configuration, not caller inputs. Default nominal annual rate is 12%; fee is zero. This is not a promised yield, live loan or underwriting decision.

Interest uses integer BigInt arithmetic: principal hundredths × annual basis points × duration seconds / (10000 × 365 × 86400), rounded once half up to a hundredth. Rate, actual interest charge, fees, principal and total are distinct. Tiny interest can round to zero; total cannot be zero or below principal. Dates are UTC with exact seconds. The illustrative due time runs from quote creation, not acceptance, and stays immutable. Quote expiry is 10 minutes; accepted snapshots remain unchanged and replaying acceptance returns the same record. Acceptance does not create funding, AP4M capacity, revenue, debt or a real agreement.

`/#activity` and `/#mandates` prepare readable ASCII EIP-191 policy challenges for an existing blocked request. The original request is immutable. A challenge binds the application instance, business, registered agent, request and revision, service/destination, decimal amount and minor units, currency, chain 1449000, policy hash, exact exception, purpose, nonce, expiry and expected business approver. Five-minute challenge expiry is separate from quote validity and financing duration.

`Approvals.submit` verifies the exact stored message against a trusted server-side public authority address using pinned ethers 6.17.0. It never trusts an address or evidence supplied by the caller. Wrong account/domain/message, expired/denied/replayed challenge, changed policy/request, insufficient authority, aggregate limits and insufficient remaining fixture capacity fail. SQLite BEGIN IMMEDIATE and a unique consumed-request index atomically create one linked reservation and consume the challenge. The original blocked row stays blocked; no purchase is submitted. This handler is application simulation only and must not be reused as live funding authority.

## Hardware boundary: not connected or physically tested

The production server constructs Approvals with no trusted authority; signature submission therefore fails closed. There is no public authority-registration endpoint. The UI deliberately disables Ledger signing. No key import, seed, environment credential, hardware permission or signature has been requested.

`adapters/ledger-message.mjs` is a transport-neutral lifecycle guard with mocked tests. It is NOT an installed DMK bundle or a connected hardware integration. It accepts only a readable canonical ASCII message and calls an injected official signMessage-capable signer after readiness checks. Only completed output can become an unverified signature candidate; server verification is still required. Error, stopped, cancellation and disconnect reject, with no fallback to hash signing, typed-data signing, a hot key or a transaction. Boolean readiness inputs are not device attestation; this helper is not exposed to HTTP callers and must remain unconnected until readiness is independently checked.

For the future isolated browser module, the parent researched these official versions: Device Management Kit 1.11.0, WebHID transport 1.2.4, Ethereum signer 1.18.2, context module 2.7.0, rxjs 7.8.2. They are not installed by this increment. Do not use legacy hw-app-eth. A fresh review must confirm the pinned builder arguments and observable output: the public documentation can differ from pinned package APIs. Use user-click discovery, connect, plain-string signMessage and disconnect; never equate a valid signature with proof that every field was displayed on the physical device.

Remaining activation steps: independently confirm the business approver's public address and authority; verify Josh's Flex firmware and installed Ethereum app; build the isolated pinned WebHID module; verify that the complete ASCII message is readable on-device. If review is unreadable or hash-only, stop. Device actions and unexpected browser permissions require applicable user approval. No physical test or hardware claim is made here.

## Real evidence remains separate

`evidence/ap4m-settled-claim.json` is the public sponsor receipt. `evidence/ap4m-verification.json` is the sanitized result of the pinned read-only SDK verification started 2026-10-25 00:42:07 UTC. Exact payout: 0.001 test RLUSD to the expected recipient, with canonical payout and settlement checks passing. This is a historical verified observation, not continuous monitoring. `EVIDENCE_SNAPSHOT.ap4m` preserves the earlier unpaid observation at 2026-10-24 22:38:49 UTC. Neither is changed by rehearsals. Marqeta's separate historical $1 authorization hold is not funded by this claim; the stablecoin/card handoff remains simulated.

## Validation and scope

Run `npm test` and `npm run check`; Node 24+ remains declared. On this Mac, the existing Node 22.20.0 executable runs successfully while Homebrew Node is broken; no system repair was performed. Tests cover precise calculations, bounds, zero rate, rounding, expiry, immutable quote acceptance, signature scope/account, denied/expired/replayed requests, concurrent submissions, fresh capacity and rollback, plus mocked Ledger cancellation/disconnection.

No financial API calls, physical signatures or publication are included. Only nexxen-core is changed. The separate existing local fixture database is preserved; new quote/challenge tables are additive. Downloads/NEXXEN data/env and teammate UI remain untouched.

Final validation: 145 tests passed with zero failures/cancellations; syntax and diff checks passed. Browser QA confirmed amount/duration slider synchronization, seven-day 10.00 principal → 10.02 total fixture quote, immutable acceptance, exact unsigned approval preview, denial leaving the request blocked, and the updated SDK-verified payout panel. Desktop layout was visually inspected. No physical device or native lending adapter was tested.
