from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import SPLIT_NAMES, SPLIT_STRATEGIES, EvalConfig
from .data import load_work_entries
from .pipeline import run_evaluation
from .report import write_json, write_markdown
from .synthetic import generate_work_entries

DEFAULTS = EvalConfig()


def _load_rules(path: str | None) -> dict[str, list[str]]:
    if path is None:
        return DEFAULTS.project_type_rules
    with open(path, encoding="utf-8") as fh:
        rules = json.load(fh)
    if not isinstance(rules, dict) or not all(
        isinstance(k, str) and isinstance(v, list) and all(isinstance(x, str) for x in v)
        for k, v in rules.items()
    ):
        raise ValueError("Project type rules must be a JSON object of {type: [keywords...]}")
    return rules


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m timesheet_eval",
        description="Evaluate a baseline hours-prediction model on timesheet-app work entries.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    ev = sub.add_parser("evaluate", help="Train the baseline model and write reports")
    ev.add_argument(
        "--data",
        required=True,
        help="Work entries: .csv, .json, or a SQLite file (.db/.sqlite/.sqlite3)",
    )
    ev.add_argument("--output-dir", default="output", help="Directory for report.json / .md")
    ev.add_argument("--train-ratio", type=float, default=DEFAULTS.train_ratio)
    ev.add_argument("--validation-ratio", type=float, default=DEFAULTS.validation_ratio)
    ev.add_argument("--test-ratio", type=float, default=DEFAULTS.test_ratio)
    ev.add_argument("--split-strategy", choices=SPLIT_STRATEGIES, default=DEFAULTS.split_strategy)
    ev.add_argument("--seed", type=int, default=DEFAULTS.seed)
    ev.add_argument(
        "--analysis-split",
        choices=SPLIT_NAMES,
        default=DEFAULTS.analysis_split,
        help="Split used for the segment and bias analysis",
    )
    ev.add_argument("--min-segment-size", type=int, default=DEFAULTS.min_segment_size)
    ev.add_argument("--bias-alpha", type=float, default=DEFAULTS.bias_alpha)
    ev.add_argument("--bias-threshold-hours", type=float, default=DEFAULTS.bias_threshold_hours)
    ev.add_argument(
        "--project-type-rules", help="JSON file mapping project type -> keyword list (ordered)"
    )
    ev.add_argument("--user-email", help="Only evaluate entries belonging to this user")

    gen = sub.add_parser("generate-sample", help="Write a synthetic work entries CSV")
    gen.add_argument("--rows", type=int, default=2000)
    gen.add_argument("--seed", type=int, default=7)
    gen.add_argument("--out", default="data/sample_work_entries.csv")
    return parser


def _evaluate(args: argparse.Namespace) -> int:
    config = EvalConfig(
        train_ratio=args.train_ratio,
        validation_ratio=args.validation_ratio,
        test_ratio=args.test_ratio,
        split_strategy=args.split_strategy,
        seed=args.seed,
        analysis_split=args.analysis_split,
        min_segment_size=args.min_segment_size,
        bias_alpha=args.bias_alpha,
        bias_threshold_hours=args.bias_threshold_hours,
        project_type_rules=_load_rules(args.project_type_rules),
    )
    data = load_work_entries(args.data, config.project_type_rules, user_email=args.user_email)
    report = run_evaluation(data, config)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path, md_path = out_dir / "report.json", out_dir / "report.md"
    write_json(report, json_path)
    write_markdown(report, md_path)

    test = report["metrics"]["test"]
    print(f"test rmse={test['rmse']:.3f} mae={test['mae']:.3f} r2={test['r2']}")
    print(f"bias flags: {len(report['bias']['flagged'])}")
    print(f"wrote {json_path} and {md_path}")
    return 0


def _generate(args: argparse.Namespace) -> int:
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    generate_work_entries(n_rows=args.rows, seed=args.seed).to_csv(out, index=False)
    print(f"wrote {args.rows} rows to {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "evaluate":
            return _evaluate(args)
        return _generate(args)
    except (ValueError, FileNotFoundError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
