# NXS and NEXXEN testnet simulation: results summary

Scope: testnet-only simulation; no mainnet activity is modelled or implied.

Benefit status: all environmental benefits below are proposed, pending independent MRV verification.

Governance: Token voting never approves benefits. Votes may signal preference only. Benefit recognition requires independent MRV verification outside this model.


Configuration: 100,000 participants, 365 days, 100 Monte Carlo runs, agent share 50%, misbehaving agent share 2.0%, seed 20261027. Wall clock 349.6 s.


## Provenance of inputs

| Provenance | Count | Meaning |
| --- | --- | --- |
| SOURCED | 8 | Primary source fetched and read, URL and year recorded |
| UNVERIFIED | 4 | Figure has a URL and year but the primary source could not be read |
| EXAMPLE_INPUT | 42 | Modelling choice, not a measurement |

The full table with every value, unit, URL, year and caveat is in `results/assumptions.csv`.


## Headline results (p50 across runs)

| Metric | p50 | p5 | p95 |
| --- | --- | --- | --- |
| Settled transactions | 135,858,221 | 135,187,217 | 136,649,731 |
| Transactions declined by policy | 52,858,782 | 52,150,201 | 53,722,101 |
| Card spend volume (RLUSD) | 701,686,369 | 698,990,631 | 703,929,595 |
| Quicknode API credits | 164,642,218,727 | 162,670,690,607 | 166,632,542,852 |
| Quicknode cost per year (USD) | 76,313 | 75,327 | 77,308 |
| Quicknode cost per participant (USD) | 0.7631 | 0.7533 | 0.7731 |
| Quicknode cost per agent (USD) | 1.5087 | 1.4952 | 1.5275 |
| Energy (kWh) | 1,201,708 | 1,194,631 | 1,209,663 |
| of which XRPL ledger (kWh) | 1,073,280 | 1,067,979 | 1,079,533 |
| of which RPC compute (kWh) | 128,421 | 126,883 | 129,973 |
| Carbon (kg CO2e) | 473,473 | 470,685 | 476,607 |
| Water (litres) | 5,864,337 | 5,829,802 | 5,903,157 |
| Carbon per settled tx (g CO2e) | 3.4847 | 3.4822 | 3.4882 |
| Water per settled tx (litres) | 0.0432 | 0.0431 | 0.0432 |
| Sidechain gas (native token) | 184,617.3666 | 183,691.1844 | 185,765.4626 |
| Limit breach attempts | 113,660 | 111,169 | 117,073 |
| Breaches blocked without human approval | 73,867 | 72,259 | 76,015 |
| Share of attempts declined by policy | 0.2802 | 0.2782 | 0.2827 |
| Median cycle utilisation | 0.3587 | 0.3557 | 0.3619 |
| Default rate per billing cycle, all | 0.0857 | 0.0852 | 0.0862 |
| Default rate per billing cycle, agents | 0.0884 | 0.0877 | 0.0891 |
| Share missing at least one cycle in the year | 0.6063 | 0.6034 | 0.6080 |
| Loss rate on spend | 0.0856 | 0.0849 | 0.0861 |
| Median agent credit score | 692 | 692 | 693 |
| NXS/RLUSD pool liquidity (RLUSD) | 7,510,291 | 7,472,645 | 7,552,585 |
| NEXXEN/XRP pool liquidity (RLUSD equivalent) | 3,755,146 | 3,736,322 | 3,776,292 |
| WTR credits for water positive (kl) | 7,037.2 | 6,995.8 | 7,083.8 |
| Carbon credits for carbon negative (t) | 520.820 | 517.753 | 524.268 |
| Offset cost, full scenario (USD) | 13,583.15 | 13,503.16 | 13,673.07 |

## Quicknode plan mapping

| Tier selected | Runs |
| --- | --- |
| Business+ T3 + overage | 100 |

Tier choice is the cheapest published tier whose included credits cover the modelled monthly volume. Enterprise is custom priced and is not modelled.


## Offset scenarios

| Scenario | Coverage | WTR procured (kl) | Carbon retired (t) | Water outstanding (l) | Carbon outstanding (kg) | Water positive | Carbon negative | Cost (USD) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| none | 0% | 0.0 | 0.000 | 5,904,443 | 476,711.2 | no | no | 0.00 |
| partial | 50% | 3,542.7 | 262.191 | 2,361,777 | 214,520.0 | no | no | 6,838.02 |
| full | 100% | 7,085.3 | 524.382 | 0 | 0.0 | yes | yes | 13,676.05 |

Status of every figure in this table: proposed, pending independent MRV verification.


## Sensitivity: which input actually drives the answer

The ledger term is 89.3% of modelled energy and the RPC compute term is 10.7%. Both terms are linear in their driving constant, so the table below is exact rather than estimated.

| Change | Total energy (kWh) | Change vs p50 |
| --- | --- | --- |
| baseline | 1,201,701 | +0.0% |
| XRPL kWh/tx 10x lower | 235,749 | -80.4% |
| XRPL kWh/tx 10x higher | 10,861,220 | +803.8% |
| Quicknode Wh/credit 10x lower | 1,086,122 | -9.6% |
| Quicknode Wh/credit 10x higher | 2,357,489 | +96.2% |

The headline footprint is therefore governed by XRPL_ENERGY_KWH_PER_TX, which is the one input flagged UNVERIFIED in the energy chain. Ripple publishes carbon neutrality claims but no per-transaction kWh figure, and learn.xrpl.org returned HTTP 403 when fetched. Treat the absolute energy, carbon and water totals as order-of-magnitude only until that number is sourced or measured.


## Top risks surfaced by the simulation

1. **The headline footprint rests on an unverified constant.** XRPL energy per transaction drives most of the modelled energy, carbon and water, and it is the one figure in the chain with no readable primary source. Every downstream offset volume and cost inherits that uncertainty.

2. **Offset cost is immaterial, which is itself the risk.** At the EXAMPLE_INPUT credit prices the full offset scenario costs very little against card spend volume. That makes the water positive and carbon negative claim cheap to assert and correspondingly hard for a third party to take seriously without MRV evidence. The constraint is verification, not budget.

3. **Declined transactions still cost money.** RPC load follows attempted work, so a blocked or breaching agent bills API credits with no settled volume to offset them. A misbehaving fleet raises Quicknode cost and the compute footprint while producing zero revenue.

4. **The RPC provider is a single point of settlement failure.** During the modelled outage a share of payments fail to confirm while retries multiply API credits. Cost rises exactly when throughput falls, and defaults cluster into the following cycle close.

5. **Collateral stress and defaults arrive together.** The collateral shock degrades repayment for thinly collateralised accounts, so losses concentrate in the cycle that closes inside the shock window rather than spreading evenly across the year.


## Reproducing

```
python -m sim.run --quick      # fast smoke run
python -m sim.run              # full default configuration
python -m pytest tests/ -q     # unit tests
```

