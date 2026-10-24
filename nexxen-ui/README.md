# NEXXEN: pay-per-use AI tools, paid by an agent over AP4M

Pick an AI tool, and your agent pays the seller in **RLUSD** with **Mastercard Agent Pay for Machines (AP4M)**
on the XRPL EVM Testnet, then delivers the result. No human approves individual payments: the agent reads the
seller's HTTP 402 challenge, signs an AP4M voucher, the seller redeems it on-chain, and AP4M settles RLUSD to
the seller's payout wallet.

Built for the Mastercard × XRPL hackathon on the official AP4M kit (`src/lib/ap4m/kit/`, unmodified).

## What's in the app

- **Wallet header**: agent wallet, XRP gas balance, RLUSD available out of the team budget (live from the
  AP4M service and the chain), last purchase, and a transaction history dialog with explorer links.
- **AI tools store**: Summarize a web page, Translate text, Generate an image, Analyze sentiment
  (0.001 RLUSD each, live price from each seller's 402 challenge).
- **Agent chat** (OpenUI + Vercel AI SDK): pick a tool and give the input; the agent shows your balance,
  pays, and renders the result with a receipt.
- **AP4M page**: Channels, purchases, settlements and receipts.

## How a purchase works

1. You pick a tool in the store and enter the input (URL, text or prompt).
2. The agent checks the balance and the business policy (`AP4M_MAX_PRICE`, `AP4M_MAX_CHANNEL_CAP`), and
   opens a Channel if none has room.
3. It requests the seller's resource, gets **HTTP 402**, signs a cumulative **EIP-712 voucher**
   (`buyResource`), and the seller redeems it on the **PaymentLedger** (`VoucherRedeemed` event).
4. Only after the redemption is confirmed does the seller run the AI job on your input.
5. AP4M settles RLUSD from the vault to the seller's payout wallet and publishes a verifiable receipt.

## Run it

```bash
pnpm install
pnpm merchants   # the four x402 sellers on 127.0.0.1:4308-4311
pnpm dev         # http://localhost:3000
```

Configuration is in `.env.local`:

| Key | Meaning |
| --- | --- |
| `AP4M_TEAM_NAME` | Registered team (`NEXXEN`) |
| `AGENT_PRIVATE_KEY` | Agent wallet `0xe3D8…5183` (**testnet-only key, committed on purpose**) |
| `MERCHANT_ID`, `MERCHANT_PAYOUT` | From the AP4M portal, My setup |
| `AP4M_MAX_PRICE`, `AP4M_MAX_CHANNEL_CAP` | The business's spending policy for the agent |
| `AP4M_MODE` | `auto` (default: live when the agent can sign in), `live`, or `demo` |
| `AI_MODEL` | Agent model, default `claude-code:sonnet` (uses a local `claude` login, no API key) |

### For teammates picking this up

- **Env:** `.env.local` is committed and is all the AP4M config you need (team, agent key, merchant ID,
  payout, policy). Don't change the agent key or team name.
- **AI model:** the default `AI_MODEL=claude-code:sonnet` uses *your* local Claude Code login. Install
  Claude Code and run `claude` once to sign in, or set `AI_MODEL` to an API provider plus its key
  (see `.env.example`).
- **Tooling:** Node 22.13+ and pnpm. Start the sellers (`pnpm merchants`) before the app.
- **One live buyer at a time:** everyone shares one agent wallet and Channel. Purchases read the Channel's
  on-chain total before signing, so taking turns is fine, but two machines buying in the same few seconds
  can collide.
- **Local history:** the purchase journal (`.ap4m/`) stays on each machine, so a fresh checkout starts with
  an empty history dialog; balances come from the chain and are shared.
- **Docs:** `docs/` has the architecture page, the flow diagram and a 66 s demo video.

`demo` mode runs the same flow locally (real signed vouchers, simulated Channel and payout) and is used
automatically if live sign-in fails.

> The committed `.env.local` holds a **testnet-only** key. The wallet was checked and holds nothing and has
> no history on Ethereum, XRPL EVM mainnet, Base, Arbitrum, Optimism, Polygon, BNB Chain or Avalanche. Never
> fund it on a mainnet.

## Layout

| Path | What |
| --- | --- |
| `src/lib/ap4m/agent.ts` | Live AP4M: sign-in, Channels, x402 purchase, settlement, balance; demo fallback |
| `src/lib/ap4m/ai-tools.ts` | The sellers' AI jobs (own tool-less model; Pollinations for images) |
| `src/lib/ap4m/kit/` | Official AP4M hackathon helpers, unmodified, plus type declarations |
| `src/lib/tools/ap4m.ts` | Agent tools: `list_services`, `get_balance`, `buy_service`, `settle_payments` |
| `scripts/merchants.mjs` | x402 Merchants built with `createX402Merchant` |
| `src/components/` | Wallet header, AI tools store, AP4M page (custom React) |
| `src/config/` | Services catalog, starters, agent instructions |

Network: XRPL EVM Testnet (chain 1449000), PaymentLedger `0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91`,
explorer https://explorer.testnet.xrplevm.org.
