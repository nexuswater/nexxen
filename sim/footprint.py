"""Footprint accounting: API credits, energy, carbon, water and offsets.

Boundary being measured:

ledger
    Energy attributed to XRP Ledger transactions using a per-transaction
    figure. This is the smaller term by a wide margin.
compute
    Energy attributed to RPC and indexing work served by Quicknode, derived
    from billed API credits and scaled by a data centre PUE.

Water is counted twice over, on purpose: on-site cooling water plus the
indirect water consumed generating the electricity. The indirect term
dominates by roughly 12.6x, so reporting on-site only would understate the
footprint by about 92 percent.

Every benefit number produced here is PROPOSED, pending independent MRV
verification. Nothing in this module verifies anything, and token voting
plays no part in recognising a benefit.
"""

from __future__ import annotations

from dataclasses import dataclass

from .constants import (
    BENEFIT_CLAIM_STATUS,
    CARBON_CREDIT_USD_PER_TONNE,
    CARBON_NEGATIVE_MULTIPLIER,
    DATACENTER_PUE,
    DATACENTER_WATER_INDIRECT_L_PER_KWH,
    DATACENTER_WATER_ONSITE_L_PER_KWH,
    GRID_CO2E_KG_PER_KWH,
    OFFSET_SCENARIOS,
    QUICKNODE_ADVANCED_API_MULTIPLIER,
    QUICKNODE_CREDITS_PER_EVM_CALL,
    QUICKNODE_PLANS,
    QUICKNODE_WATT_HOURS_PER_CREDIT,
    WATER_CREDIT_USD_PER_KL,
    WATER_POSITIVE_MULTIPLIER,
    XRPL_ENERGY_KWH_PER_TX,
)


def api_credits(standard_calls: float, advanced_calls: float) -> float:
    """Billed Quicknode API credits.

    Advanced calls are a subset of total calls, so the standard count is net of
    them and the advanced count is billed at the 2x multiplier.
    """
    net_standard = max(standard_calls - advanced_calls, 0.0)
    return QUICKNODE_CREDITS_PER_EVM_CALL * (
        net_standard + advanced_calls * QUICKNODE_ADVANCED_API_MULTIPLIER
    )


def compute_energy_kwh(credits: float) -> float:
    """Energy for RPC compute, including data centre overhead via PUE."""
    return credits * QUICKNODE_WATT_HOURS_PER_CREDIT / 1000.0 * DATACENTER_PUE


def ledger_energy_kwh(xrpl_tx: float) -> float:
    return xrpl_tx * XRPL_ENERGY_KWH_PER_TX


def carbon_kg(kwh: float) -> float:
    return kwh * GRID_CO2E_KG_PER_KWH


def water_litres(kwh: float) -> dict[str, float]:
    onsite = kwh * DATACENTER_WATER_ONSITE_L_PER_KWH
    indirect = kwh * DATACENTER_WATER_INDIRECT_L_PER_KWH
    return {"onsite_l": onsite, "indirect_l": indirect, "total_l": onsite + indirect}


@dataclass(frozen=True)
class PlanChoice:
    plan: str
    monthly_usd: float
    included_credits: float
    overage_credits: float
    overage_usd: float
    total_usd: float
    requests_per_second: float


def choose_plan(monthly_credits: float) -> PlanChoice:
    """Cheapest Quicknode tier for a monthly credit volume.

    Picks the cheapest tier whose included credits cover the volume. If the
    volume exceeds the largest published tier, uses that tier plus its overage
    rate. Enterprise is custom priced and so is not modelled.
    """
    for name, monthly, included, rps, overage_per_1m in QUICKNODE_PLANS:
        if monthly_credits <= included:
            return PlanChoice(
                plan=name,
                monthly_usd=monthly,
                included_credits=included,
                overage_credits=0.0,
                overage_usd=0.0,
                total_usd=monthly,
                requests_per_second=rps,
            )

    name, monthly, included, rps, overage_per_1m = QUICKNODE_PLANS[-1]
    over = monthly_credits - included
    overage_usd = over / 1_000_000.0 * overage_per_1m
    return PlanChoice(
        plan=f"{name} + overage",
        monthly_usd=monthly,
        included_credits=included,
        overage_credits=over,
        overage_usd=overage_usd,
        total_usd=monthly + overage_usd,
        requests_per_second=rps,
    )


@dataclass(frozen=True)
class OffsetRequirement:
    scenario: str
    coverage: float
    gross_carbon_kg: float
    gross_water_l: float
    required_carbon_tonnes: float
    required_wtr_kl: float
    procured_carbon_tonnes: float
    procured_wtr_kl: float
    net_carbon_kg: float
    net_water_l: float
    carbon_negative: bool
    water_positive: bool
    carbon_cost_usd: float
    water_cost_usd: float
    total_cost_usd: float
    claim_status: str


def offsets_required(gross_carbon_kg: float, gross_water_l: float, scenario: str) -> OffsetRequirement:
    """Offsets needed to reach carbon negative and water positive.

    Carbon negative means retiring more than was emitted, set by
    CARBON_NEGATIVE_MULTIPLIER. Water positive means replenishing more than was
    consumed, set by WATER_POSITIVE_MULTIPLIER. Both multipliers are policy
    choices, not measurements.

    Net figures are signed so that a positive net_carbon_kg means emissions
    remain outstanding, and a positive net_water_l means water remains
    outstanding. Reaching the goal drives each to zero or below.
    """
    if scenario not in OFFSET_SCENARIOS:
        raise ValueError(f"unknown scenario {scenario!r}; expected one of {sorted(OFFSET_SCENARIOS)}")
    coverage = OFFSET_SCENARIOS[scenario]

    required_carbon_tonnes = gross_carbon_kg / 1000.0 * CARBON_NEGATIVE_MULTIPLIER
    required_wtr_kl = gross_water_l / 1000.0 * WATER_POSITIVE_MULTIPLIER

    procured_carbon_tonnes = required_carbon_tonnes * coverage
    procured_wtr_kl = required_wtr_kl * coverage

    net_carbon_kg = gross_carbon_kg - procured_carbon_tonnes * 1000.0
    net_water_l = gross_water_l - procured_wtr_kl * 1000.0

    return OffsetRequirement(
        scenario=scenario,
        coverage=coverage,
        gross_carbon_kg=gross_carbon_kg,
        gross_water_l=gross_water_l,
        required_carbon_tonnes=required_carbon_tonnes,
        required_wtr_kl=required_wtr_kl,
        procured_carbon_tonnes=procured_carbon_tonnes,
        procured_wtr_kl=procured_wtr_kl,
        net_carbon_kg=net_carbon_kg,
        net_water_l=net_water_l,
        carbon_negative=net_carbon_kg <= 0.0,
        water_positive=net_water_l <= 0.0,
        carbon_cost_usd=procured_carbon_tonnes * CARBON_CREDIT_USD_PER_TONNE,
        water_cost_usd=procured_wtr_kl * WATER_CREDIT_USD_PER_KL,
        total_cost_usd=(
            procured_carbon_tonnes * CARBON_CREDIT_USD_PER_TONNE
            + procured_wtr_kl * WATER_CREDIT_USD_PER_KL
        ),
        claim_status=BENEFIT_CLAIM_STATUS,
    )
