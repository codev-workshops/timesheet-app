"""Train the hours-estimation model end to end.

    python ml/train.py                # from repo root (or `cd ml && python train.py`)

Steps: extract (DB or synthetic) -> time-based 80/20 split -> Optuna search with early
stopping on a time-ordered validation slice of the training set -> refit on the full
training split -> evaluate vs a per-client-median baseline -> write
``artifacts/model.joblib`` and ``artifacts/metrics.json``. Exits 1 if the model does
not beat the baseline on test MAE.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import joblib
import numpy as np
import optuna
import pandas as pd
import sklearn
import xgboost

import extract
import synthetic_data
from pipeline import FEATURE_COLUMNS, TARGET, build_pipeline, build_preprocessor, build_regressor

SKEW_THRESHOLD = 0.75
HOURS_MIN, HOURS_MAX = 0.25, 12.0
EARLY_STOPPING_ROUNDS = 50


def time_split(df: pd.DataFrame, frac: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    ordered = df.sort_values("date", kind="stable").reset_index(drop=True)
    cut = round(len(ordered) * frac)
    return ordered.iloc[:cut].reset_index(drop=True), ordered.iloc[cut:].reset_index(drop=True)


def regression_metrics(y_true, y_pred) -> dict[str, float]:
    err = np.asarray(y_pred, dtype=float) - np.asarray(y_true, dtype=float)
    return {"mae": round(float(np.mean(np.abs(err))), 4),
            "rmse": round(float(np.sqrt(np.mean(err ** 2))), 4)}


class ClientMedianBaseline:
    """Median hours per client_id from training data; global median for unseen clients."""

    def fit(self, df: pd.DataFrame):
        self.global_median_ = float(df[TARGET].median())
        self.medians_ = df.groupby("client_id")[TARGET].median().to_dict()
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        return df["client_id"].map(self.medians_).fillna(self.global_median_).to_numpy(dtype=float)


def clip_hours(pred) -> np.ndarray:
    return np.clip(np.asarray(pred, dtype=float), HOURS_MIN, HOURS_MAX)


def tune(train_df: pd.DataFrame, log_target: bool, n_trials: int, seed: int,
         val_frac: float) -> optuna.Study:
    inner, val = time_split(train_df, 1 - val_frac)
    pre = build_preprocessor().fit(inner[FEATURE_COLUMNS])
    X_inner, X_val = pre.transform(inner[FEATURE_COLUMNS]), pre.transform(val[FEATURE_COLUMNS])
    fwd = np.log1p if log_target else (lambda a: a)
    inv = np.expm1 if log_target else (lambda a: a)
    y_inner, y_val = inner[TARGET].to_numpy(float), val[TARGET].to_numpy(float)

    def objective(trial: optuna.Trial) -> float:
        params = {
            "max_depth": trial.suggest_int("max_depth", 2, 10),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "n_estimators": trial.suggest_int("n_estimators", 100, 1500, step=50),
            "min_child_weight": trial.suggest_float("min_child_weight", 0.5, 20.0, log=True),
        }
        model = build_regressor(seed, early_stopping_rounds=EARLY_STOPPING_ROUNDS,
                                eval_metric="mae", **params)
        model.fit(X_inner, fwd(y_inner), eval_set=[(X_val, fwd(y_val))], verbose=False)
        trial.set_user_attr("best_iteration", int(model.best_iteration))
        return regression_metrics(y_val, clip_hours(inv(model.predict(X_val))))["mae"]

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    study = optuna.create_study(direction="minimize",
                                sampler=optuna.samplers.TPESampler(seed=seed))
    study.optimize(objective, n_trials=n_trials)
    study.set_user_attr("n_inner", len(inner))
    study.set_user_attr("n_val", len(val))
    return study


def model_fingerprint(pipe) -> str:
    buf = io.BytesIO()
    joblib.dump(pipe, buf)
    return hashlib.sha256(buf.getvalue()).hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--db", help="SQLite DB path (default: $DATABASE_PATH; synthetic fallback)")
    parser.add_argument("--force-synthetic", action="store_true")
    parser.add_argument("--rows", type=int, default=synthetic_data.DEFAULT_ROWS,
                        help="synthetic rows when falling back")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--n-trials", type=int, default=50)
    parser.add_argument("--test-frac", type=float, default=0.2)
    parser.add_argument("--val-frac", type=float, default=0.15,
                        help="latest fraction of the training split used for early stopping")
    parser.add_argument("--output-dir", default=str(ML_DIR / "artifacts"))
    parser.add_argument("--data-csv", default=str(ML_DIR / "data" / "synthetic.csv"),
                        help="where to write the synthetic dataset when it is used")
    args = parser.parse_args(argv)

    df, source = extract.load_dataset(args.db, n_synthetic=args.rows, seed=args.seed,
                                      force_synthetic=args.force_synthetic)
    if source == "synthetic" and args.data_csv:
        synthetic_data.write_csv(df, args.data_csv)
    print(f"[train] {len(df)} rows from {source}")

    train_df, test_df = time_split(df, 1 - args.test_frac)
    skew = float(train_df[TARGET].skew())
    log_target = skew > SKEW_THRESHOLD
    print(f"[train] train={len(train_df)} test={len(test_df)} target skew={skew:.3f} "
          f"-> log_target={log_target}")

    baseline = ClientMedianBaseline().fit(train_df)
    baseline_metrics = regression_metrics(test_df[TARGET], baseline.predict(test_df))

    study = tune(train_df, log_target, args.n_trials, args.seed, args.val_frac)
    best = dict(study.best_params)
    best_iteration = study.best_trial.user_attrs["best_iteration"]
    final_params = {**best, "n_estimators": best_iteration + 1}
    print(f"[train] best trial val MAE={study.best_value:.4f} params={best} "
          f"best_iteration={best_iteration}")

    pipe = build_pipeline(log_target=log_target, seed=args.seed, **final_params)
    pipe.fit(train_df[FEATURE_COLUMNS], train_df[TARGET])
    model_metrics = regression_metrics(test_df[TARGET], clip_hours(pipe.predict(test_df[FEATURE_COLUMNS])))

    now = datetime.now(UTC)
    model_version = f"xgb-{now:%Y%m%d}-{model_fingerprint(pipe)[:6]}"
    beats = model_metrics["mae"] < baseline_metrics["mae"]

    metrics = {
        "model_version": model_version,
        "trained_at": now.isoformat(timespec="seconds"),
        "data_source": source,
        "n_rows": len(df),
        "n_train": len(train_df),
        "n_test": len(test_df),
        "split": {"method": "time", "test_frac": args.test_frac,
                  "train_date_max": str(train_df["date"].max().date()),
                  "test_date_min": str(test_df["date"].min().date()),
                  "test_date_max": str(test_df["date"].max().date())},
        "test": model_metrics,
        "baseline": {"name": "per_client_median (global median for unseen clients)",
                     **baseline_metrics},
        "beats_baseline_mae": beats,
        "mae_improvement_pct": round(100 * (1 - model_metrics["mae"] / baseline_metrics["mae"]), 2),
        "log_target": log_target,
        "target_skew": round(skew, 4),
        "log_target_rule": f"log1p target when train-split hours skewness > {SKEW_THRESHOLD}",
        "best_params": final_params,
        "search": {"library": "optuna", "sampler": "TPE", "n_trials": args.n_trials,
                   "seed": args.seed, "best_val_mae": round(float(study.best_value), 4),
                   "searched_n_estimators": best["n_estimators"],
                   "early_stopping_rounds": EARLY_STOPPING_ROUNDS,
                   "best_iteration": best_iteration,
                   "n_inner_train": study.user_attrs["n_inner"],
                   "n_val": study.user_attrs["n_val"]},
        "features": {"onehot": ["client_id", "user_email", "department"],
                     "tfidf": {"column": "description", "max_features": 500, "ngram_range": [1, 2]},
                     "date": ["day_of_week", "is_weekend", "month"]},
        "versions": {"python": sys.version.split()[0], "scikit-learn": sklearn.__version__,
                     "xgboost": xgboost.__version__, "pandas": pd.__version__,
                     "numpy": np.__version__},
    }

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": pipe, "model_version": model_version, "log_target": log_target,
                 "feature_columns": FEATURE_COLUMNS, "trained_at": metrics["trained_at"]},
                out / "model.joblib", compress=3)
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")

    print(f"[train] test MAE={model_metrics['mae']} RMSE={model_metrics['rmse']} | "
          f"baseline MAE={baseline_metrics['mae']} RMSE={baseline_metrics['rmse']}")
    print(f"[train] wrote {out / 'model.joblib'} ({model_version})")
    if not beats:
        print("[train] FAIL: model does not beat the per-client-median baseline on MAE",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
