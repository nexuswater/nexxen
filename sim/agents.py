"""Participant population and daily behaviour.

Two participant classes share one card product:

humans
    Lower transaction frequency, lognormal spend, claim airdrops, repay with a
    per-participant propensity. Humans hold the approval authority: an agent
    cannot exceed its limit without a human approving the exception.
agents
    Higher transaction frequency and far heavier RPC usage. Budget capped. A
    configurable share misbehave so the risk controls can be tested.

Every behavioural parameter here is an EXAMPLE_INPUT. None of it is measured
from a real population. The values exist so the model can run and so the
sensitivity of the outputs to behaviour can be explored.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict

import numpy as np

from .constants import Constant, Provenance, define

# ---------------------------------------------------------------------------
# Behavioural defaults, all EXAMPLE_INPUT
# ---------------------------------------------------------------------------

HUMAN_DAILY_ACTIVE_PROB = define(
    "HUMAN_DAILY_ACTIVE_PROB",
    Constant(
        value=0.18,
        unit="probability/day",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Mean probability a human participant transacts on a given day.",
    ),
)

AGENT_DAILY_ACTIVE_PROB = define(
    "AGENT_DAILY_ACTIVE_PROB",
    Constant(
        value=0.72,
        unit="probability/day",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Mean probability an AI agent transacts on a given day. Agents are far more active.",
    ),
)

HUMAN_SPEND_LOGNORM_MU = define(
    "HUMAN_SPEND_LOGNORM_MU",
    Constant(
        value=3.1,
        unit="ln(RLUSD)",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Lognormal mu for human per-transaction spend. exp(3.1) is about 22 RLUSD median.",
    ),
)

HUMAN_SPEND_LOGNORM_SIGMA = define(
    "HUMAN_SPEND_LOGNORM_SIGMA",
    Constant(
        value=1.05,
        unit="ln(RLUSD)",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Lognormal sigma for human per-transaction spend. Produces a long right tail.",
    ),
)

AGENT_SPEND_LOGNORM_MU = define(
    "AGENT_SPEND_LOGNORM_MU",
    Constant(
        value=0.9,
        unit="ln(RLUSD)",
        provenance=Provenance.EXAMPLE_INPUT,
        note=(
            "Lognormal mu for agent per-transaction spend. exp(0.9) is about 2.5 RLUSD: "
            "agents make many small machine payments rather than few large ones."
        ),
    ),
)

AGENT_SPEND_LOGNORM_SIGMA = define(
    "AGENT_SPEND_LOGNORM_SIGMA",
    Constant(
        value=0.8,
        unit="ln(RLUSD)",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Lognormal sigma for agent per-transaction spend.",
    ),
)

HUMAN_TX_PER_ACTIVE_DAY = define(
    "HUMAN_TX_PER_ACTIVE_DAY",
    Constant(
        value=1.7,
        unit="transactions/active day",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Poisson mean transactions for an active human.",
    ),
)

AGENT_TX_PER_ACTIVE_DAY = define(
    "AGENT_TX_PER_ACTIVE_DAY",
    Constant(
        value=11.0,
        unit="transactions/active day",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Poisson mean transactions for an active agent.",
    ),
)

HUMAN_RPC_CALLS_PER_TX = define(
    "HUMAN_RPC_CALLS_PER_TX",
    Constant(
        value=6.0,
        unit="RPC calls/transaction",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Balance reads, fee lookup, submission and receipt polling for a human-driven payment.",
    ),
)

AGENT_RPC_CALLS_PER_TX = define(
    "AGENT_RPC_CALLS_PER_TX",
    Constant(
        value=28.0,
        unit="RPC calls/transaction",
        provenance=Provenance.EXAMPLE_INPUT,
        note=(
            "Agents poll far more: channel state, voucher nonce, redemption receipts, "
            "retries. This is the dominant driver of Quicknode cost per agent."
        ),
    ),
)

AGENT_ADVANCED_API_SHARE = define(
    "AGENT_ADVANCED_API_SHARE",
    Constant(
        value=0.08,
        unit="fraction of calls",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Share of agent RPC calls that hit Advanced APIs and so cost a 2x credit multiplier.",
    ),
)

MISBEHAVING_AGENT_SHARE = define(
    "MISBEHAVING_AGENT_SHARE",
    Constant(
        value=0.02,
        unit="fraction of agents",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Share of agents that attempt limit breaches and generate anomaly flags.",
    ),
)

MISBEHAVING_BREACH_ATTEMPT_PROB = define(
    "MISBEHAVING_BREACH_ATTEMPT_PROB",
    Constant(
        value=0.22,
        unit="probability/active day",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Probability a misbehaving agent attempts to exceed its per-transaction limit.",
    ),
)

HUMAN_APPROVAL_GRANT_PROB = define(
    "HUMAN_APPROVAL_GRANT_PROB",
    Constant(
        value=0.35,
        unit="probability",
        provenance=Provenance.EXAMPLE_INPUT,
        note=(
            "Probability a human approves a requested over-limit exception. Humans keep "
            "approval authority; an unapproved breach never settles."
        ),
    ),
)

BASE_REPAY_PROB = define(
    "BASE_REPAY_PROB",
    Constant(
        value=0.965,
        unit="probability/cycle",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Baseline probability a participant repays a billing cycle on time.",
    ),
)

AGENT_CREDIT_LIMIT_RLUSD = define(
    "AGENT_CREDIT_LIMIT_RLUSD",
    Constant(
        value=1_000.0,
        unit="RLUSD",
        provenance=Provenance.EXAMPLE_INPUT,
        note=(
            "Default agent cycle credit limit before human-approved exceptions. Sized "
            "against modelled appetite rather than picked freely: an active agent spends "
            "roughly 0.72 * 11 * exp(0.9) which is about 20 RLUSD per day, so about 594 "
            "RLUSD per 30 day cycle. At 1,000 RLUSD median utilisation lands near 60 "
            "percent. An earlier value of 250 left agents capped out mid-cycle, which made "
            "the cycle cap rather than the risk controls dominate every downstream result: "
            "declines exceeded settlements and utilisation pegged at 100 percent, flattening "
            "the credit score distribution."
        ),
    ),
)

HUMAN_CREDIT_LIMIT_RLUSD = define(
    "HUMAN_CREDIT_LIMIT_RLUSD",
    Constant(
        value=2_000.0,
        unit="RLUSD",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Default human cycle credit limit.",
    ),
)

PER_TX_LIMIT_FRACTION = define(
    "PER_TX_LIMIT_FRACTION",
    Constant(
        value=0.1,
        unit="fraction of cycle limit",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Per-transaction cap as a fraction of the cycle limit. Breaches need human approval.",
    ),
)

COLLATERAL_RATIO_MEAN = define(
    "COLLATERAL_RATIO_MEAN",
    Constant(
        value=1.35,
        unit="ratio",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Mean RLUSD collateral held against the credit limit.",
    ),
)

BILLING_CYCLE_DAYS = define(
    "BILLING_CYCLE_DAYS",
    Constant(
        value=30.0,
        unit="days",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Billing cycle length used for repayment and default accounting.",
    ),
)

AIRDROP_CLAIM_PROB = define(
    "AIRDROP_CLAIM_PROB",
    Constant(
        value=0.4,
        unit="probability",
        provenance=Provenance.EXAMPLE_INPUT,
        note="Probability a human claims the NXS airdrop over the simulated year.",
    ),
)


@dataclass
class EventConfig:
    """Stress events. Day indices are 0-based. All EXAMPLE_INPUT."""

    market_shock_day: int = 120
    market_shock_days: int = 21
    # Collateral value multiplier during the shock (RLUSD collateral stress).
    market_shock_collateral_mult: float = 0.72
    # Repayment degradation during the shock.
    market_shock_repay_penalty: float = 0.06

    quicknode_outage_day: int = 210
    quicknode_outage_days: int = 2
    # Fraction of RPC calls that fail and are retried during the outage.
    quicknode_outage_retry_mult: float = 2.5

    gas_spike_day: int = 300
    gas_spike_days: int = 5
    gas_spike_mult: float = 8.0


@dataclass
class SimConfig:
    n_participants: int = 100_000
    days: int = 365
    agent_share: float = 0.5
    misbehaving_share: float = MISBEHAVING_AGENT_SHARE
    seed: int = 20261027
    runs: int = 100
    events: EventConfig = field(default_factory=EventConfig)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


@dataclass
class Population:
    """Per-participant static attributes as parallel numpy arrays."""

    is_agent: np.ndarray
    misbehaving: np.ndarray
    active_prob: np.ndarray
    tx_lambda: np.ndarray
    spend_mu: np.ndarray
    spend_sigma: np.ndarray
    rpc_calls_per_tx: np.ndarray
    advanced_share: np.ndarray
    cycle_limit: np.ndarray
    per_tx_limit: np.ndarray
    collateral_ratio: np.ndarray
    repay_prob: np.ndarray
    claims_airdrop: np.ndarray

    @property
    def n(self) -> int:
        return int(self.is_agent.shape[0])


def build_population(cfg: SimConfig, rng: np.random.Generator) -> Population:
    """Draw a participant population. Vectorized, no Python loop over participants."""
    n = cfg.n_participants
    is_agent = rng.random(n) < cfg.agent_share

    # Misbehaving flag applies to agents only.
    misbehaving = is_agent & (rng.random(n) < cfg.misbehaving_share)

    # Heterogeneity: scale each participant's activity by a lognormal factor so the
    # population has realistic dispersion rather than one shared rate.
    het = rng.lognormal(mean=0.0, sigma=0.45, size=n)

    active_prob = np.where(is_agent, AGENT_DAILY_ACTIVE_PROB, HUMAN_DAILY_ACTIVE_PROB) * het
    np.clip(active_prob, 0.0, 1.0, out=active_prob)

    tx_lambda = np.where(is_agent, AGENT_TX_PER_ACTIVE_DAY, HUMAN_TX_PER_ACTIVE_DAY) * het
    tx_lambda = np.maximum(tx_lambda, 0.05)

    spend_mu = np.where(is_agent, AGENT_SPEND_LOGNORM_MU, HUMAN_SPEND_LOGNORM_MU)
    spend_sigma = np.where(is_agent, AGENT_SPEND_LOGNORM_SIGMA, HUMAN_SPEND_LOGNORM_SIGMA)

    rpc_calls_per_tx = np.where(is_agent, AGENT_RPC_CALLS_PER_TX, HUMAN_RPC_CALLS_PER_TX) * np.maximum(het, 0.3)
    advanced_share = np.where(is_agent, AGENT_ADVANCED_API_SHARE, 0.0)

    cycle_limit = np.where(is_agent, AGENT_CREDIT_LIMIT_RLUSD, HUMAN_CREDIT_LIMIT_RLUSD)
    per_tx_limit = cycle_limit * PER_TX_LIMIT_FRACTION

    collateral_ratio = np.maximum(rng.normal(COLLATERAL_RATIO_MEAN, 0.3, size=n), 0.0)

    # Misbehaving agents repay worse. Dispersion via a beta-like transform.
    repay_quality = rng.beta(18.0, 1.4, size=n)
    repay_prob = np.clip(BASE_REPAY_PROB * (0.55 + 0.45 * repay_quality), 0.0, 1.0)
    repay_prob = np.where(misbehaving, repay_prob * 0.7, repay_prob)

    claims_airdrop = (~is_agent) & (rng.random(n) < AIRDROP_CLAIM_PROB)

    return Population(
        is_agent=is_agent,
        misbehaving=misbehaving,
        active_prob=active_prob,
        tx_lambda=tx_lambda,
        spend_mu=spend_mu,
        spend_sigma=spend_sigma,
        rpc_calls_per_tx=rpc_calls_per_tx,
        advanced_share=advanced_share,
        cycle_limit=cycle_limit,
        per_tx_limit=per_tx_limit,
        collateral_ratio=collateral_ratio,
        repay_prob=repay_prob,
        claims_airdrop=claims_airdrop,
    )


def event_factors(day: int, ev: EventConfig) -> dict[str, float]:
    """Multipliers in force on a given day."""
    in_shock = ev.market_shock_day <= day < ev.market_shock_day + ev.market_shock_days
    in_outage = ev.quicknode_outage_day <= day < ev.quicknode_outage_day + ev.quicknode_outage_days
    in_gas = ev.gas_spike_day <= day < ev.gas_spike_day + ev.gas_spike_days
    return {
        "collateral_mult": ev.market_shock_collateral_mult if in_shock else 1.0,
        "repay_penalty": ev.market_shock_repay_penalty if in_shock else 0.0,
        "rpc_retry_mult": ev.quicknode_outage_retry_mult if in_outage else 1.0,
        "settle_success": 0.4 if in_outage else 1.0,
        "gas_mult": ev.gas_spike_mult if in_gas else 1.0,
        "in_shock": 1.0 if in_shock else 0.0,
        "in_outage": 1.0 if in_outage else 0.0,
        "in_gas_spike": 1.0 if in_gas else 0.0,
    }
