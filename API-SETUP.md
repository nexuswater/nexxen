# API setup and capability gates

**Current state:** no working integration or credentials are established by these files. Access approval is not a deployment, and registration is not permission to issue cards or move funds.

## A. Mastercard AP4M — primary demo dependency

The event workshop materials reviewed by Dot describe approval-based access, **20 test RLUSD automatically funded on approval**, gas-free XRPL EVM Testnet use, an SDK with typed ABI/signing, and a Platform API for channel/settlement lifecycle. These are workshop provisions, not a verified balance or unlimited funding entitlement for this team.

Obtain the exact event access link/approval and kit from organizer-provided materials. None of the eight reviewed workshop photos shows a signup URL; the mentor slide identifies Jaya Mandlik for technical orientation/kit support. No outreach has been made. Do not invent a generic Developers-portal product selection for AP4M. Required inputs:

- Approved project/participant access and legitimate credentials stored privately.
- Kit/SDK version, installation instructions, authoritative ABI and API base URL.
- Exact RPC, chain ID, token contract, decimals and deployment addresses.
- Agent/merchant registration, payout binding, funding/open-channel caller and permissions.
- Voucher domain/schema, cumulative/nonce rules, expiry/cancellation and settlement linkage.
- Confirmed test funding, gas arrangement and actual endpoint capability.

The workshop names ParticipantRegistry, PaymentLedger and PooledEscrowVault. Names are not addresses or verified callable signatures. Public XRPL EVM Testnet uses chain 1449000, but the event manifest remains authoritative; do not populate missing values by assumption.

After verification: register -> fund/allocate -> open -> request resource -> HTTP 402 -> agent-signed voucher -> resource response -> redeem -> settle. Redemption alone does not transfer spendable proceeds. Scope is test assets only.

## B. Commercial Connect — separate virtual-card sandbox

Official starting points: [Developers signup](https://developer.mastercard.com/account/sign-up) and [API catalogue](https://developer.mastercard.com/apis), selecting **In Control / Commercial Connect API** as appropriate to the offered access.

The [official Commercial Connect quick-start](https://developer.mastercard.com/commercial-connect-api/documentation/quick-start-guide/) requires a **registration token from an implementation manager**, project review/approval, and delivery/CEP setup of the integrator company with a **test issuer and generated test cards** before the first sandbox call. Sandbox responses are mocked. Thus a generic signup is not instant API access.

The documented sandbox base is `https://sandbox.apiedge.mastercard.com`; the first signed request is `GET /commercial/hierarchies/entities`. Follow the assigned project's authentication instructions: the documentation references OAuth 1.0a/2.0 in different contexts, so do not hardcode one before entitlement and project guidance are confirmed. No keys have been created.

Record actual product entitlement, sandbox credentials, test issuer/card program, supported operations and sandbox-only response semantics. Generic account creation or a sandbox card number does not create a spendable Mastercard. Commercial Connect accesses issuer-backed card programs; production requires additional onboarding and approvals. Do not confuse it with Mastercard Send, Virtual Card Tokens, or the AP4M workshop. No raw PAN/CVC or payment credentials in repository, logs or demo recordings.

Keep this adapter **unavailable** until access and product-specific documentation are confirmed. If sandbox access is obtained, label every card view and response **sandbox / not spendable**. Do not claim this satisfies the AP4M bounty without organizer confirmation.

## C. Ledger Flex and QuickNode

- Flex USB transport is supported by Ledger DMK. On Mac use a compatible browser such as Chrome and USB data cable; verify device OS, app and SDK versions.
- XRPL EVM uses the Ethereum device app/signer; native XRPL uses the XRP app/signer. Do not assume LoanSet/LoanPay or arbitrary contract Clear Signing support.
- Treasury approval is physical; the routine operational signer has only its limited funded mandate. Never export the Ledger seed.
- Verify QuickNode endpoint chain/methods/limits and show real request-to-receipt evidence. Native lending Devnet support does not follow from EVM RPC access.
- AWS AgentCore is optional runtime infrastructure if already accessible; tool permissions do not replace atomic financial reservations.

## Fail-closed configuration contract

`.env.example` is a template, not implemented enforcement. The future app must validate settings and expose a capability report:

| Capability | Required evidence before enablement |
|---|---|
| Fixture credit | Explicit simulation mode; fixed fixture/rate-policy versions |
| AP4M test payment | Approved access, verified chain/contracts/token, funded participant/channel, schema and working signer |
| Ledger treasury | Actual Flex/app/transport test and supported transaction; owner confirmation |
| QuickNode evidence | Successful chain identity/read checks on configured endpoint |
| Commercial Connect sandbox | Product-specific sandbox entitlement and verified test program |
| Live loans, bridge, FX, live cards | Disabled; outside current MVP |

Invalid/missing config disables the affected action; it must not produce mock-success receipts. Keep credentials server-side and retrieve through scoped secret references. Never place a seed or raw private key in this template. Do not log signed reusable voucher payloads.

## Primary references

- [Ledger event integration requirements](https://developers.ledger.com/xrplnyc)
- [Ledger Flex transport](https://developers.ledger.com/docs/device-interaction/dmk-ts/beginner/ble_flex_stax)
- [XRPL EVM networks](https://docs.xrplevm.org/pages/developers/interacting-with-evm/advanced-guides/reown-dapp-example)
- [QuickNode XRPL EVM](https://www.quicknode.com/docs/xrplevm)
- [Mastercard Commercial Connect context](https://www.mastercard.com/us/en/news-and-trends/press/2025/october/simple-connections--smarter-controls--mastercard-is-superchargin.html)
