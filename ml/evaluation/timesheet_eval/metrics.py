from __future__ import annotations

import math

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float | int | None]:
    """RMSE, MAE and R^2. R^2 is ``None`` when undefined (n < 2 or constant target)."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    n = int(y_true.size)
    if n == 0:
        return {
            "n": 0,
            "rmse": None,
            "mae": None,
            "r2": None,
            "mean_actual": None,
            "mean_predicted": None,
        }
    r2: float | None = None
    if n >= 2 and float(np.var(y_true)) > 0:
        r2 = float(r2_score(y_true, y_pred))
    return {
        "n": n,
        "rmse": math.sqrt(float(mean_squared_error(y_true, y_pred))),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "r2": r2,
        "mean_actual": float(np.mean(y_true)),
        "mean_predicted": float(np.mean(y_pred)),
    }


def segment_metrics(
    frame: pd.DataFrame,
    group_col: str,
    y_true_col: str,
    y_pred_col: str,
    min_size: int,
    overall_rmse: float | None,
) -> list[dict[str, object]]:
    """Per-group regression metrics, sorted by descending RMSE (worst first)."""
    total = len(frame)
    rows: list[dict[str, object]] = []
    for group, part in frame.groupby(group_col, sort=True):
        m = regression_metrics(part[y_true_col].to_numpy(), part[y_pred_col].to_numpy())
        rmse = m["rmse"]
        rows.append(
            {
                "group": str(group),
                **m,
                "share_of_rows": len(part) / total if total else 0.0,
                "rmse_ratio_to_overall": (
                    rmse / overall_rmse if rmse is not None and overall_rmse else None
                ),
                "sufficient_support": len(part) >= min_size,
            }
        )
    rows.sort(key=lambda r: (-(r["rmse"] or 0.0), r["group"]))
    return rows
