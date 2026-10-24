# NEXXEN

**Agent spending. Human control.** Payment-first Agentic Finance hackathon prototype plan for business-owned agents.

## Status — October 24, 2026

This repository starter contains documentation and configuration templates only. There is no runnable application, verified API integration, issued card, deployed contract, completed transaction or passing application test suite yet. No install/start command is available until implementation exists.

The user-supplied consolidated v5 specification is background direction. The subsequently agreed lean MVP below controls this build: **RLUSD-only demo payments, bounded agent autonomy, Ledger treasury approval, and simulated credit quotes**. Broader lending, multi-currency and card-issuing aspirations are not completed features.

## MVP

One business authorizes a spending policy and funds an agent through a supported Ledger Flex transaction. The agent buys one approved service through the sponsor's AP4M flow; deterministic reservations enforce daily and channel caps. Over-limit requests stop for human review. Receipts distinguish voucher issuance, redemption and actual settlement.

- Currency dropdown: RLUSD enabled only after exact test-token/network verification; alternatives disabled and labeled “Coming later.”
- Ledger Flex (user-reported model 0908) protects treasury approval; an isolated operational signer handles permitted routine agent payments.
- Credit assessment uses labeled fixtures and deterministic quotes. No live loans, pools, bridge, FX routing or promised yield.
- Commercial Connect is a separate sandbox exploration, not the AP4M payment rail or proof of a spendable Mastercard.

## Start here

1. [MVP and acceptance checklist](MVP.md)
2. [API access and capability gates](API-SETUP.md)
3. [Five-minute demo and evidence](DEMO.md)
4. [Hackathon lead charter](XRPL-HACKATHON-LEAD.md)

`.env.example` names proposed configuration inputs; no code consumes them yet. `.gitignore` helps keep local secrets and diagnostics out of Git, but is not a security boundary. Never commit credentials, keys, seeds, reusable vouchers or private underwriting evidence.

## Next implementation checkpoint

Obtain the actual sponsor kit and deployment manifest; verify API access, test funds, Ledger support and endpoint capabilities. Then implement and test one funded purchase-to-settlement path before optional features. Submission deadline/timezone and final portal requirements still need confirmation.
