from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
import pandas as pd

from . import __version__
from .bias import bias_by_group
from .config import SPLIT_NAMES, EvalConfig
from .data import LoadedData
from .metrics import regression_metrics, segment_metrics
from .model import (
    CATEGORICAL_FEATURES,
    NUMERIC_FEATURES,
    TARGET,
    build_baseline_model,
    build_mean_reference,
    encoded_feature_count,
    fit,
    predict,
)
from .splits import split_dataset

REPORT_SCHEMA_VERSION = 1
SEGMENT_DIMENSIONS = ("client_segment", "project_type", "segment_x_project_type")
MAX_LISTED_GROUPS = 10


def _date_range(frame: pd.DataFrame) -> dict[str, str | None]:
    if frame.empty:
        return {"start": None, "end": None}
    return {
        "start": frame["date"].min().strftime("%Y-%m-%d"),
        "end": frame["date"].max().strftime("%Y-%m-%d"),
    }


def _value_counts(series: pd.Series) -> dict[str, int]:
    counts = series.value_counts()
    return {str(k): int(v) for k, v in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))}


def run_evaluation(
    data: LoadedData,
    config: EvalConfig,
    generated_at: datetime | None = None,
) -> dict[str, object]:
    frame = data.frame
    splits = split_dataset(frame, config.ratios, config.split_strategy, config.seed)

    model = fit(build_baseline_model(), splits["train"])
    reference = fit(build_mean_reference(), splits["train"])

    metrics: dict[str, object] = {}
    reference_metrics: dict[str, object] = {}
    scored: dict[str, pd.DataFrame] = {}
    for name in SPLIT_NAMES:
        part = splits[name]
        y_true = part[TARGET].to_numpy(dtype=float)
        y_pred = predict(model, part)
        metrics[name] = regression_metrics(y_true, y_pred)
        reference_metrics[name] = regression_metrics(y_true, predict(reference, part))
        scored[name] = part.assign(
            predicted_hours=y_pred,
            segment_x_project_type=part["client_segment"] + " / " + part["project_type"],
        )

    analysis = scored[config.analysis_split]
    overall_rmse = metrics[config.analysis_split]["rmse"]
    segments = {
        dim: segment_metrics(
            analysis, dim, TARGET, "predicted_hours", config.min_segment_size, overall_rmse
        )
        for dim in SEGMENT_DIMENSIONS
    }
    bias = {
        dim: bias_by_group(
            analysis,
            dim,
            TARGET,
            "predicted_hours",
            alpha=config.bias_alpha,
            threshold_hours=config.bias_threshold_hours,
            min_size=config.min_segment_size,
        )
        for dim in SEGMENT_DIMENSIONS
    }
    flagged = [
        {
            "dimension": dim,
            "group": row["group"],
            "direction": row["direction"],
            "mean_error": row["mean_error"],
            "n": row["n"],
            "p_value_adjusted": row["p_value_adjusted"],
        }
        for dim in SEGMENT_DIMENSIONS
        for row in bias[dim]
        if row["flagged"]
    ]

    warnings: list[str] = []
    if data.rows_dropped:
        warnings.append(f"{data.rows_dropped} row(s) dropped for missing/invalid hours or date.")
    for dim in SEGMENT_DIMENSIONS:
        small = [r["group"] for r in segments[dim] if not r["sufficient_support"]]
        if small:
            listed = ", ".join(small[:MAX_LISTED_GROUPS])
            if len(small) > MAX_LISTED_GROUPS:
                listed += f", … (+{len(small) - MAX_LISTED_GROUPS} more)"
            warnings.append(
                f"{dim}: {len(small)} group(s) below min_segment_size="
                f"{config.min_segment_size} in the {config.analysis_split} split "
                f"({listed}); their metrics are unreliable and they are not bias-tested."
            )
    unseen = sorted(
        set(analysis["project_type"]) - set(splits["train"]["project_type"])
        | set(analysis["client_segment"]) - set(splits["train"]["client_segment"])
    )
    if unseen:
        warnings.append(f"Categories absent from training data: {', '.join(unseen)}.")
    test_r2 = metrics["test"]["r2"]
    if test_r2 is not None and test_r2 < 0:
        warnings.append("Test R^2 is negative: the model is worse than predicting the mean.")

    timestamp = generated_at or datetime.now(UTC)
    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "tool_version": __version__,
        "generated_at": timestamp.isoformat(timespec="seconds"),
        "dataset": {
            "source": data.source,
            "rows_loaded": data.rows_loaded,
            "rows_used": int(len(frame)),
            "rows_dropped": data.rows_dropped,
            "date_range": _date_range(frame),
            "n_clients": int(frame["client_id"].nunique()) if "client_id" in frame else None,
            "target_mean_hours": float(np.mean(frame[TARGET])),
            "client_segment_counts": _value_counts(frame["client_segment"]),
            "project_type_counts": _value_counts(frame["project_type"]),
        },
        "config": config.to_dict(),
        "split": {
            "strategy": config.split_strategy,
            "seed": config.seed,
            "ratios": config.ratios,
            "sizes": {name: int(len(splits[name])) for name in SPLIT_NAMES},
            "date_ranges": {name: _date_range(splits[name]) for name in SPLIT_NAMES},
        },
        "model": {
            "type": "LinearRegression",
            "target": TARGET,
            "categorical_features": CATEGORICAL_FEATURES,
            "numeric_features": NUMERIC_FEATURES,
            "encoded_feature_count": encoded_feature_count(model),
        },
        "metrics": metrics,
        "reference_metrics": {"mean_predictor": reference_metrics},
        "segments": {"analysis_split": config.analysis_split, **segments},
        "bias": {
            "analysis_split": config.analysis_split,
            "error_definition": "predicted - actual (hours)",
            "alpha": config.bias_alpha,
            "threshold_hours": config.bias_threshold_hours,
            "multiple_testing_correction": "holm",
            **bias,
            "flagged": flagged,
        },
        "warnings": warnings,
    }
