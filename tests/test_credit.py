"""Unit tests for the credit score math."""

from __future__ import annotations

import numpy as np
import pytest

from sim import credit


def _inputs(**over):
    base = dict(
        cycles_observed=np.array([12.0]),
        cycles_on_time=np.array([12.0]),
        spend=np.array([25.0]),
        cycle_limit=np.array([250.0]),
        collateral_ratio=np.array([1.5]),
        quicknode_usd=np.array([0.0]),
        carbon_g=np.array([0.0]),
        settled_tx=np.array([100.0]),
        breach_attempts=np.array([0.0]),
    )
    base.update(over)
    return base


def test_thin_file_gets_neutral_score_not_extreme():
    s = credit.score(**_inputs(cycles_observed=np.array([0.0]), cycles_on_time=np.array([0.0])))
    assert s[0] == pytest.approx(credit.THIN_FILE_SCORE)
    assert credit.SCORE_MIN < s[0] < credit.SCORE_MAX


def test_best_case_reaches_top_of_range():
    s = credit.score(**_inputs(spend=np.array([0.0])))
    assert s[0] == pytest.approx(credit.SCORE_MAX, abs=1e-6)


def test_worst_case_reaches_bottom_of_range():
    s = credit.score(
        **_inputs(
            cycles_on_time=np.array([0.0]),
            spend=np.array([250.0]),           # fully utilised
            collateral_ratio=np.array([0.0]),
            quicknode_usd=np.array([10.0]),    # far above reference cost per tx
            carbon_g=np.array([10_000.0]),
            settled_tx=np.array([1.0]),
            breach_attempts=np.array([999.0]),
        )
    )
    assert s[0] == pytest.approx(credit.SCORE_MIN, abs=1e-6)


def test_score_is_always_within_range_for_random_inputs():
    rng = np.random.default_rng(7)
    n = 5000
    s = credit.score(
        cycles_observed=rng.integers(0, 13, n).astype(float),
        cycles_on_time=rng.integers(0, 13, n).astype(float),
        spend=rng.uniform(0, 5000, n),
        cycle_limit=np.full(n, 250.0),
        collateral_ratio=rng.uniform(0, 3, n),
        quicknode_usd=rng.uniform(0, 1, n),
        carbon_g=rng.uniform(0, 500, n),
        settled_tx=rng.integers(0, 500, n).astype(float),
        breach_attempts=rng.integers(0, 40, n).astype(float),
    )
    assert s.min() >= credit.SCORE_MIN
    assert s.max() <= credit.SCORE_MAX
    assert np.isfinite(s).all()


def test_repayment_is_monotonic():
    ratios = np.linspace(0, 1, 11)
    scores = credit.score(
        cycles_observed=np.full(11, 12.0),
        cycles_on_time=ratios * 12.0,
        spend=np.full(11, 25.0),
        cycle_limit=np.full(11, 250.0),
        collateral_ratio=np.full(11, 1.5),
        quicknode_usd=np.zeros(11),
        carbon_g=np.zeros(11),
        settled_tx=np.full(11, 100.0),
        breach_attempts=np.zeros(11),
    )
    assert np.all(np.diff(scores) > 0)


def test_breaches_strictly_reduce_score():
    clean = credit.score(**_inputs(breach_attempts=np.array([0.0])))
    dirty = credit.score(**_inputs(breach_attempts=np.array([6.0])))
    assert dirty[0] < clean[0]


def test_higher_utilisation_reduces_score():
    low = credit.score(**_inputs(spend=np.array([10.0])))
    high = credit.score(**_inputs(spend=np.array([240.0])))
    assert high[0] < low[0]


def test_compute_inefficiency_reduces_score():
    """An agent burning more RPC cost per settled transaction scores lower."""
    efficient = credit.score(**_inputs(quicknode_usd=np.array([0.01]), settled_tx=np.array([1000.0])))
    wasteful = credit.score(**_inputs(quicknode_usd=np.array([0.01]), settled_tx=np.array([3.0])))
    assert wasteful[0] < efficient[0]


def test_settling_nothing_scores_zero_on_compute_not_crash():
    s = credit.score(**_inputs(settled_tx=np.array([0.0]), quicknode_usd=np.array([0.5])))
    assert np.isfinite(s[0])
    assert credit.SCORE_MIN <= s[0] <= credit.SCORE_MAX


def test_weights_sum_to_one():
    assert credit.WEIGHT_SUM == pytest.approx(1.0)


def test_bands_cover_the_range():
    s = np.array([300.0, 600.0, 700.0, 760.0, 850.0])
    assert list(credit.band(s)) == ["poor", "fair", "good", "very good", "excellent"]
