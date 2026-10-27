"""Unit tests for the offset math and the claim language guards."""

from __future__ import annotations

import pytest

from sim import constants as K
from sim import footprint as F

GROSS_CARBON_KG = 1_000.0
GROSS_WATER_L = 500_000.0


def _req(scenario: str) -> F.OffsetRequirement:
    return F.offsets_required(GROSS_CARBON_KG, GROSS_WATER_L, scenario)


def test_required_volumes_apply_the_policy_multipliers():
    r = _req("full")
    assert r.required_carbon_tonnes == pytest.approx(
        GROSS_CARBON_KG / 1000.0 * K.CARBON_NEGATIVE_MULTIPLIER
    )
    assert r.required_wtr_kl == pytest.approx(
        GROSS_WATER_L / 1000.0 * K.WATER_POSITIVE_MULTIPLIER
    )


def test_full_scenario_achieves_both_goals():
    r = _req("full")
    assert r.coverage == 1.0
    assert r.carbon_negative is True
    assert r.water_positive is True
    # Strictly beyond break-even because both multipliers exceed 1.0.
    assert r.net_carbon_kg < 0
    assert r.net_water_l < 0


def test_no_offsets_achieves_neither_goal():
    r = _req("none")
    assert r.coverage == 0.0
    assert r.procured_carbon_tonnes == 0.0
    assert r.procured_wtr_kl == 0.0
    assert r.carbon_negative is False
    assert r.water_positive is False
    assert r.net_carbon_kg == pytest.approx(GROSS_CARBON_KG)
    assert r.net_water_l == pytest.approx(GROSS_WATER_L)
    assert r.total_cost_usd == 0.0


def test_partial_scenario_procures_half_the_requirement():
    full, part = _req("full"), _req("partial")
    assert part.coverage == 0.5
    assert part.procured_carbon_tonnes == pytest.approx(full.procured_carbon_tonnes / 2)
    assert part.procured_wtr_kl == pytest.approx(full.procured_wtr_kl / 2)


def test_partial_scenario_leaves_a_shortfall_with_these_multipliers():
    """At 50 percent coverage and a 1.1x carbon multiplier, 45 percent remains."""
    r = _req("partial")
    assert r.carbon_negative is False
    assert r.water_positive is False
    assert r.net_carbon_kg == pytest.approx(GROSS_CARBON_KG * (1 - 0.5 * K.CARBON_NEGATIVE_MULTIPLIER))
    assert r.net_water_l == pytest.approx(GROSS_WATER_L * (1 - 0.5 * K.WATER_POSITIVE_MULTIPLIER))


def test_cost_scales_linearly_with_coverage():
    full, part, none = _req("full"), _req("partial"), _req("none")
    assert part.total_cost_usd == pytest.approx(full.total_cost_usd / 2)
    assert none.total_cost_usd == 0.0
    assert full.carbon_cost_usd == pytest.approx(
        full.procured_carbon_tonnes * K.CARBON_CREDIT_USD_PER_TONNE
    )
    assert full.water_cost_usd == pytest.approx(full.procured_wtr_kl * K.WATER_CREDIT_USD_PER_KL)
    assert full.total_cost_usd == pytest.approx(full.carbon_cost_usd + full.water_cost_usd)


def test_zero_footprint_needs_no_offsets():
    r = F.offsets_required(0.0, 0.0, "full")
    assert r.required_carbon_tonnes == 0.0
    assert r.required_wtr_kl == 0.0
    assert r.total_cost_usd == 0.0
    assert r.carbon_negative is True
    assert r.water_positive is True


def test_unknown_scenario_is_rejected():
    with pytest.raises(ValueError, match="unknown scenario"):
        F.offsets_required(1.0, 1.0, "mostly")


def test_exactly_the_three_required_scenarios_exist():
    assert set(K.OFFSET_SCENARIOS) == {"none", "partial", "full"}


def test_multipliers_exceed_one_so_goals_mean_more_than_break_even():
    assert K.WATER_POSITIVE_MULTIPLIER > 1.0
    assert K.CARBON_NEGATIVE_MULTIPLIER > 1.0


# --- Claim language guards -------------------------------------------------


def test_every_offset_result_carries_the_pending_mrv_status():
    for scenario in K.OFFSET_SCENARIOS:
        r = F.offsets_required(10.0, 10.0, scenario)
        assert r.claim_status == K.BENEFIT_CLAIM_STATUS
        assert "pending independent MRV verification" in r.claim_status


def test_benefits_are_never_stated_as_verified():
    assert "proposed" in K.BENEFIT_CLAIM_STATUS.lower()
    for word in ("verified benefit", "guaranteed", "certified"):
        assert word not in K.BENEFIT_CLAIM_STATUS.lower()


def test_token_voting_never_approves_benefits():
    rule = K.BENEFIT_APPROVAL_RULE.lower()
    assert "token voting never approves benefits" in rule
    assert "signal" in rule


def test_scope_is_testnet_only():
    assert "testnet" in K.NETWORK_SCOPE.lower()
    assert "mainnet" in K.NETWORK_SCOPE.lower()


def test_no_em_dashes_in_any_constant_text():
    """The brief forbids em-dashes in output text, and notes reach summary.md."""
    for name, c in K.REGISTRY.items():
        assert "—" not in c.note, f"em-dash in note for {name}"
        assert "–" not in c.note, f"en-dash in note for {name}"
    for text in (K.BENEFIT_CLAIM_STATUS, K.BENEFIT_APPROVAL_RULE, K.NETWORK_SCOPE):
        assert "—" not in text
        assert "–" not in text
