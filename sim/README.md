# NXS and NEXXEN testnet simulation

A Monte Carlo model of 100,000 participants, humans and AI agents, using NXS and
the NEXXEN agent card on the XRP Ledger and the XRPL EVM sidechain over 365
simulated days.

This is a simulation. It makes no claim about mainnet behaviour, holds no keys,
opens no network connections and moves no funds.

## What it measures

1. **Ledger footprint.** Transactions, energy in kWh, carbon in kg CO2e and
   water in litres, split between the XRPL leg and the RPC compute served by
   Quicknode.
2. **Quicknode accounting.** Billed API credits mapped to the published plan
   tiers, with cost per participant and per agent.
3. **Agent credit score.** A 300 to 850 score per agent built from repayment
   history, spend against limit, RLUSD collateral ratio, compute efficiency and
   anomaly flags.
4. **Offsets.** WTR water credits and carbon credits needed to reach water
   positive and carbon negative, under three scenarios: none, partial and full.
5. **Economics.** Card spend volume, defaults, pool liquidity and sidechain gas.

## Running it

```bash
python -m sim.run --quick            # smoke run: 2,000 participants, 60 days, 3 runs
python -m sim.run                    # default: 100,000 participants, 365 days, 100 runs
python -m sim.run --runs 20 --no-charts
python -m pytest tests/ -q
```

One full run takes about 3.5 seconds on an 8 core laptop, so the default 100 run
Monte Carlo finishes in about 6 minutes. The model loops over days and vectorizes
over participants, so it never materialises a 36.5 million cell matrix.

Outputs land in `results/`: CSVs, `summary.md` and five PNG charts.

## How to read the numbers

**Provenance is tracked per constant.** `sim/constants.py` tags every value as
`SOURCED` (primary source fetched and read, with URL and year), `UNVERIFIED`
(has a URL and year, but the primary source could not be read) or
`EXAMPLE_INPUT` (a modelling choice, not a measurement). The full table is
written to `results/assumptions.csv` on every run, and tests enforce that an
`EXAMPLE_INPUT` never carries a source URL.

**The footprint totals are order-of-magnitude only.** Most of the modelled
energy comes from XRPL energy per transaction, and that is the one input in the
energy chain flagged `UNVERIFIED`. Ripple publishes carbon neutrality claims but
no per-transaction kWh figure, and `learn.xrpl.org` returned HTTP 403. The
sensitivity table in `summary.md` shows exactly how the totals move with it.

**Every environmental benefit is proposed, pending independent MRV
verification.** Nothing in this code verifies anything. Token voting never
approves benefits; votes may signal preference only. These strings live in
`constants.py` and are asserted in `tests/test_offsets.py` so the language
cannot drift.

**Water is counted on-site and indirect.** The water consumed generating the
electricity is roughly 12.6 times the on-site cooling water, so reporting
on-site only would understate the footprint by about 92 percent.

## Known simplifications

- Each participant-day draws one representative per-transaction amount and
  repeats it for that day's transaction count. This keeps the model vectorized
  and leaves the per-transaction cap meaningful, but it compresses within-day
  amount variance, so within-day tail risk is understated. Across-participant
  and across-day variance are preserved.
- The per-transaction cap has a human approval path. The cycle limit does not:
  once exhausted, the card declines.
- Quicknode energy per API credit is an `EXAMPLE_INPUT`. No provider publishes
  a per-credit energy disclosure.
- Offset credit prices are `EXAMPLE_INPUT` placeholders. Voluntary market prices
  vary by orders of magnitude and none should be quoted from this model.
- Enterprise Quicknode pricing is custom and so is not modelled.

## Layout

| Path | Contents |
| --- | --- |
| `sim/constants.py` | Every constant, with provenance, URL, year and caveat |
| `sim/agents.py` | Population generation, behavioural parameters, stress events |
| `sim/ledger.py` | Daily transactions, limit enforcement, fees and gas |
| `sim/credit.py` | The 300 to 850 agent credit score |
| `sim/footprint.py` | API credits, energy, carbon, water, plan mapping, offsets |
| `sim/run.py` | Monte Carlo orchestration, CSVs, charts and summary |
| `tests/` | Unit tests for score, footprint, offset and control math |
