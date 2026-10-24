# Public SDK integration map — inspected source, no personalized starter required

All details below come from the existing public-source snapshots in `adapters/reference/`; no authenticated docs were retried and no downloaded code was executed. Public deployment values are a dated snapshot, not proof of current chain state or team funds.

## Deployment snapshot
- Chain **1449000**, XRPL EVM Testnet; RPC `https://rpc.testnet.xrplevm.org`; explorer `https://explorer.testnet.xrplevm.org`.
- ParticipantRegistry: `0x4cF27435FE56161aa9b1cffdD87784aa68b7D1E8`
- PaymentLedger: `0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91`
- PooledEscrowVault: `0x83DD9cD010eb46e96eceF8F7eB0a18f7845AaBC0`
- Test RLUSD: `0x27b57a9D0b8d24EB97259c4E2279e45255e016f3`, **18 decimals** per SDK.
- Known NEXXEN agent from user/portal evidence: `0xe3D841aE3Acc8Dc79577092C141205f3d0Bf5183`.
- Portal screenshot reports **20 RLUSD deposited by organizer**. This is verified portal evidence, not a confirmed chain receipt. The old public `vaultBalance` is aggregate and is not team balance.

## Exact direct-helper operations
All service paths are under `https://hackathon.ap4m.build`.

| Operation | Public SDK request / contract |
|---|---|
| Challenge | POST `/public/participant/challenge`, JSON `{teamName,wallet}` |
| Session | POST `/public/participant/session`, JSON `{challengeId,signature}` after the user signs the one-time challenge |
| Merchant list | GET `/public/merchants`; returns `merchants` |
| Prepare channel | POST `/public/participant/channel-requests/prepare`, bearer session, JSON `{cap_rlusd: String(capRlusd), merchant_id: merchantId}`; response includes `to,data` |
| Submit channel transaction | Agent SDK `sendTransaction({to: prepared.to,data: prepared.data})`, wait receipt; needs XRP gas. NEXXEN has not authorized or implemented this send step. Prepared calldata requires independent semantic validation before use. |
| Record channel | POST `/public/participant/channel-requests`, bearer session, JSON `{tx_hash: tx.hash}` |
| List channels | GET `/public/participant/channels`, bearer session; `channels` includes `channel_id,channel_status,cap_wei,payout,merchant_id` |
| Read on chain | `channels(bytes32)` 18-field tuple: cap index7, redeemed8, agent9, status11, payout12, validBefore17 |
| Voucher | EIP-712 domain `{name:'AP4M Payment Ledger',version:'1',chainId,verifyingContract:paymentLedger}`; `Voucher(bytes32 channelId,uint256 cumulativeAmount)` |
| Direct redemption | `redeemVoucher((bytes32 channelId,uint256 cumulativeAmount) voucher,bytes agentSignature)` on PaymentLedger; agent sends and pays gas |
| Redemption event | `VoucherRedeemed(bytes32,bytes32,bytes32,bytes32,address,bytes32,address,address,uint256,uint256,uint256)`; helper reads claimId from topic2 |
| Close challenge | GET `/public/participant/close-channel-challenge?channel_id=...`, bearer session |
| Close | POST `/public/participant/close-channel`, JSON `{agent_signature_r,agent_signature_vs,channel_id}`; checkpoint-specific signature, not arbitrary message authority |
| Settle | POST `/public/participant/settle`, bearer session, JSON `{channel_id}` (or `{}`); HTTP202 means poll, not confirmed payout |

The guide mentions reporting direct redemption with `POST /record-redemption`, but that method/body is **not present in the inspected direct helper**. Do not invent its full path or JSON schema. The exact settle helper above is separately source-supported; it does not by itself prove finality or payout.

## x402 is a different execution path
Public `ap4m-x402.mjs` pins installation instructions to `ethers@6.17.0` and `/sdk/ap4m-sdk.tgz`, importing `@ap4m/sdk` and `@ap4m/sdk/participant-requests`. GET `/public/x402-context` must have schemaId `ap4m.hackathon-service.x402-context.v1`; parsed context includes environmentManifestDigest. The actual dynamic x402 manifest/context was not captured in this reference set. Agent `buyResource` and merchant `createX402Merchant` preserve payment state; merchant submits redemption in this flow. Do not substitute direct-agent redemption for merchant x402 semantics.

## Implemented preparation, still no signing/broadcast
`adapters/ap4m-prepare.mjs` now provides disabled-by-default, source-derived channel-request descriptors, exact 18-decimal conversion, narrowly shaped EIP-712 voucher data and redemption ABI call plans. It enforces deployment pins, full merchant identity, cumulative cap and exact reserved increment. All outputs explicitly prohibit signing/broadcast. No executable redemption calldata is fabricated; a reviewed ABI codec and actual signature remain required. It is not wired to a generic wallet/signing endpoint.

## Actual remaining inputs and verification
A personalized starter is **not required** for the public API/schema information above. What remains team-specific is: selected merchant ID and verified payout, actual channel ID/state/cap after opening, authorized session and signer connection, available gas, fresh on-chain verification, and a real supported treasury approval path. The full agent address and portal-reported 20 RLUSD are already known—do not ask the user again. Do not turn screenshot payout candidates into a selected runtime address. No secrets should be pasted into chat.
