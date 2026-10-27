"""Daily ledger mechanics: transactions, limit enforcement, fees and gas.

Simplification that matters for reading the results: each participant-day draws
one representative per-transaction amount and repeats it for that day's
transaction count. This keeps the whole model vectorized over 100,000
participants while leaving the per-transaction cap meaningful, which is the
control being tested. It does compress within-day amount variance, so
within-day tail risk is understated. Across-participant and across-day
variance are both preserved.

Control model, enforced here rather than described in prose:
  - A transaction above the per-transaction cap does not settle unless a human
    approves that one exception.
  - Once the cycle limit is exhausted the card declines. No approval path
    raises the cycle limit inside this model.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .agents import (
    HUMAN_APPROVAL_GRANT_PROB,
    MISBEHAVING_BREACH_ATTEMPT_PROB,
    Population,
)
from .constants import (
    DROPS_PER_XRP,
    EVM_GAS_PER_CARD_TX,
    EVM_GAS_PRICE_GWEI,
    XRPL_BASE_FEE_DROPS,
)

GWEI_TO_NATIVE = 1e-9


@dataclass
class DayLedger:
    """Per-participant outcomes for one simulated day."""

    tx_settled: np.ndarray        # settled transaction count
    tx_blocked: np.ndarray        # declined by policy (limit, no approval)
    spend: np.ndarray             # settled RLUSD spend
    rpc_calls: np.ndarray         # RPC calls issued, including outage retries
    advanced_calls: np.ndarray    # subset of rpc_calls billed at the 2x multiplier
    breach_attempts: np.ndarray   # attempts above the per-transaction cap
    approvals_granted: np.ndarray # human-approved exceptions
    xrpl_tx: np.ndarray           # transactions hitting the XRP Ledger
    evm_tx: np.ndarray            # voucher redemptions on the EVM sidechain
    xrp_fees: np.ndarray          # XRP spent on ledger fees
    gas_native: np.ndarray        # sidechain gas cost in native token


def step(
    pop: Population,
    rng: np.random.Generator,
    factors: dict[str, float],
    cycle_spend: np.ndarray,
) -> DayLedger:
    """Simulate one day for the whole population.

    cycle_spend is the RLUSD already spent in the current billing cycle and is
    read, not mutated. The caller owns cycle state.
    """
    n = pop.n

    active = rng.random(n) < pop.active_prob
    tx_attempted = np.where(active, rng.poisson(pop.tx_lambda), 0).astype(np.float64)

    # Representative per-transaction amount for this participant-day.
    amount = rng.lognormal(mean=pop.spend_mu, sigma=pop.spend_sigma)

    # Misbehaving agents sometimes attempt an amount above their per-transaction cap.
    breach_roll = rng.random(n) < MISBEHAVING_BREACH_ATTEMPT_PROB
    attempt_breach = pop.misbehaving & active & breach_roll & (tx_attempted > 0)
    # Inflate the attempted amount to 1.5x to 4x the cap.
    breach_mult = rng.uniform(1.5, 4.0, size=n)
    amount = np.where(attempt_breach, pop.per_tx_limit * breach_mult, amount)

    over_cap = amount > pop.per_tx_limit
    needs_approval = over_cap & (tx_attempted > 0)
    breach_attempts = np.where(needs_approval, 1.0, 0.0)

    # A human must approve the single exception. Unapproved attempts never settle.
    approved = needs_approval & (rng.random(n) < HUMAN_APPROVAL_GRANT_PROB)
    approvals_granted = np.where(approved, 1.0, 0.0)

    # Transactions that are over the cap and unapproved are blocked outright.
    blocked_by_cap = np.where(needs_approval & ~approved, tx_attempted, 0.0)
    allowed_tx = tx_attempted - blocked_by_cap

    # Cycle limit: spend is clipped to the remaining headroom and the overflow declines.
    headroom = np.maximum(pop.cycle_limit - cycle_spend, 0.0)
    desired_spend = allowed_tx * amount
    settled_spend = np.minimum(desired_spend, headroom)

    with np.errstate(divide="ignore", invalid="ignore"):
        settle_ratio = np.where(desired_spend > 0, settled_spend / desired_spend, 0.0)
    tx_settled = np.floor(allowed_tx * settle_ratio)
    blocked_by_cycle = allowed_tx - tx_settled
    # Recompute spend from whole settled transactions so counts and value agree.
    settled_spend = tx_settled * amount

    # A Quicknode outage prevents some settlements from confirming.
    if factors["settle_success"] < 1.0:
        confirmed = rng.random(n) < factors["settle_success"]
        failed_tx = np.where(confirmed, 0.0, tx_settled)
        tx_settled = tx_settled - failed_tx
        settled_spend = tx_settled * amount
        blocked_by_cycle = blocked_by_cycle + failed_tx

    tx_blocked = blocked_by_cap + blocked_by_cycle

    # RPC load follows attempted work, not just settled work: a declined attempt
    # still costs reads. Retries during an outage multiply the call count.
    rpc_calls = tx_attempted * pop.rpc_calls_per_tx * factors["rpc_retry_mult"]
    advanced_calls = rpc_calls * pop.advanced_share

    # Ledger footprint. Card spend settles through an AP4M voucher redeemed on
    # the EVM sidechain; the XRPL leg carries payment and trustline activity.
    xrpl_tx = tx_settled
    evm_tx = tx_settled
    xrp_fees = xrpl_tx * (XRPL_BASE_FEE_DROPS / DROPS_PER_XRP)
    gas_native = evm_tx * EVM_GAS_PER_CARD_TX * EVM_GAS_PRICE_GWEI * GWEI_TO_NATIVE * factors["gas_mult"]

    return DayLedger(
        tx_settled=tx_settled,
        tx_blocked=tx_blocked,
        spend=settled_spend,
        rpc_calls=rpc_calls,
        advanced_calls=advanced_calls,
        breach_attempts=breach_attempts,
        approvals_granted=approvals_granted,
        xrpl_tx=xrpl_tx,
        evm_tx=evm_tx,
        xrp_fees=xrp_fees,
        gas_native=gas_native,
    )


def pool_liquidity_need(
    daily_spend_p95: float,
    settlement_lag_days: float = 2.0,
    buffer_mult: float = 1.5,
) -> dict[str, float]:
    """Liquidity needed to clear settlement without touching the credit line.

    Sized as peak daily flow times the settlement lag times a safety buffer.
    All three inputs are EXAMPLE_INPUT policy choices, not measurements.
    """
    base = daily_spend_p95 * settlement_lag_days
    return {
        "nxs_rlusd_pool_rlusd": base * buffer_mult,
        "nexxen_xrp_pool_rlusd_equiv": base * buffer_mult * 0.5,
        "settlement_lag_days": settlement_lag_days,
        "buffer_mult": buffer_mult,
    }
