"""Run the NXS / NEXXEN testnet simulation and write results.

Architecture note on performance: the model loops over days and vectorizes over
participants. It never materialises a participants-by-days matrix, which for
100,000 participants over 365 days would be 36.5 million cells per variable.
Per-day arrays of 100,000 floats stay in cache-friendly territory, so a single
run is a few seconds and a 100 run Monte Carlo fits the budget.

Usage:
    python -m sim.run                 # full default: 100k participants, 365 days, 100 runs
    python -m sim.run --quick         # fast smoke run
    python -m sim.run --runs 20
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from . import credit, footprint, ledger
from .agents import BILLING_CYCLE_DAYS, EventConfig, SimConfig, build_population, event_factors
from .constants import (
    BENEFIT_APPROVAL_RULE,
    BENEFIT_CLAIM_STATUS,
    NETWORK_SCOPE,
    OFFSET_SCENARIOS,
    assumptions_table,
    counts_by_provenance,
)

SCORE_BINS = np.arange(300, 861, 10, dtype=np.float64)

DAILY_METRICS = (
    "tx_settled",
    "tx_blocked",
    "spend_rlusd",
    "rpc_calls",
    "api_credits",
    "energy_kwh",
    "carbon_kg",
    "water_l",
    "gas_native",
    "breach_attempts",
    "approvals_granted",
    "defaults",
)


@dataclass
class RunResult:
    daily: dict[str, np.ndarray]
    headline: dict[str, float]
    score_hist: np.ndarray
    score_quantiles: dict[str, float]
    agent_cost_quantiles: dict[str, float]
    plan: footprint.PlanChoice
    offsets: dict[str, footprint.OffsetRequirement] = field(default_factory=dict)


def simulate_run(cfg: SimConfig, seed: int) -> RunResult:
    rng = np.random.default_rng(seed)
    pop = build_population(cfg, rng)
    n = pop.n

    daily = {k: np.zeros(cfg.days, dtype=np.float64) for k in DAILY_METRICS}

    # Per-participant accumulators over the whole horizon.
    tot_spend = np.zeros(n)
    tot_settled = np.zeros(n)
    tot_blocked = np.zeros(n)
    tot_credits = np.zeros(n)
    tot_breaches = np.zeros(n)
    tot_approvals = np.zeros(n)
    tot_compute_kwh = np.zeros(n)

    cycle_spend = np.zeros(n)
    cycles_observed = np.zeros(n)
    cycles_on_time = np.zeros(n)
    cycles_missed = np.zeros(n)
    utilisation_sum = np.zeros(n)
    defaulted_value = np.zeros(n)
    ever_defaulted = np.zeros(n, dtype=bool)

    cycle_len = int(BILLING_CYCLE_DAYS)
    # Stress is accumulated across the cycle rather than read on the close day.
    # Reading it only on the close day meant an event that did not happen to
    # overlap a cycle boundary had no effect on defaults at all, which silently
    # disabled the collateral shock.
    cycle_shock_days = 0.0
    cycle_collateral_mult_sum = 0.0

    for day in range(cfg.days):
        f = event_factors(day, cfg.events)
        cycle_shock_days += f["in_shock"]
        cycle_collateral_mult_sum += f["collateral_mult"]

        d = ledger.step(pop, rng, f, cycle_spend)

        # Billed credits and the compute footprint they imply.
        net_standard = np.maximum(d.rpc_calls - d.advanced_calls, 0.0)
        credits = 20.0 * (net_standard + d.advanced_calls * 2.0)
        compute_kwh = footprint.compute_energy_kwh(1.0) * credits
        led_kwh = footprint.ledger_energy_kwh(1.0) * d.xrpl_tx
        energy_kwh = compute_kwh + led_kwh
        carbon = footprint.carbon_kg(1.0) * energy_kwh
        water_total = (
            footprint.water_litres(1.0)["total_l"] * energy_kwh
        )

        cycle_spend += d.spend
        tot_spend += d.spend
        tot_settled += d.tx_settled
        tot_blocked += d.tx_blocked
        tot_credits += credits
        tot_breaches += d.breach_attempts
        tot_approvals += d.approvals_granted
        tot_compute_kwh += compute_kwh

        defaults_today = 0.0

        # Billing cycle close-out.
        if (day + 1) % cycle_len == 0:
            had_balance = cycle_spend > 0
            # Exposure is the share of the cycle spent under collateral stress, so a
            # shock anywhere inside the cycle degrades repayment proportionally.
            stress_share = cycle_shock_days / cycle_len
            avg_collateral_mult = cycle_collateral_mult_sum / cycle_len
            eff_repay = np.clip(
                pop.repay_prob - cfg.events.market_shock_repay_penalty * stress_share, 0.0, 1.0
            )
            # Collateral stress raises default risk for thinly collateralised accounts.
            stressed_collateral = pop.collateral_ratio * avg_collateral_mult
            under_collateralised = stressed_collateral < 1.0
            eff_repay = np.where(under_collateralised, eff_repay * 0.9, eff_repay)

            repaid = rng.random(n) < eff_repay
            cycles_observed += had_balance
            cycles_on_time += had_balance & repaid
            missed = had_balance & ~repaid
            cycles_missed += missed
            utilisation_sum += np.where(had_balance, cycle_spend / np.maximum(pop.cycle_limit, 1e-9), 0.0)
            defaulted_value += np.where(missed, cycle_spend, 0.0)
            ever_defaulted |= missed
            defaults_today = float(missed.sum())
            cycle_spend = np.zeros(n)
            cycle_shock_days = 0.0
            cycle_collateral_mult_sum = 0.0

        daily["tx_settled"][day] = d.tx_settled.sum()
        daily["tx_blocked"][day] = d.tx_blocked.sum()
        daily["spend_rlusd"][day] = d.spend.sum()
        daily["rpc_calls"][day] = d.rpc_calls.sum()
        daily["api_credits"][day] = credits.sum()
        daily["energy_kwh"][day] = energy_kwh.sum()
        daily["carbon_kg"][day] = carbon.sum()
        daily["water_l"][day] = water_total.sum()
        daily["gas_native"][day] = d.gas_native.sum()
        daily["breach_attempts"][day] = d.breach_attempts.sum()
        daily["approvals_granted"][day] = d.approvals_granted.sum()
        daily["defaults"][day] = defaults_today

    # ---- Quicknode plan and cost allocation ----
    total_credits = float(tot_credits.sum())
    months = cfg.days / 30.4375
    monthly_credits = total_credits / months if months > 0 else 0.0
    plan = footprint.choose_plan(monthly_credits)
    annual_cost = plan.total_usd * months
    usd_per_credit = annual_cost / total_credits if total_credits > 0 else 0.0

    participant_usd = tot_credits * usd_per_credit
    is_agent = pop.is_agent

    # ---- Credit scores ----
    total_energy = float(daily["energy_kwh"].sum())
    participant_carbon_g = (
        tot_compute_kwh + footprint.ledger_energy_kwh(1.0) * tot_settled
    ) * footprint.carbon_kg(1.0) * 1000.0

    scores = credit.score(
        cycles_observed=cycles_observed,
        cycles_on_time=cycles_on_time,
        spend=tot_spend / np.maximum(cycles_observed, 1.0),
        cycle_limit=pop.cycle_limit,
        collateral_ratio=pop.collateral_ratio,
        quicknode_usd=participant_usd,
        carbon_g=participant_carbon_g,
        settled_tx=tot_settled,
        breach_attempts=tot_breaches,
    )
    agent_scores = scores[is_agent]
    score_hist, _ = np.histogram(agent_scores, bins=SCORE_BINS)

    # ---- Offsets ----
    gross_carbon = float(daily["carbon_kg"].sum())
    gross_water = float(daily["water_l"].sum())
    offsets = {s: footprint.offsets_required(gross_carbon, gross_water, s) for s in OFFSET_SCENARIOS}

    # ---- Economics ----
    total_spend = float(tot_spend.sum())
    n_agents = int(is_agent.sum())
    n_humans = int((~is_agent).sum())
    liq = ledger.pool_liquidity_need(float(np.percentile(daily["spend_rlusd"], 95)))

    agent_usd = participant_usd[is_agent]
    q = lambda a, p: float(np.percentile(a, p)) if a.size else 0.0

    headline = {
        "participants": float(n),
        "agents": float(n_agents),
        "humans": float(n_humans),
        "total_tx_settled": float(tot_settled.sum()),
        "total_tx_blocked": float(tot_blocked.sum()),
        "total_spend_rlusd": total_spend,
        "total_api_credits": total_credits,
        "quicknode_annual_usd": annual_cost,
        "quicknode_usd_per_participant": annual_cost / n if n else 0.0,
        "quicknode_usd_per_agent": float(agent_usd.sum()) / n_agents if n_agents else 0.0,
        "total_energy_kwh": total_energy,
        "ledger_energy_kwh": float(footprint.ledger_energy_kwh(1.0) * tot_settled.sum()),
        "compute_energy_kwh": float(tot_compute_kwh.sum()),
        "total_carbon_kg": gross_carbon,
        "total_water_l": gross_water,
        "carbon_g_per_settled_tx": gross_carbon * 1000.0 / max(tot_settled.sum(), 1.0),
        "water_l_per_settled_tx": gross_water / max(tot_settled.sum(), 1.0),
        "total_gas_native": float(daily["gas_native"].sum()),
        "breach_attempts": float(tot_breaches.sum()),
        "approvals_granted": float(tot_approvals.sum()),
        "breaches_blocked": float(tot_breaches.sum() - tot_approvals.sum()),
        # Three different things that all get loosely called "default rate". Named
        # apart here because conflating them overstates risk by roughly 10x.
        # cycle_default_rate is the comparable one: missed cycles / billed cycles.
        "cycle_default_rate": float(cycles_missed.sum() / max(cycles_observed.sum(), 1.0)),
        "cycle_default_rate_agents": float(
            cycles_missed[is_agent].sum() / max(cycles_observed[is_agent].sum(), 1.0)
        ) if n_agents else 0.0,
        "any_missed_cycle_rate": float(ever_defaulted.mean()),
        "any_missed_cycle_rate_agents": float(ever_defaulted[is_agent].mean()) if n_agents else 0.0,
        "defaulted_value_rlusd": float(defaulted_value.sum()),
        "loss_rate_on_spend": float(defaulted_value.sum()) / total_spend if total_spend > 0 else 0.0,
        "median_utilisation": float(
            np.median((utilisation_sum / np.maximum(cycles_observed, 1.0))[cycles_observed > 0])
        ) if (cycles_observed > 0).any() else 0.0,
        "decline_share_of_attempts": float(
            tot_blocked.sum() / max(tot_blocked.sum() + tot_settled.sum(), 1.0)
        ),
        "agent_score_median": q(agent_scores, 50),
        "nxs_rlusd_pool_rlusd": liq["nxs_rlusd_pool_rlusd"],
        "nexxen_xrp_pool_rlusd_equiv": liq["nexxen_xrp_pool_rlusd_equiv"],
        "offset_cost_full_usd": offsets["full"].total_cost_usd,
        "required_wtr_kl_full": offsets["full"].required_wtr_kl,
        "required_carbon_tonnes_full": offsets["full"].required_carbon_tonnes,
    }

    return RunResult(
        daily=daily,
        headline=headline,
        score_hist=score_hist,
        score_quantiles={f"p{p}": q(agent_scores, p) for p in (5, 25, 50, 75, 95)},
        agent_cost_quantiles={f"p{p}": q(agent_usd, p) for p in (5, 50, 95)},
        plan=plan,
        offsets=offsets,
    )


def monte_carlo(cfg: SimConfig, verbose: bool = True) -> dict:
    headlines: list[dict[str, float]] = []
    daily_stack: dict[str, list[np.ndarray]] = {k: [] for k in DAILY_METRICS}
    score_hist_total = np.zeros(len(SCORE_BINS) - 1)
    score_q: list[dict[str, float]] = []
    cost_q: list[dict[str, float]] = []
    plans: list[str] = []
    offsets_last: dict[str, footprint.OffsetRequirement] = {}

    t0 = time.time()
    for i in range(cfg.runs):
        r = simulate_run(cfg, seed=cfg.seed + i)
        headlines.append(r.headline)
        for k in DAILY_METRICS:
            daily_stack[k].append(r.daily[k])
        score_hist_total += r.score_hist
        score_q.append(r.score_quantiles)
        cost_q.append(r.agent_cost_quantiles)
        plans.append(r.plan.plan)
        offsets_last = r.offsets
        if verbose and (i == 0 or (i + 1) % 10 == 0):
            el = time.time() - t0
            print(f"  run {i + 1}/{cfg.runs}  elapsed {el:.1f}s  eta {el / (i + 1) * (cfg.runs - i - 1):.1f}s", flush=True)

    hdf = pd.DataFrame(headlines)
    headline_stats = pd.DataFrame(
        {
            "p5": hdf.quantile(0.05),
            "p50": hdf.quantile(0.50),
            "p95": hdf.quantile(0.95),
            "mean": hdf.mean(),
        }
    )

    daily_stats = {}
    for k in DAILY_METRICS:
        arr = np.vstack(daily_stack[k])
        daily_stats[k] = {
            "p5": np.percentile(arr, 5, axis=0),
            "p50": np.percentile(arr, 50, axis=0),
            "p95": np.percentile(arr, 95, axis=0),
        }

    return {
        "config": cfg,
        "headline_stats": headline_stats,
        "daily_stats": daily_stats,
        "score_hist": score_hist_total / cfg.runs,
        "score_quantiles": pd.DataFrame(score_q).quantile([0.05, 0.5, 0.95]),
        "agent_cost_quantiles": pd.DataFrame(cost_q).quantile([0.05, 0.5, 0.95]),
        "plans": plans,
        "offsets": offsets_last,
        "elapsed_s": time.time() - t0,
    }


# ---------------------------------------------------------------------------
# Output writers
# ---------------------------------------------------------------------------


def write_csvs(res: dict, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(assumptions_table()).to_csv(out / "assumptions.csv", index=False)

    res["headline_stats"].to_csv(out / "headline_p5_p50_p95.csv")

    rows = {"day": np.arange(res["config"].days)}
    for k, v in res["daily_stats"].items():
        for band in ("p5", "p50", "p95"):
            rows[f"{k}_{band}"] = v[band]
    pd.DataFrame(rows).to_csv(out / "daily_timeseries.csv", index=False)

    off = []
    for name, o in res["offsets"].items():
        off.append(
            {
                "scenario": name,
                "coverage": o.coverage,
                "gross_carbon_kg": o.gross_carbon_kg,
                "gross_water_l": o.gross_water_l,
                "required_carbon_tonnes": o.required_carbon_tonnes,
                "required_wtr_kl": o.required_wtr_kl,
                "procured_carbon_tonnes": o.procured_carbon_tonnes,
                "procured_wtr_kl": o.procured_wtr_kl,
                "net_carbon_kg": o.net_carbon_kg,
                "net_water_l": o.net_water_l,
                "carbon_negative": o.carbon_negative,
                "water_positive": o.water_positive,
                "total_cost_usd": o.total_cost_usd,
                "claim_status": o.claim_status,
            }
        )
    pd.DataFrame(off).to_csv(out / "offsets.csv", index=False)

    centers = (SCORE_BINS[:-1] + SCORE_BINS[1:]) / 2
    pd.DataFrame({"score_bin_center": centers, "mean_agents": res["score_hist"]}).to_csv(
        out / "credit_score_distribution.csv", index=False
    )

    pd.Series(res["plans"]).value_counts().rename("runs").to_csv(out / "quicknode_plan.csv")
    res["score_quantiles"].to_csv(out / "agent_score_quantiles.csv")
    res["agent_cost_quantiles"].to_csv(out / "agent_cost_quantiles.csv")


def write_charts(res: dict, out: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out.mkdir(parents=True, exist_ok=True)
    days = np.arange(res["config"].days)

    # 1. Footprint over time
    fig, ax = plt.subplots(2, 1, figsize=(10, 7), sharex=True)
    for i, (key, label, colour) in enumerate(
        [("carbon_kg", "Carbon (kg CO2e/day)", "tab:red"), ("water_l", "Water (litres/day)", "tab:blue")]
    ):
        d = res["daily_stats"][key]
        ax[i].fill_between(days, d["p5"], d["p95"], alpha=0.25, color=colour, label="p5 to p95")
        ax[i].plot(days, d["p50"], color=colour, lw=1.4, label="p50")
        ax[i].set_ylabel(label)
        ax[i].legend(loc="upper left", fontsize=8)
        ax[i].grid(alpha=0.3)
    ax[1].set_xlabel("Simulated day")
    ax[0].set_title("Daily footprint from NXS and NEXXEN activity (testnet simulation)")
    fig.tight_layout()
    fig.savefig(out / "footprint_over_time.png", dpi=130)
    plt.close(fig)

    # 2. Cost per agent
    cq = res["agent_cost_quantiles"]
    fig, ax = plt.subplots(figsize=(8, 5))
    labels = list(cq.columns)
    vals = [cq.loc[0.5, c] for c in labels]
    lo = [cq.loc[0.05, c] for c in labels]
    hi = [cq.loc[0.95, c] for c in labels]
    xpos = np.arange(len(labels))
    ax.bar(xpos, vals, color="tab:purple", alpha=0.8)
    ax.errorbar(xpos, vals, yerr=[np.array(vals) - np.array(lo), np.array(hi) - np.array(vals)],
                fmt="none", ecolor="black", capsize=4)
    ax.set_xticks(xpos)
    ax.set_xticklabels([f"agent {c}" for c in labels])
    ax.set_ylabel("Quicknode cost per agent per year (USD)")
    ax.set_title("Quicknode cost per agent, across Monte Carlo runs")
    ax.grid(alpha=0.3, axis="y")
    fig.tight_layout()
    fig.savefig(out / "cost_per_agent.png", dpi=130)
    plt.close(fig)

    # 3. Credit score distribution
    centers = (SCORE_BINS[:-1] + SCORE_BINS[1:]) / 2
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.bar(centers, res["score_hist"], width=9, color="tab:green", alpha=0.85)
    for edge, name in [(580, "poor"), (670, "fair"), (740, "good"), (800, "very good")]:
        ax.axvline(edge, color="grey", ls="--", lw=0.8)
        ax.text(edge + 2, ax.get_ylim()[1] * 0.92, name, fontsize=7, rotation=90, color="grey")
    ax.set_xlabel("Agent credit score (300 to 850)")
    ax.set_ylabel("Agents per bin (mean across runs)")
    ax.set_title("Agent credit score distribution")
    ax.grid(alpha=0.3, axis="y")
    fig.tight_layout()
    fig.savefig(out / "credit_score_distribution.png", dpi=130)
    plt.close(fig)

    # 4. Offsets required
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.5))
    names = ["none", "partial", "full"]
    offs = [res["offsets"][n] for n in names]
    ax[0].bar(names, [o.procured_wtr_kl for o in offs], color="tab:blue", alpha=0.85)
    ax[0].set_ylabel("WTR credits procured (kilolitres)")
    ax[0].set_title("Water credits, by scenario")
    ax[1].bar(names, [o.procured_carbon_tonnes for o in offs], color="tab:red", alpha=0.85)
    ax[1].set_ylabel("Carbon credits retired (tonnes CO2e)")
    ax[1].set_title("Carbon credits, by scenario")
    for a in ax:
        a.grid(alpha=0.3, axis="y")
    fig.suptitle(f"Offsets required. Status: {BENEFIT_CLAIM_STATUS}", fontsize=9)
    fig.tight_layout()
    fig.savefig(out / "offsets_required.png", dpi=130)
    plt.close(fig)

    # 5. Default rate over time
    d = res["daily_stats"]["defaults"]
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.fill_between(days, d["p5"], d["p95"], alpha=0.25, color="tab:orange", label="p5 to p95")
    ax.plot(days, d["p50"], color="tab:orange", lw=1.4, label="p50")
    ev = res["config"].events
    for day0, span, lab in [
        (ev.market_shock_day, ev.market_shock_days, "collateral shock"),
        (ev.quicknode_outage_day, ev.quicknode_outage_days, "RPC outage"),
        (ev.gas_spike_day, ev.gas_spike_days, "gas spike"),
    ]:
        ax.axvspan(day0, day0 + span, color="grey", alpha=0.18)
        ax.text(day0 + 1, ax.get_ylim()[1] * 0.9, lab, fontsize=7, rotation=90)
    ax.set_xlabel("Simulated day")
    ax.set_ylabel("Accounts defaulting at cycle close")
    ax.set_title("Defaults at billing cycle close, with stress events shaded")
    ax.legend(loc="upper left", fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(out / "default_rates.png", dpi=130)
    plt.close(fig)


def write_summary(res: dict, out: Path) -> None:
    h = res["headline_stats"]
    cfg: SimConfig = res["config"]
    prov = counts_by_provenance()

    def row(name: str, fmt: str = ",.2f") -> str:
        if name not in h.index:
            return "n/a"
        return f"{h.loc[name, 'p50']:{fmt}}"

    lines: list[str] = []
    lines.append("# NXS and NEXXEN testnet simulation: results summary\n")
    lines.append(f"Scope: {NETWORK_SCOPE}.\n")
    lines.append(f"Benefit status: all environmental benefits below are {BENEFIT_CLAIM_STATUS}.\n")
    lines.append(f"Governance: {BENEFIT_APPROVAL_RULE}\n")
    lines.append(
        f"\nConfiguration: {cfg.n_participants:,} participants, {cfg.days} days, "
        f"{cfg.runs} Monte Carlo runs, agent share {cfg.agent_share:.0%}, "
        f"misbehaving agent share {cfg.misbehaving_share:.1%}, seed {cfg.seed}. "
        f"Wall clock {res['elapsed_s']:.1f} s.\n"
    )

    lines.append("\n## Provenance of inputs\n")
    lines.append("| Provenance | Count | Meaning |")
    lines.append("| --- | --- | --- |")
    lines.append(f"| SOURCED | {prov['SOURCED']} | Primary source fetched and read, URL and year recorded |")
    lines.append(f"| UNVERIFIED | {prov['UNVERIFIED']} | Figure has a URL and year but the primary source could not be read |")
    lines.append(f"| EXAMPLE_INPUT | {prov['EXAMPLE_INPUT']} | Modelling choice, not a measurement |")
    lines.append("\nThe full table with every value, unit, URL, year and caveat is in `results/assumptions.csv`.\n")

    lines.append("\n## Headline results (p50 across runs)\n")
    lines.append("| Metric | p50 | p5 | p95 |")
    lines.append("| --- | --- | --- | --- |")
    show = [
        ("total_tx_settled", "Settled transactions", ",.0f"),
        ("total_tx_blocked", "Transactions declined by policy", ",.0f"),
        ("total_spend_rlusd", "Card spend volume (RLUSD)", ",.0f"),
        ("total_api_credits", "Quicknode API credits", ",.0f"),
        ("quicknode_annual_usd", "Quicknode cost per year (USD)", ",.0f"),
        ("quicknode_usd_per_participant", "Quicknode cost per participant (USD)", ",.4f"),
        ("quicknode_usd_per_agent", "Quicknode cost per agent (USD)", ",.4f"),
        ("total_energy_kwh", "Energy (kWh)", ",.0f"),
        ("ledger_energy_kwh", "of which XRPL ledger (kWh)", ",.0f"),
        ("compute_energy_kwh", "of which RPC compute (kWh)", ",.0f"),
        ("total_carbon_kg", "Carbon (kg CO2e)", ",.0f"),
        ("total_water_l", "Water (litres)", ",.0f"),
        ("carbon_g_per_settled_tx", "Carbon per settled tx (g CO2e)", ",.4f"),
        ("water_l_per_settled_tx", "Water per settled tx (litres)", ",.4f"),
        ("total_gas_native", "Sidechain gas (native token)", ",.4f"),
        ("breach_attempts", "Limit breach attempts", ",.0f"),
        ("breaches_blocked", "Breaches blocked without human approval", ",.0f"),
        ("decline_share_of_attempts", "Share of attempts declined by policy", ".4f"),
        ("median_utilisation", "Median cycle utilisation", ".4f"),
        ("cycle_default_rate", "Default rate per billing cycle, all", ".4f"),
        ("cycle_default_rate_agents", "Default rate per billing cycle, agents", ".4f"),
        ("any_missed_cycle_rate", "Share missing at least one cycle in the year", ".4f"),
        ("loss_rate_on_spend", "Loss rate on spend", ".4f"),
        ("agent_score_median", "Median agent credit score", ",.0f"),
        ("nxs_rlusd_pool_rlusd", "NXS/RLUSD pool liquidity (RLUSD)", ",.0f"),
        ("nexxen_xrp_pool_rlusd_equiv", "NEXXEN/XRP pool liquidity (RLUSD equivalent)", ",.0f"),
        ("required_wtr_kl_full", "WTR credits for water positive (kl)", ",.1f"),
        ("required_carbon_tonnes_full", "Carbon credits for carbon negative (t)", ",.3f"),
        ("offset_cost_full_usd", "Offset cost, full scenario (USD)", ",.2f"),
    ]
    for key, label, fmt in show:
        if key in h.index:
            lines.append(
                f"| {label} | {h.loc[key, 'p50']:{fmt}} | {h.loc[key, 'p5']:{fmt}} | {h.loc[key, 'p95']:{fmt}} |"
            )

    lines.append("\n## Quicknode plan mapping\n")
    plan_counts = pd.Series(res["plans"]).value_counts()
    lines.append("| Tier selected | Runs |")
    lines.append("| --- | --- |")
    for name, cnt in plan_counts.items():
        lines.append(f"| {name} | {cnt} |")
    lines.append(
        "\nTier choice is the cheapest published tier whose included credits cover the "
        "modelled monthly volume. Enterprise is custom priced and is not modelled.\n"
    )

    lines.append("\n## Offset scenarios\n")
    lines.append("| Scenario | Coverage | WTR procured (kl) | Carbon retired (t) | Water outstanding (l) | Carbon outstanding (kg) | Water positive | Carbon negative | Cost (USD) |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for name in ("none", "partial", "full"):
        o = res["offsets"][name]
        lines.append(
            f"| {name} | {o.coverage:.0%} | {o.procured_wtr_kl:,.1f} | {o.procured_carbon_tonnes:,.3f} | "
            f"{max(o.net_water_l, 0):,.0f} | {max(o.net_carbon_kg, 0):,.1f} | "
            f"{'yes' if o.water_positive else 'no'} | {'yes' if o.carbon_negative else 'no'} | {o.total_cost_usd:,.2f} |"
        )
    lines.append(f"\nStatus of every figure in this table: {BENEFIT_CLAIM_STATUS}.\n")

    # ---- Sensitivity ----
    led = float(h.loc["ledger_energy_kwh", "p50"]) if "ledger_energy_kwh" in h.index else 0.0
    comp = float(h.loc["compute_energy_kwh", "p50"]) if "compute_energy_kwh" in h.index else 0.0
    tot = led + comp
    lines.append("\n## Sensitivity: which input actually drives the answer\n")
    if tot > 0:
        lines.append(
            f"The ledger term is {led / tot:.1%} of modelled energy and the RPC compute term is "
            f"{comp / tot:.1%}. Both terms are linear in their driving constant, so the table below "
            "is exact rather than estimated.\n"
        )
        lines.append("| Change | Total energy (kWh) | Change vs p50 |")
        lines.append("| --- | --- | --- |")
        for label, new_led, new_comp in [
            ("baseline", led, comp),
            ("XRPL kWh/tx 10x lower", led / 10.0, comp),
            ("XRPL kWh/tx 10x higher", led * 10.0, comp),
            ("Quicknode Wh/credit 10x lower", led, comp / 10.0),
            ("Quicknode Wh/credit 10x higher", led, comp * 10.0),
        ]:
            nt = new_led + new_comp
            lines.append(f"| {label} | {nt:,.0f} | {nt / tot - 1:+.1%} |")
        lines.append(
            "\nThe headline footprint is therefore governed by XRPL_ENERGY_KWH_PER_TX, which is "
            "the one input flagged UNVERIFIED in the energy chain. Ripple publishes carbon "
            "neutrality claims but no per-transaction kWh figure, and learn.xrpl.org returned "
            "HTTP 403 when fetched. Treat the absolute energy, carbon and water totals as "
            "order-of-magnitude only until that number is sourced or measured.\n"
        )

    # ---- Risks ----
    lines.append("\n## Top risks surfaced by the simulation\n")
    risks = [
        (
            "The headline footprint rests on an unverified constant",
            "XRPL energy per transaction drives most of the modelled energy, carbon and water, "
            "and it is the one figure in the chain with no readable primary source. Every "
            "downstream offset volume and cost inherits that uncertainty.",
        ),
        (
            "Offset cost is immaterial, which is itself the risk",
            "At the EXAMPLE_INPUT credit prices the full offset scenario costs very little "
            "against card spend volume. That makes the water positive and carbon negative claim "
            "cheap to assert and correspondingly hard for a third party to take seriously "
            "without MRV evidence. The constraint is verification, not budget.",
        ),
        (
            "Declined transactions still cost money",
            "RPC load follows attempted work, so a blocked or breaching agent bills API credits "
            "with no settled volume to offset them. A misbehaving fleet raises Quicknode cost "
            "and the compute footprint while producing zero revenue.",
        ),
        (
            "The RPC provider is a single point of settlement failure",
            "During the modelled outage a share of payments fail to confirm while retries "
            "multiply API credits. Cost rises exactly when throughput falls, and defaults "
            "cluster into the following cycle close.",
        ),
        (
            "Collateral stress and defaults arrive together",
            "The collateral shock degrades repayment for thinly collateralised accounts, so "
            "losses concentrate in the cycle that closes inside the shock window rather than "
            "spreading evenly across the year.",
        ),
    ]
    for i, (title, body) in enumerate(risks, 1):
        lines.append(f"{i}. **{title}.** {body}\n")

    lines.append(
        "\n## Reproducing\n\n"
        "```\n"
        "python -m sim.run --quick      # fast smoke run\n"
        "python -m sim.run              # full default configuration\n"
        "python -m pytest tests/ -q     # unit tests\n"
        "```\n"
    )

    out.mkdir(parents=True, exist_ok=True)
    (out / "summary.md").write_text("\n".join(lines) + "\n")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="NXS / NEXXEN testnet simulation")
    p.add_argument("--participants", type=int, default=100_000)
    p.add_argument("--days", type=int, default=365)
    p.add_argument("--runs", type=int, default=100)
    p.add_argument("--agent-share", type=float, default=0.5)
    p.add_argument("--misbehaving-share", type=float, default=0.02)
    p.add_argument("--seed", type=int, default=20261027)
    p.add_argument("--out", type=Path, default=Path("results"))
    p.add_argument("--quick", action="store_true", help="small fast run for smoke testing")
    p.add_argument("--no-charts", action="store_true")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    a = parse_args(argv)
    cfg = SimConfig(
        n_participants=2_000 if a.quick else a.participants,
        days=60 if a.quick else a.days,
        runs=3 if a.quick else a.runs,
        agent_share=a.agent_share,
        misbehaving_share=a.misbehaving_share,
        seed=a.seed,
        events=EventConfig(),
    )
    print(
        f"Simulating {cfg.n_participants:,} participants over {cfg.days} days, "
        f"{cfg.runs} runs (agent share {cfg.agent_share:.0%})",
        flush=True,
    )
    res = monte_carlo(cfg)
    print(f"Monte Carlo done in {res['elapsed_s']:.1f}s", flush=True)

    write_csvs(res, a.out)
    write_summary(res, a.out)
    if not a.no_charts:
        write_charts(res, a.out)

    h = res["headline_stats"]
    print("\nHeadline p50:")
    for k in (
        "total_tx_settled",
        "total_spend_rlusd",
        "total_api_credits",
        "quicknode_annual_usd",
        "total_energy_kwh",
        "total_carbon_kg",
        "total_water_l",
        "decline_share_of_attempts",
        "median_utilisation",
        "cycle_default_rate_agents",
        "loss_rate_on_spend",
        "agent_score_median",
    ):
        if k in h.index:
            print(f"  {k:34s} {h.loc[k, 'p50']:,.4f}")
    print(f"\nWrote results to {a.out}/")
    print(json.dumps(counts_by_provenance(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
