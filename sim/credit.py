"""Agent credit score on a 300 to 850 scale.

Five components, each normalised to 0..1 and then weighted:

repayment
    Share of billing cycles repaid on time. Heaviest weight.
utilisation
    Spend against the cycle limit. Lower is better, matching consumer scoring
    convention where a maxed line is a risk signal.
collateral
    RLUSD collateral held against the limit, relative to a target ratio.
compute efficiency
    Quicknode cost and carbon per useful (settled) transaction. An agent that
    burns 400 RPC calls to settle one payment is a worse credit than one that
    settles cleanly, because its unit economics are worse and it is more
    fragile to an RPC outage.
anomaly
    Attempted limit breaches and fraud flags. Pure penalty.

Thin-file handling: a participant with no observed billing cycle gets
THIN_FILE_SCORE rather than a computed score. Scoring an agent with no history
as either excellent or terrible would both be wrong.

All weights, targets and references are EXAMPLE_INPUT policy choices.
"""

from __future__ import annotations

import numpy as np

from .constants import Constant, Provenance, define

SCORE_MIN = define(
    "CREDIT_SCORE_MIN",
    Constant(
        value=300.0,
        unit="score",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Floor of the score range, chosen to mirror familiar consumer scales.",
    ),
)

SCORE_MAX = define(
    "CREDIT_SCORE_MAX",
    Constant(
        value=850.0,
        unit="score",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Ceiling of the score range.",
    ),
)

THIN_FILE_SCORE = define(
    "CREDIT_THIN_FILE_SCORE",
    Constant(
        value=600.0,
        unit="score",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Score assigned when no billing cycle has been observed yet.",
    ),
)

W_REPAYMENT = define(
    "CREDIT_W_REPAYMENT",
    Constant(value=0.35, unit="weight", provenance=Provenance.EXAMPLE_INPUT,
             note="Weight on on-time repayment share."),
)
W_UTILISATION = define(
    "CREDIT_W_UTILISATION",
    Constant(value=0.20, unit="weight", provenance=Provenance.EXAMPLE_INPUT,
             note="Weight on spend against cycle limit."),
)
W_COLLATERAL = define(
    "CREDIT_W_COLLATERAL",
    Constant(value=0.15, unit="weight", provenance=Provenance.EXAMPLE_INPUT,
             note="Weight on RLUSD collateral ratio."),
)
W_COMPUTE = define(
    "CREDIT_W_COMPUTE",
    Constant(value=0.15, unit="weight", provenance=Provenance.EXAMPLE_INPUT,
             note="Weight on compute efficiency, meaning Quicknode cost and carbon per settled transaction."),
)
W_ANOMALY = define(
    "CREDIT_W_ANOMALY",
    Constant(value=0.15, unit="weight", provenance=Provenance.EXAMPLE_INPUT,
             note="Weight on absence of anomaly and breach flags."),
)

COLLATERAL_TARGET_RATIO = define(
    "CREDIT_COLLATERAL_TARGET_RATIO",
    Constant(value=1.5, unit="ratio", provenance=Provenance.EXAMPLE_INPUT,
             note="Collateral ratio scoring full marks. Above this adds nothing further."),
)

REF_USD_PER_SETTLED_TX = define(
    "CREDIT_REF_USD_PER_SETTLED_TX",
    Constant(value=0.004, unit="USD/transaction", provenance=Provenance.EXAMPLE_INPUT,
             note="Quicknode cost per settled transaction scoring zero marks. Costs at or above this are maximally penalised."),
)

REF_CARBON_G_PER_SETTLED_TX = define(
    "CREDIT_REF_CARBON_G_PER_SETTLED_TX",
    Constant(value=2.0, unit="g CO2e/transaction", provenance=Provenance.EXAMPLE_INPUT,
             note="Carbon per settled transaction scoring zero marks."),
)

REF_BREACH_ATTEMPTS = define(
    "CREDIT_REF_BREACH_ATTEMPTS",
    Constant(value=12.0, unit="attempts", provenance=Provenance.EXAMPLE_INPUT,
             note="Breach attempts over the window that drive the anomaly component to zero."),
)

WEIGHT_SUM = W_REPAYMENT + W_UTILISATION + W_COLLATERAL + W_COMPUTE + W_ANOMALY


def _unit(x: np.ndarray) -> np.ndarray:
    return np.clip(x, 0.0, 1.0)


def score(
    *,
    cycles_observed: np.ndarray,
    cycles_on_time: np.ndarray,
    spend: np.ndarray,
    cycle_limit: np.ndarray,
    collateral_ratio: np.ndarray,
    quicknode_usd: np.ndarray,
    carbon_g: np.ndarray,
    settled_tx: np.ndarray,
    breach_attempts: np.ndarray,
) -> np.ndarray:
    """Vectorized 300..850 score. All inputs are per-participant arrays."""
    cycles_observed = np.asarray(cycles_observed, dtype=np.float64)
    settled = np.asarray(settled_tx, dtype=np.float64)

    # repayment
    with np.errstate(divide="ignore", invalid="ignore"):
        repayment = np.where(cycles_observed > 0, cycles_on_time / cycles_observed, 0.0)
    repayment = _unit(repayment)

    # utilisation: lower is better
    with np.errstate(divide="ignore", invalid="ignore"):
        util = np.where(cycle_limit > 0, spend / cycle_limit, 0.0)
    utilisation = 1.0 - _unit(util)

    # collateral
    collateral = _unit(collateral_ratio / COLLATERAL_TARGET_RATIO)

    # compute efficiency: average of cost and carbon efficiency per settled tx.
    # An agent that settles nothing has no efficiency signal, so it scores zero
    # on this component rather than dividing by zero.
    with np.errstate(divide="ignore", invalid="ignore"):
        usd_per_tx = np.where(settled > 0, quicknode_usd / settled, np.inf)
        carbon_per_tx = np.where(settled > 0, carbon_g / settled, np.inf)
    cost_eff = 1.0 - _unit(usd_per_tx / REF_USD_PER_SETTLED_TX)
    carbon_eff = 1.0 - _unit(carbon_per_tx / REF_CARBON_G_PER_SETTLED_TX)
    cost_eff = np.where(np.isfinite(usd_per_tx), cost_eff, 0.0)
    carbon_eff = np.where(np.isfinite(carbon_per_tx), carbon_eff, 0.0)
    compute = 0.5 * (cost_eff + carbon_eff)

    # anomaly: pure penalty
    anomaly = 1.0 - _unit(np.asarray(breach_attempts, dtype=np.float64) / REF_BREACH_ATTEMPTS)

    weighted = (
        W_REPAYMENT * repayment
        + W_UTILISATION * utilisation
        + W_COLLATERAL * collateral
        + W_COMPUTE * compute
        + W_ANOMALY * anomaly
    ) / WEIGHT_SUM

    out = SCORE_MIN + (SCORE_MAX - SCORE_MIN) * _unit(weighted)
    return np.where(cycles_observed > 0, out, THIN_FILE_SCORE)


def band(scores: np.ndarray) -> np.ndarray:
    """Map scores to risk bands for reporting."""
    edges = [580.0, 670.0, 740.0, 800.0]
    names = np.array(["poor", "fair", "good", "very good", "excellent"])
    idx = np.digitize(np.asarray(scores, dtype=np.float64), edges)
    return names[idx]
