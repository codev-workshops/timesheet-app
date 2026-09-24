"""Systematic over/under-prediction checks per category.

Error is defined as ``predicted - actual``: positive mean error means the model
over-predicts hours for that group, negative means it under-predicts.

A group is flagged when it has at least ``min_size`` rows, its mean error is
statistically different from zero (one-sample t-test, Holm-adjusted across the groups
of a dimension), and the absolute mean error is at least ``threshold_hours``.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy import stats


def holm_adjust(p_values: list[float]) -> list[float]:
    """Holm-Bonferroni step-down adjusted p-values, returned in input order."""
    m = len(p_values)
    order = sorted(range(m), key=lambda i: p_values[i])
    adjusted = [0.0] * m
    running = 0.0
    for rank, idx in enumerate(order):
        running = max(running, min(1.0, (m - rank) * p_values[idx]))
        adjusted[idx] = running
    return adjusted


def _mean_error_test(errors: np.ndarray) -> tuple[float | None, float | None, list[float] | None]:
    """Return (t statistic, two-sided p-value, 95% CI) for mean(errors) == 0."""
    n = errors.size
    if n < 2:
        return None, None, None
    mean = float(np.mean(errors))
    std = float(np.std(errors, ddof=1))
    if std == 0.0:
        p = 1.0 if mean == 0.0 else 0.0
        t = 0.0 if mean == 0.0 else math.copysign(math.inf, mean)
        return t, p, [mean, mean]
    se = std / math.sqrt(n)
    t = mean / se
    p = float(2 * stats.t.sf(abs(t), df=n - 1))
    half_width = float(stats.t.ppf(0.975, df=n - 1)) * se
    return t, p, [mean - half_width, mean + half_width]


def bias_by_group(
    frame: pd.DataFrame,
    group_col: str,
    y_true_col: str,
    y_pred_col: str,
    alpha: float,
    threshold_hours: float,
    min_size: int,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for group, part in frame.groupby(group_col, sort=True):
        errors = part[y_pred_col].to_numpy(dtype=float) - part[y_true_col].to_numpy(dtype=float)
        t, p, ci = _mean_error_test(errors)
        rows.append(
            {
                "group": str(group),
                "n": int(errors.size),
                "mean_error": float(np.mean(errors)),
                "median_error": float(np.median(errors)),
                "std_error": float(np.std(errors, ddof=1)) if errors.size > 1 else None,
                "mean_error_ci95": ci,
                "over_prediction_rate": float(np.mean(errors > 0)),
                "t_statistic": t,
                "p_value": p,
                "p_value_adjusted": None,
                "sufficient_support": errors.size >= min_size,
            }
        )

    testable = [r for r in rows if r["sufficient_support"] and r["p_value"] is not None]
    for row, adj in zip(testable, holm_adjust([r["p_value"] for r in testable]), strict=True):
        row["p_value_adjusted"] = adj

    for row in rows:
        adj = row["p_value_adjusted"]
        significant = adj is not None and adj < alpha
        material = abs(row["mean_error"]) >= threshold_hours
        row["flagged"] = bool(significant and material)
        if row["flagged"]:
            row["direction"] = "over-predicts" if row["mean_error"] > 0 else "under-predicts"
        elif not row["sufficient_support"]:
            row["direction"] = "insufficient data"
        else:
            row["direction"] = "no systematic bias detected"
    rows.sort(
        key=lambda r: (
            not r["flagged"],
            not r["sufficient_support"],
            -abs(r["mean_error"]),
            r["group"],
        )
    )
    return rows
