"""Tests for the spending controls and run determinism.

The central control claim is that an agent cannot exceed its limit without a
human approving that one exception. These tests hold that claim to account.
"""

from __future__ import annotations

import numpy as np
import pytest

from sim import ledger
from sim.agents import EventConfig, Population, SimConfig, build_population, event_factors
from sim.run import simulate_run

NO_EVENTS = {
    "collateral_mult": 1.0,
    "repay_penalty": 0.0,
    "rpc_retry_mult": 1.0,
    "settle_success": 1.0,
    "gas_mult": 1.0,
}


def _breaching_population(n: int = 500) -> Population:
    """Agents that always transact and whose spend always exceeds the cap."""
    ones = np.ones(n)
    return Population(
        is_agent=np.ones(n, dtype=bool),
        misbehaving=np.ones(n, dtype=bool),
        active_prob=ones,                    # always active
        tx_lambda=ones * 3.0,
        spend_mu=np.full(n, 5.0),            # exp(5) is about 148
        spend_sigma=np.full(n, 0.01),
        rpc_calls_per_tx=ones * 10.0,
        advanced_share=np.zeros(n),
        cycle_limit=np.full(n, 10_000.0),    # cycle limit is not the binding constraint
        per_tx_limit=np.full(n, 1.0),        # per-tx cap of 1 RLUSD is always breached
        collateral_ratio=ones,
        repay_prob=ones,
        claims_airdrop=np.zeros(n, dtype=bool),
    )


def test_unapproved_over_limit_spend_never_settles(monkeypatch):
    monkeypatch.setattr(ledger, "HUMAN_APPROVAL_GRANT_PROB", 0.0)
    pop = _breaching_population()
    rng = np.random.default_rng(1)
    d = ledger.step(pop, rng, NO_EVENTS, cycle_spend=np.zeros(pop.n))

    assert d.breach_attempts.sum() > 0, "the fixture should attempt breaches"
    assert d.approvals_granted.sum() == 0
    assert d.spend.sum() == 0.0, "unapproved over-limit spend must not settle"
    assert d.tx_settled.sum() == 0.0
    assert d.tx_blocked.sum() > 0


def test_approved_exception_does_settle(monkeypatch):
    monkeypatch.setattr(ledger, "HUMAN_APPROVAL_GRANT_PROB", 1.0)
    pop = _breaching_population()
    rng = np.random.default_rng(1)
    d = ledger.step(pop, rng, NO_EVENTS, cycle_spend=np.zeros(pop.n))

    assert d.approvals_granted.sum() == d.breach_attempts.sum()
    assert d.spend.sum() > 0.0


def test_cycle_limit_caps_spend_with_no_approval_path():
    """Once the cycle limit is reached the card declines, approval or not."""
    pop = _breaching_population(n=200)
    pop.per_tx_limit[:] = 1e9      # per-tx cap not binding
    pop.cycle_limit[:] = 100.0
    rng = np.random.default_rng(3)
    exhausted = np.full(pop.n, 100.0)   # cycle already fully used

    d = ledger.step(pop, rng, NO_EVENTS, cycle_spend=exhausted)
    assert d.spend.sum() == 0.0
    assert d.tx_settled.sum() == 0.0
    assert d.tx_blocked.sum() > 0


def test_spend_never_exceeds_remaining_cycle_headroom():
    pop = _breaching_population(n=1000)
    pop.per_tx_limit[:] = 1e9
    pop.cycle_limit[:] = 500.0
    rng = np.random.default_rng(5)
    used = np.full(pop.n, 450.0)        # 50 of headroom left

    d = ledger.step(pop, rng, NO_EVENTS, cycle_spend=used)
    assert np.all(d.spend <= 50.0 + 1e-9)


def test_settled_transactions_are_whole_numbers():
    """Counts and value must agree, so partial transactions are not allowed."""
    pop = _breaching_population(n=300)
    pop.per_tx_limit[:] = 1e9
    pop.cycle_limit[:] = 400.0
    rng = np.random.default_rng(11)
    d = ledger.step(pop, rng, NO_EVENTS, cycle_spend=np.full(pop.n, 350.0))
    assert np.all(d.tx_settled == np.floor(d.tx_settled))


def test_declined_attempts_still_cost_rpc_calls():
    """A blocked payment is not free: the reads still bill API credits."""
    monkeypatch_prob = 0.0
    pop = _breaching_population(n=100)
    rng = np.random.default_rng(2)
    import sim.ledger as L

    old = L.HUMAN_APPROVAL_GRANT_PROB
    try:
        L.HUMAN_APPROVAL_GRANT_PROB = monkeypatch_prob
        d = L.step(pop, rng, NO_EVENTS, cycle_spend=np.zeros(pop.n))
    finally:
        L.HUMAN_APPROVAL_GRANT_PROB = old

    assert d.spend.sum() == 0.0
    assert d.rpc_calls.sum() > 0.0


# --- Event behaviour -------------------------------------------------------


def test_event_factors_are_neutral_outside_event_windows():
    ev = EventConfig()
    f = event_factors(0, ev)
    assert f["collateral_mult"] == 1.0
    assert f["rpc_retry_mult"] == 1.0
    assert f["gas_mult"] == 1.0
    assert f["settle_success"] == 1.0


def test_each_event_window_activates_its_own_factor():
    ev = EventConfig()
    assert event_factors(ev.market_shock_day, ev)["collateral_mult"] < 1.0
    assert event_factors(ev.quicknode_outage_day, ev)["rpc_retry_mult"] > 1.0
    assert event_factors(ev.quicknode_outage_day, ev)["settle_success"] < 1.0
    assert event_factors(ev.gas_spike_day, ev)["gas_mult"] > 1.0


def test_gas_spike_raises_gas_cost():
    pop = _breaching_population(n=200)
    pop.per_tx_limit[:] = 1e9
    rng_a = np.random.default_rng(9)
    rng_b = np.random.default_rng(9)
    normal = ledger.step(pop, rng_a, NO_EVENTS, np.zeros(pop.n))
    spiked = ledger.step(pop, rng_b, {**NO_EVENTS, "gas_mult": 8.0}, np.zeros(pop.n))
    assert spiked.gas_native.sum() == pytest.approx(normal.gas_native.sum() * 8.0)


def test_outage_multiplies_rpc_calls():
    pop = _breaching_population(n=200)
    rng_a = np.random.default_rng(13)
    rng_b = np.random.default_rng(13)
    normal = ledger.step(pop, rng_a, NO_EVENTS, np.zeros(pop.n))
    outage = ledger.step(pop, rng_b, {**NO_EVENTS, "rpc_retry_mult": 2.5}, np.zeros(pop.n))
    assert outage.rpc_calls.sum() == pytest.approx(normal.rpc_calls.sum() * 2.5)


# --- Population and determinism -------------------------------------------


def test_agent_share_is_respected():
    cfg = SimConfig(n_participants=20_000, agent_share=0.5, seed=42)
    pop = build_population(cfg, np.random.default_rng(cfg.seed))
    assert 0.48 < pop.is_agent.mean() < 0.52


def test_misbehaving_share_applies_to_agents_only():
    cfg = SimConfig(n_participants=50_000, agent_share=0.5, misbehaving_share=0.02, seed=42)
    pop = build_population(cfg, np.random.default_rng(cfg.seed))
    assert not pop.misbehaving[~pop.is_agent].any(), "humans must never carry the misbehaving flag"
    share = pop.misbehaving[pop.is_agent].mean()
    assert 0.015 < share < 0.025


def test_run_is_reproducible_for_a_fixed_seed():
    cfg = SimConfig(n_participants=1_500, days=40, runs=1, seed=777)
    a = simulate_run(cfg, seed=cfg.seed)
    b = simulate_run(cfg, seed=cfg.seed)
    assert a.headline == b.headline


def test_different_seeds_give_different_results():
    cfg = SimConfig(n_participants=1_500, days=40, runs=1, seed=777)
    a = simulate_run(cfg, seed=1)
    b = simulate_run(cfg, seed=2)
    assert a.headline["total_spend_rlusd"] != b.headline["total_spend_rlusd"]


def test_run_produces_internally_consistent_totals():
    cfg = SimConfig(n_participants=3_000, days=90, runs=1, seed=5)
    r = simulate_run(cfg, seed=5)
    h = r.headline

    assert h["agents"] + h["humans"] == h["participants"]
    assert h["total_spend_rlusd"] > 0
    assert h["total_energy_kwh"] == pytest.approx(
        h["ledger_energy_kwh"] + h["compute_energy_kwh"], rel=1e-9
    )
    assert h["breaches_blocked"] == pytest.approx(h["breach_attempts"] - h["approvals_granted"])
    assert 0.0 <= h["cycle_default_rate"] <= 1.0
    assert 300.0 <= h["agent_score_median"] <= 850.0
    assert r.daily["carbon_kg"].sum() == pytest.approx(h["total_carbon_kg"], rel=1e-9)


def test_limits_are_calibrated_so_declines_are_a_minority():
    """Regression guard against a mis-specified cycle limit.

    With the agent limit at 250 RLUSD against a modelled appetite near 594 per
    cycle, agents exhausted the cap mid-cycle: declines exceeded settlements and
    utilisation pegged at 100 percent, so the cycle cap rather than the risk
    controls drove every downstream number. If this fails, the credit limits no
    longer match the behaviour model and the score distribution is not
    meaningful.
    """
    cfg = SimConfig(n_participants=5_000, days=180, runs=1, seed=21)
    h = simulate_run(cfg, seed=21).headline
    assert h["decline_share_of_attempts"] < 0.5, "most attempts should settle"
    assert 0.2 < h["median_utilisation"] < 0.9, "utilisation should be informative, not pegged"


def test_collateral_shock_actually_raises_defaults():
    """Regression guard: stress must affect the cycle it falls inside.

    Defaults are only realised at cycle close, so reading the shock factor on
    the close day alone meant a shock that did not overlap a boundary had no
    effect whatsoever. With closes on days 29, 59, 89, 119, 149 and a shock on
    days 120 to 140, every stress event in the default config missed, and the
    default chart showed twelve identical spikes.
    """
    base_ev = EventConfig(market_shock_day=10_000, quicknode_outage_day=10_000, gas_spike_day=10_000)
    # A shock placed strictly between two cycle closes: closes at 29 and 59.
    shock_ev = EventConfig(
        market_shock_day=35, market_shock_days=20,
        quicknode_outage_day=10_000, gas_spike_day=10_000,
    )
    calm = SimConfig(n_participants=6_000, days=60, runs=1, seed=99, events=base_ev)
    shocked = SimConfig(n_participants=6_000, days=60, runs=1, seed=99, events=shock_ev)

    calm_defaults = simulate_run(calm, seed=99).daily["defaults"].sum()
    shock_defaults = simulate_run(shocked, seed=99).daily["defaults"].sum()
    assert shock_defaults > calm_defaults, "a shock between cycle closes must still raise defaults"


def test_stress_exposure_scales_with_shock_length():
    short_ev = EventConfig(market_shock_day=35, market_shock_days=5,
                           quicknode_outage_day=10_000, gas_spike_day=10_000)
    long_ev = EventConfig(market_shock_day=31, market_shock_days=28,
                          quicknode_outage_day=10_000, gas_spike_day=10_000)
    short = simulate_run(SimConfig(n_participants=6_000, days=60, runs=1, seed=5, events=short_ev), seed=5)
    long = simulate_run(SimConfig(n_participants=6_000, days=60, runs=1, seed=5, events=long_ev), seed=5)
    assert long.daily["defaults"].sum() >= short.daily["defaults"].sum()


def test_default_rate_names_are_not_conflated():
    """Per-cycle and cumulative measures must not be reported as the same thing."""
    cfg = SimConfig(n_participants=4_000, days=365, runs=1, seed=31)
    h = simulate_run(cfg, seed=31).headline
    # Over 12 cycles, "missed at least once" is necessarily much larger than the
    # per-cycle rate. Reporting the former as a default rate overstates risk.
    assert h["any_missed_cycle_rate"] > h["cycle_default_rate"]
    assert 0.0 <= h["cycle_default_rate"] <= 1.0
    assert 0.0 <= h["loss_rate_on_spend"] <= 1.0


def test_ledger_energy_dominates_under_current_constants():
    """Records a finding, not a preference.

    With XRPL_ENERGY_KWH_PER_TX at 0.0079 the ledger term is roughly 28x the
    RPC compute term per settled transaction, so the headline footprint is
    governed by the single least reliable input in the model. That constant is
    UNVERIFIED: Ripple publishes no per-transaction kWh figure and
    learn.xrpl.org returned HTTP 403. If this test ever flips, the cause is
    almost certainly that someone changed that constant, and the summary's
    sensitivity section needs regenerating.
    """
    cfg = SimConfig(n_participants=3_000, days=60, runs=1, seed=8)
    r = simulate_run(cfg, seed=8)
    ledger_kwh = r.headline["ledger_energy_kwh"]
    compute_kwh = r.headline["compute_energy_kwh"]
    assert ledger_kwh > compute_kwh
    assert ledger_kwh / compute_kwh > 2.0


def test_footprint_split_is_sensitive_to_the_unverified_xrpl_constant():
    """Zeroing the UNVERIFIED ledger constant moves compute into the majority."""
    import sim.footprint as FP
    from sim import constants as KC

    cfg = SimConfig(n_participants=2_000, days=40, runs=1, seed=4)
    baseline = simulate_run(cfg, seed=4)
    assert baseline.headline["ledger_energy_kwh"] > baseline.headline["compute_energy_kwh"]

    old = KC.XRPL_ENERGY_KWH_PER_TX
    try:
        KC.XRPL_ENERGY_KWH_PER_TX = 0.0
        FP.XRPL_ENERGY_KWH_PER_TX = 0.0
        stressed = simulate_run(cfg, seed=4)
    finally:
        KC.XRPL_ENERGY_KWH_PER_TX = old
        FP.XRPL_ENERGY_KWH_PER_TX = old

    assert stressed.headline["ledger_energy_kwh"] == 0.0
    assert stressed.headline["compute_energy_kwh"] > 0.0
    assert stressed.headline["total_energy_kwh"] < baseline.headline["total_energy_kwh"]
