import math

import numpy as np
import pandas as pd
import pytest

from timesheet_eval.metrics import regression_metrics, segment_metrics


def test_regression_metrics_known_values():
    m = regression_metrics(np.array([1.0, 2.0, 3.0, 4.0]), np.array([2.0, 2.0, 3.0, 2.0]))
    assert m["n"] == 4
    assert m["mae"] == pytest.approx(0.75)
    assert m["rmse"] == pytest.approx(math.sqrt(5 / 4))
    assert m["r2"] == pytest.approx(1 - 5 / 5)


def test_perfect_predictions():
    y = np.array([1.0, 2.5, 4.0])
    m = regression_metrics(y, y)
    assert m["rmse"] == 0 and m["mae"] == 0 and m["r2"] == 1


def test_r2_undefined_for_constant_target_or_single_row():
    assert regression_metrics(np.array([2.0, 2.0]), np.array([1.0, 3.0]))["r2"] is None
    assert regression_metrics(np.array([2.0]), np.array([1.0]))["r2"] is None


def test_empty_input():
    assert regression_metrics(np.array([]), np.array([]))["rmse"] is None


def test_segment_metrics_sorted_worst_first():
    frame = pd.DataFrame(
        {
            "g": ["a"] * 3 + ["b"] * 3,
            "y": [1.0, 2.0, 3.0, 1.0, 2.0, 3.0],
            "p": [1.0, 2.0, 3.0, 2.0, 3.0, 4.0],
        }
    )
    rows = segment_metrics(frame, "g", "y", "p", min_size=3, overall_rmse=0.5)
    assert [r["group"] for r in rows] == ["b", "a"]
    assert rows[0]["rmse_ratio_to_overall"] == pytest.approx(2.0)
    assert rows[0]["share_of_rows"] == pytest.approx(0.5)
    assert all(r["sufficient_support"] for r in rows)
