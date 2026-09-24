import numpy as np
import pandas as pd
import pytest

from timesheet_eval.bias import bias_by_group, holm_adjust


def test_holm_adjust():
    assert holm_adjust([0.01, 0.04, 0.03]) == pytest.approx([0.03, 0.06, 0.06])
    assert holm_adjust([]) == []


def _frame(rng, offsets, n=200):
    parts = []
    for group, offset in offsets.items():
        actual = rng.normal(4, 1, n)
        parts.append(
            pd.DataFrame({"g": group, "y": actual, "p": actual + offset + rng.normal(0, 0.5, n)})
        )
    return pd.concat(parts, ignore_index=True)


def test_detects_planted_over_and_under_prediction():
    rng = np.random.default_rng(0)
    frame = _frame(rng, {"over": 1.0, "under": -0.8, "fair": 0.0})
    rows = {r["group"]: r for r in bias_by_group(frame, "g", "y", "p", 0.05, 0.25, 10)}
    assert rows["over"]["flagged"] and rows["over"]["direction"] == "over-predicts"
    assert rows["under"]["flagged"] and rows["under"]["direction"] == "under-predicts"
    assert not rows["fair"]["flagged"]
    lo, hi = rows["over"]["mean_error_ci95"]
    assert lo < 1.0 < hi


def test_small_but_significant_bias_below_threshold_not_flagged():
    rng = np.random.default_rng(1)
    frame = _frame(rng, {"tiny": 0.1}, n=5000)
    (row,) = bias_by_group(frame, "g", "y", "p", 0.05, 0.25, 10)
    assert row["p_value_adjusted"] < 0.05
    assert not row["flagged"]


def test_low_support_groups_not_tested():
    frame = pd.DataFrame({"g": ["a"] * 3, "y": [1.0, 2.0, 3.0], "p": [3.0, 4.1, 5.0]})
    (row,) = bias_by_group(frame, "g", "y", "p", 0.05, 0.25, min_size=10)
    assert row["p_value_adjusted"] is None
    assert not row["flagged"]
    assert row["direction"] == "insufficient data"


def test_constant_error_is_flagged():
    frame = pd.DataFrame({"g": ["a"] * 12, "y": np.arange(12.0), "p": np.arange(12.0) + 1})
    (row,) = bias_by_group(frame, "g", "y", "p", 0.05, 0.25, min_size=10)
    assert row["flagged"] and row["mean_error_ci95"] == [1.0, 1.0]
