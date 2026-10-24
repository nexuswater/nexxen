# NEXXEN

Mastercard × XRPL hackathon. Two apps live side by side:

| Folder | What | Run |
| --- | --- | --- |
| [`nexxen-core/`](nexxen-core/) | Payment-first MVP for business-owned agents: spending controls, adapters (AP4M, card, payout sandboxes) and the original server. | `cd nexxen-core && npm start` (Node 24+) |
| [`nexxen-ui/`](nexxen-ui/) | Agent UI: pay-per-use AI tools bought by an agent over AP4M (x402 vouchers, RLUSD on XRPL EVM Testnet), with wallet header and transaction history. | `cd nexxen-ui && pnpm install && pnpm merchants & pnpm dev` |

Each folder has its own README.
