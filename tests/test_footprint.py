"""Unit tests for API credit, energy, carbon and water math, and plan mapping."""

from __future__ import annotations

import pytest

from sim import constants as K
from sim import footprint as F


# --- API credits -----------------------------------------------------------


def test_standard_calls_cost_flat_rate():
    assert F.api_credits(100.0, 0.0) == pytest.approx(100.0 * K.QUICKNODE_CREDITS_PER_EVM_CALL)


def test_advanced_calls_are_billed_at_the_multiplier_and_not_double_counted():
    # 100 total calls of which 10 are advanced: 90 standard + 10 at 2x.
    got = F.api_credits(100.0, 10.0)
    expected = K.QUICKNODE_CREDITS_PER_EVM_CALL * (90.0 + 10.0 * K.QUICKNODE_ADVANCED_API_MULTIPLIER)
    assert got == pytest.approx(expected)
    # Strictly more than if all 100 were standard.
    assert got > F.api_credits(100.0, 0.0)


def test_advanced_cannot_exceed_total():
    assert F.api_credits(5.0, 50.0) == pytest.approx(
        K.QUICKNODE_CREDITS_PER_EVM_CALL * 50.0 * K.QUICKNODE_ADVANCED_API_MULTIPLIER
    )


def test_zero_calls_cost_nothing():
    assert F.api_credits(0.0, 0.0) == 0.0


# --- Energy, carbon, water -------------------------------------------------


def test_compute_energy_applies_pue():
    credits = 1_000_000.0
    raw_kwh = credits * K.QUICKNODE_WATT_HOURS_PER_CREDIT / 1000.0
    assert F.compute_energy_kwh(credits) == pytest.approx(raw_kwh * K.DATACENTER_PUE)
    assert F.compute_energy_kwh(credits) > raw_kwh


def test_ledger_energy_is_linear_in_transactions():
    assert F.ledger_energy_kwh(1000.0) == pytest.approx(1000.0 * K.XRPL_ENERGY_KWH_PER_TX)
    assert F.ledger_energy_kwh(0.0) == 0.0


def test_carbon_uses_the_sourced_grid_factor():
    assert F.carbon_kg(10.0) == pytest.approx(10.0 * K.GRID_CO2E_KG_PER_KWH)


def test_water_counts_onsite_and_indirect():
    w = F.water_litres(100.0)
    assert w["onsite_l"] == pytest.approx(100.0 * K.DATACENTER_WATER_ONSITE_L_PER_KWH)
    assert w["indirect_l"] == pytest.approx(100.0 * K.DATACENTER_WATER_INDIRECT_L_PER_KWH)
    assert w["total_l"] == pytest.approx(w["onsite_l"] + w["indirect_l"])


def test_indirect_water_dominates_onsite():
    """Reporting on-site water only would understate the footprint badly."""
    w = F.water_litres(1.0)
    assert w["indirect_l"] > 10 * w["onsite_l"]
    assert w["onsite_l"] / w["total_l"] < 0.1


# --- Quicknode plan mapping ------------------------------------------------


def test_free_tier_chosen_for_small_volume():
    p = F.choose_plan(1_000_000.0)
    assert p.plan == "Free"
    assert p.total_usd == 0.0
    assert p.overage_usd == 0.0


def test_exact_tier_boundary_stays_on_the_cheaper_tier():
    """10M credits is exactly the Free allowance, so it must not escalate."""
    p = F.choose_plan(10_000_000.0)
    assert p.plan == "Free"


def test_one_credit_over_boundary_escalates():
    p = F.choose_plan(10_000_000.0 + 1)
    assert p.plan == "Build"
    assert p.monthly_usd == pytest.approx(49.0)


def test_cheapest_covering_tier_is_selected():
    p = F.choose_plan(500_000_000.0)
    assert p.plan == "Scale"
    assert p.total_usd == pytest.approx(499.0)
    assert p.overage_credits == 0.0


def test_volume_above_largest_tier_uses_overage():
    largest = K.QUICKNODE_PLANS[-1]
    over_by = 1_000_000_000.0
    p = F.choose_plan(largest[2] + over_by)
    assert p.plan.endswith("+ overage")
    assert p.overage_credits == pytest.approx(over_by)
    assert p.overage_usd == pytest.approx(over_by / 1e6 * largest[4])
    assert p.total_usd == pytest.approx(largest[1] + p.overage_usd)


def test_plans_are_ordered_by_price_and_allowance():
    prices = [p[1] for p in K.QUICKNODE_PLANS]
    credits = [p[2] for p in K.QUICKNODE_PLANS]
    assert prices == sorted(prices)
    assert credits == sorted(credits)


# --- Provenance discipline -------------------------------------------------


def test_every_registered_constant_has_provenance_and_note():
    for name, c in K.REGISTRY.items():
        assert c.provenance in tuple(K.Provenance), name
        assert c.note.strip(), name
        assert c.unit.strip(), name


def test_sourced_constants_carry_url_and_year():
    for name, c in K.REGISTRY.items():
        if c.provenance is K.Provenance.SOURCED:
            assert c.source_url, f"{name} is SOURCED but has no URL"
            assert c.source_year, f"{name} is SOURCED but has no year"


def test_unverified_constants_carry_url_and_year_too():
    for name, c in K.REGISTRY.items():
        if c.provenance is K.Provenance.UNVERIFIED:
            assert c.source_url, f"{name} is UNVERIFIED but has no URL"
            assert c.source_year, f"{name} is UNVERIFIED but has no year"


def test_example_inputs_claim_no_source():
    """An EXAMPLE_INPUT must not look sourced, or the table would mislead."""
    for name, c in K.REGISTRY.items():
        if c.provenance is K.Provenance.EXAMPLE_INPUT:
            assert not c.source_url, f"{name} is EXAMPLE_INPUT but cites a URL"


def test_assumptions_table_is_complete():
    rows = K.assumptions_table()
    assert len(rows) == len(K.REGISTRY)
    assert sum(K.counts_by_provenance().values()) == len(K.REGISTRY)
