from __future__ import annotations

import json
import math
from collections.abc import Mapping, Sequence
from pathlib import Path

import numpy as np

from .config import SPLIT_NAMES

FLOAT_DIGITS = 6
DIMENSION_TITLES = {
    "client_segment": "Client segment",
    "project_type": "Project type",
    "segment_x_project_type": "Client segment × project type",
}


def to_serializable(value: object) -> object:
    """Convert numpy scalars / NaN / inf into JSON-safe builtins."""
    if isinstance(value, Mapping):
        return {str(k): to_serializable(v) for k, v in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, str):
        return [to_serializable(v) for v in value]
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float):
        return round(value, FLOAT_DIGITS) if math.isfinite(value) else None
    return value


def write_json(report: Mapping[str, object], path: Path) -> None:
    path.write_text(
        json.dumps(to_serializable(report), indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )


def _fmt(value: object, digits: int = 3) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, float):
        if not math.isfinite(value):
            return "n/a"
        return f"{value:.{digits}f}"
    return str(value)


def _pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def _table(headers: list[str], rows: list[list[str]]) -> list[str]:
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    lines += ["| " + " | ".join(r) + " |" for r in rows]
    return lines


def render_markdown(report: Mapping[str, object]) -> str:
    ds = report["dataset"]
    split = report["split"]
    metrics = report["metrics"]
    ref = report["reference_metrics"]["mean_predictor"]
    segments = report["segments"]
    bias = report["bias"]
    analysis_split = segments["analysis_split"]

    out: list[str] = ["# Work Entry Hours Model — Evaluation Report", ""]
    out.append(
        f"Generated {report['generated_at']} · model `{report['model']['type']}` · "
        f"target `{report['model']['target']}` · schema v{report['schema_version']}"
    )
    out.append("")

    out += ["## Summary", ""]
    test = metrics["test"]
    out.append(
        f"- Test RMSE **{_fmt(test['rmse'])} h**, MAE **{_fmt(test['mae'])} h**, "
        f"R² **{_fmt(test['r2'])}** (mean-predictor reference RMSE "
        f"{_fmt(ref['test']['rmse'])} h)."
    )
    flagged = bias["flagged"]
    if flagged:
        out.append(
            f"- **{len(flagged)} group(s) show systematic prediction bias** "
            f"on the {analysis_split} split:"
        )
        for f in flagged:
            out.append(
                f"  - {DIMENSION_TITLES[f['dimension']]} `{f['group']}` {f['direction']} by "
                f"{_fmt(abs(f['mean_error']), 2)} h on average (n={f['n']}, "
                f"adj. p={_fmt(f['p_value_adjusted'], 4)})."
            )
    else:
        out.append(f"- No systematic prediction bias detected on the {analysis_split} split.")
    for dim in DIMENSION_TITLES:
        supported = [r for r in segments[dim] if r["sufficient_support"]]
        if supported:
            worst = supported[0]
            out.append(
                f"- Worst {DIMENSION_TITLES[dim].lower()}: `{worst['group']}` "
                f"(RMSE {_fmt(worst['rmse'])} h, "
                f"{_fmt(worst['rmse_ratio_to_overall'], 2)}× overall)."
            )
    out.append("")

    out += ["## Dataset", ""]
    out += _table(
        ["Source", "Rows used", "Rows dropped", "Date range", "Clients", "Mean hours"],
        [
            [
                f"`{ds['source']}`",
                str(ds["rows_used"]),
                str(ds["rows_dropped"]),
                f"{ds['date_range']['start']} → {ds['date_range']['end']}",
                _fmt(ds["n_clients"]),
                _fmt(ds["target_mean_hours"], 2),
            ]
        ],
    )
    out.append("")

    out += ["## Splits", ""]
    out.append(f"Strategy `{split['strategy']}`, seed `{split['seed']}`.")
    out.append("")
    out += _table(
        ["Split", "Ratio", "Rows", "Date range"],
        [
            [
                name,
                _pct(split["ratios"][name]),
                str(split["sizes"][name]),
                f"{split['date_ranges'][name]['start']} → {split['date_ranges'][name]['end']}",
            ]
            for name in SPLIT_NAMES
        ],
    )
    out.append("")

    out += ["## Overall metrics", ""]
    out += _table(
        [
            "Split",
            "n",
            "RMSE",
            "MAE",
            "R²",
            "Mean actual",
            "Mean predicted",
            "Reference RMSE",
            "Reference MAE",
        ],
        [
            [
                name,
                str(metrics[name]["n"]),
                _fmt(metrics[name]["rmse"]),
                _fmt(metrics[name]["mae"]),
                _fmt(metrics[name]["r2"]),
                _fmt(metrics[name]["mean_actual"]),
                _fmt(metrics[name]["mean_predicted"]),
                _fmt(ref[name]["rmse"]),
                _fmt(ref[name]["mae"]),
            ]
            for name in SPLIT_NAMES
        ],
    )
    out.append("")
    out.append("Reference = constant predictor of the training-set mean hours.")
    out.append("")

    out += [f"## Performance by segment ({analysis_split} split)", ""]
    for dim in DIMENSION_TITLES:
        out += [f"### {DIMENSION_TITLES[dim]}", ""]
        out += _table(
            ["Group", "n", "Share", "RMSE", "MAE", "R²", "RMSE / overall", "Support"],
            [
                [
                    f"`{r['group']}`",
                    str(r["n"]),
                    _pct(r["share_of_rows"]),
                    _fmt(r["rmse"]),
                    _fmt(r["mae"]),
                    _fmt(r["r2"]),
                    _fmt(r["rmse_ratio_to_overall"], 2),
                    "ok" if r["sufficient_support"] else "low",
                ]
                for r in segments[dim]
            ],
        )
        out.append("")

    out += [f"## Prediction bias ({analysis_split} split)", ""]
    out.append(
        f"Error = {bias['error_definition']}. A group is flagged when n ≥ "
        f"{report['config']['min_segment_size']}, the Holm-adjusted one-sample t-test "
        f"p-value < {bias['alpha']}, and |mean error| ≥ {bias['threshold_hours']} h."
    )
    out.append("")
    for dim in DIMENSION_TITLES:
        out += [f"### {DIMENSION_TITLES[dim]}", ""]
        out += _table(
            ["Group", "n", "Mean error", "95% CI", "Over-prediction rate", "Adj. p", "Verdict"],
            [
                [
                    f"`{r['group']}`",
                    str(r["n"]),
                    _fmt(r["mean_error"]),
                    (
                        f"[{_fmt(r['mean_error_ci95'][0])}, {_fmt(r['mean_error_ci95'][1])}]"
                        if r["mean_error_ci95"]
                        else "n/a"
                    ),
                    _pct(r["over_prediction_rate"]),
                    _fmt(r["p_value_adjusted"], 4),
                    f"**{r['direction']}**" if r["flagged"] else r["direction"],
                ]
                for r in bias[dim]
            ],
        )
        out.append("")

    warnings = report["warnings"]
    if warnings:
        out += ["## Warnings", ""]
        out += [f"- {w}" for w in warnings]
        out.append("")

    return "\n".join(out)


def write_markdown(report: Mapping[str, object], path: Path) -> None:
    path.write_text(render_markdown(to_serializable(report)), encoding="utf-8")
