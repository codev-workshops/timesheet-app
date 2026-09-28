"""Train and evaluate models predicting `hours` for timesheet work entries.

Reads ml/data/{train,test,clients}.csv (see generate_data.py), builds leakage-safe
features, compares baselines against LightGBM (sklearn GradientBoosting fallback)
and Ridge, and writes ml/REPORT.md plus machine-readable artifacts to ml/artifacts/.

Usage: python ml/train.py [--data-dir DIR]
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

try:
    import lightgbm as lgb
except ImportError:  # pragma: no cover - exercised only when lightgbm is missing
    lgb = None
    from sklearn.ensemble import HistGradientBoostingRegressor

ML_DIR = Path(__file__).resolve().parent
SEED = 42
VALID_FRACTION = 0.15
ROLLING_DAYS = 30
SMOOTHING = 10.0
N_KEYWORDS = 40
SPARSE_USER_MAX_TRAIN_ROWS = 100
N_BOOTSTRAP = 1000
STOPWORDS = {
    "the",
    "and",
    "for",
    "of",
    "on",
    "with",
    "to",
    "in",
    "re",
    "from",
    "over",
    "a",
    "an",
    "ticket",
    "during",
}

CAT_FEATURES = ["department"]


# --------------------------------------------------------------------------- data


def load(data_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    clients = pd.read_csv(data_dir / "clients.csv")
    frames = []
    for name in ("train", "test"):
        df = pd.read_csv(data_dir / f"{name}.csv", keep_default_na=False, na_values=[""])
        df["date"] = pd.to_datetime(df["date"], format="%Y-%m-%d")
        df = df.merge(
            clients[["id", "department", "user_email"]].rename(
                columns={"id": "client_id", "user_email": "client_owner"}
            ),
            on="client_id",
            how="left",
            validate="many_to_one",
        )
        assert (df["client_owner"] == df["user_email"]).all(), "tenancy violation"
        assert df["hours"].between(0, 24, inclusive="right").all()
        df["department"] = df["department"].fillna("Unknown")
        frames.append(df.drop(columns="client_owner").sort_values(["date", "id"]))
    train, test = frames
    assert train["date"].max() < test["date"].min(), "split must be time-based"
    return train.reset_index(drop=True), test.reset_index(drop=True), clients


def time_split(df: pd.DataFrame, fraction: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Carve the last `fraction` of the date span off as a validation slice."""
    start, end = df["date"].min(), df["date"].max()
    cut = start + (end - start) * (1 - fraction)
    return df[df["date"] <= cut].copy(), df[df["date"] > cut].copy()


# ----------------------------------------------------------------------- features


def tokenize(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z]{3,}", text.lower()) if t not in STOPWORDS]


def smoothed(total: np.ndarray, count: np.ndarray, prior: np.ndarray, m: float) -> np.ndarray:
    return (total + m * prior) / (count + m)


def key_stats(
    history: pd.DataFrame, target: pd.DataFrame, keys: list[str], expanding: bool
) -> tuple[np.ndarray, np.ndarray]:
    """(count, sum) of `hours` per key over history rows usable for each target row.

    expanding=True: history is target itself; each row only sees strictly earlier dates.
    expanding=False: statistics are frozen over the whole history (used for rows after it).
    """
    if expanding:
        daily = history.groupby(keys + ["date"], sort=True)["hours"].agg(["sum", "count"])
        grp = daily.groupby(level=keys, sort=False)
        prev = pd.DataFrame(
            {
                "sum": grp["sum"].cumsum() - daily["sum"],
                "count": grp["count"].cumsum() - daily["count"],
            }
        )
        merged = target[keys + ["date"]].merge(prev.reset_index(), on=keys + ["date"], how="left")
    else:
        agg = history.groupby(keys)["hours"].agg(["sum", "count"]).reset_index()
        merged = target[keys].merge(agg, on=keys, how="left")
    return merged["count"].fillna(0).to_numpy(), merged["sum"].fillna(0).to_numpy()


def rolling_user_mean(history: pd.DataFrame, target: pd.DataFrame, expanding: bool) -> np.ndarray:
    """User's mean hours over the ROLLING_DAYS before the row (or before history end)."""
    if expanding:
        daily = history.groupby(["user_email", "date"])["hours"].agg(["sum", "count"])
        parts = []
        for user, g in daily.groupby(level="user_email"):
            g = g.droplevel("user_email")
            roll = g.rolling(f"{ROLLING_DAYS}D", closed="left").sum()
            parts.append(
                pd.DataFrame(
                    {"user_email": user, "date": g.index, "mean": roll["sum"] / roll["count"]}
                )
            )
        stats = pd.concat(parts, ignore_index=True)
        merged = target[["user_email", "date"]].merge(stats, on=["user_email", "date"], how="left")
    else:
        end = history["date"].max()
        recent = history[history["date"] > end - pd.Timedelta(days=ROLLING_DAYS)]
        stats = recent.groupby("user_email")["hours"].mean().rename("mean").reset_index()
        merged = target[["user_email"]].merge(stats, on="user_email", how="left")
    return merged["mean"].to_numpy()


@dataclass
class FeatureBuilder:
    """Fits vocabulary/priors on a history frame; transforms rows at or after it."""

    history: pd.DataFrame
    keywords: list[str]
    global_mean: float

    @classmethod
    def fit(cls, history: pd.DataFrame) -> FeatureBuilder:
        counts: Counter[str] = Counter()
        for text in history["description"].dropna():
            counts.update(set(tokenize(text)))
        ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        keywords = sorted(w for w, _ in ranked[:N_KEYWORDS])
        return cls(history=history, keywords=keywords, global_mean=float(history["hours"].mean()))

    def transform(self, df: pd.DataFrame, expanding: bool) -> pd.DataFrame:
        hist = df if expanding else self.history
        out = pd.DataFrame(index=df.index)
        out["dow"] = df["date"].dt.dayofweek
        out["month"] = df["date"].dt.month
        out["is_weekend"] = (out["dow"] >= 5).astype(int)

        desc = df["description"].fillna("").str.strip()
        out["desc_missing"] = (desc == "").astype(int)
        out["desc_len"] = desc.str.len()
        out["desc_words"] = desc.str.split().str.len().fillna(0)
        tokens = desc.map(lambda s: set(tokenize(s)))
        for word in self.keywords:
            out[f"kw_{word}"] = tokens.map(lambda t, w=word: int(w in t))

        out["department"] = pd.Categorical(df["department"], categories=DEPARTMENT_CATEGORIES)

        # Hierarchical smoothed target encodings: global -> dept -> client, global -> user
        # -> user x client. Priors come from training-period data only.
        prior = np.full(len(df), self.global_mean)
        dept_n, dept_s = key_stats(hist, df, ["department"], expanding)
        dept_te = smoothed(dept_s, dept_n, prior, SMOOTHING)
        client_n, client_s = key_stats(hist, df, ["client_id"], expanding)
        user_n, user_s = key_stats(hist, df, ["user_email"], expanding)
        pair_n, pair_s = key_stats(hist, df, ["user_email", "client_id"], expanding)
        out["client_te"] = smoothed(client_s, client_n, dept_te, SMOOTHING)
        out["user_te"] = smoothed(user_s, user_n, prior, SMOOTHING)
        out["user_client_te"] = smoothed(pair_s, pair_n, out["user_te"].to_numpy(), SMOOTHING)
        out["client_freq"] = client_n
        out["user_freq"] = user_n
        out["user_client_freq"] = pair_n
        rolling = rolling_user_mean(hist, df, expanding)
        out["user_rolling_mean"] = np.where(np.isnan(rolling), out["user_te"], rolling)
        return out


DEPARTMENT_CATEGORIES: list[str] = []


# ------------------------------------------------------------------------- models


def metrics(y: np.ndarray, pred: np.ndarray) -> dict[str, float]:
    err = pred - y
    return {
        "n": int(len(y)),
        "mae": float(np.mean(np.abs(err))),
        "rmse": float(np.sqrt(np.mean(err**2))),
        "within_1h": float(np.mean(np.abs(err) <= 1.0)),
        "bias": float(np.mean(err)),
    }


def baseline_predictions(history: pd.DataFrame, df: pd.DataFrame) -> dict[str, np.ndarray]:
    g = history["hours"].mean()
    user = df["user_email"].map(history.groupby("user_email")["hours"].mean())
    pair_means = history.groupby(["user_email", "client_id"])["hours"].mean()
    pair = pd.Series(
        pd.MultiIndex.from_frame(df[["user_email", "client_id"]]).map(pair_means),
        index=df.index,
    )
    return {
        "global_mean": np.full(len(df), g),
        "user_client_mean": pair.fillna(user).fillna(g).to_numpy(dtype=float),
    }


def lgb_params(objective: str) -> dict:
    return {
        "objective": objective,
        "learning_rate": 0.03,
        "num_leaves": 31,
        "min_child_samples": 30,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 1,
        "lambda_l2": 1.0,
        "seed": SEED,
        "deterministic": True,
        "num_threads": 1,
        "verbose": -1,
    }


class GBM:
    """LightGBM with early stopping; sklearn HistGradientBoosting when unavailable."""

    name = "lightgbm" if lgb is not None else "sklearn_hist_gbm"

    def __init__(self) -> None:
        self.objective = "l2"
        self.best_iter = 0
        self.model = None
        self.valid_curve: dict[str, float] = {}

    def select_and_fit(self, x_fit, y_fit, x_val, y_val) -> float:
        if lgb is None:
            self.objective = "l1"
            self.model = HistGradientBoostingRegressor(
                loss="absolute_error",
                learning_rate=0.05,
                max_iter=2000,
                early_stopping=True,
                validation_fraction=0.15,
                random_state=SEED,
                categorical_features="from_dtype",
            ).fit(x_fit, y_fit)
            self.best_iter = int(self.model.n_iter_)
            return float(np.mean(np.abs(self.model.predict(x_val) - y_val)))
        best = None
        for objective in ("l2", "l1", "huber"):
            booster = lgb.train(
                {**lgb_params(objective), "metric": "l1"},
                lgb.Dataset(x_fit, y_fit, categorical_feature=CAT_FEATURES),
                num_boost_round=3000,
                valid_sets=[lgb.Dataset(x_val, y_val, categorical_feature=CAT_FEATURES)],
                callbacks=[lgb.early_stopping(100, verbose=False)],
            )
            mae = float(
                np.mean(
                    np.abs(booster.predict(x_val, num_iteration=booster.best_iteration) - y_val)
                )
            )
            self.valid_curve[objective] = mae
            if best is None or mae < best[0]:
                best = (mae, objective, booster.best_iteration)
        _, self.objective, self.best_iter = best
        return best[0]

    def refit(self, x, y, n_rows_fit: int) -> None:
        if lgb is None:
            self.model = HistGradientBoostingRegressor(
                loss="absolute_error",
                learning_rate=0.05,
                max_iter=self.best_iter,
                early_stopping=False,
                random_state=SEED,
                categorical_features="from_dtype",
            ).fit(x, y)
            return
        rounds = max(1, int(round(self.best_iter * len(x) / n_rows_fit)))
        self.best_iter = rounds
        self.model = lgb.train(
            lgb_params(self.objective),
            lgb.Dataset(x, y, categorical_feature=CAT_FEATURES),
            num_boost_round=rounds,
        )

    def predict(self, x) -> np.ndarray:
        return np.clip(self.model.predict(x), 0.01, 24.0)

    def importance(self, columns: list[str]) -> pd.Series:
        if lgb is None:
            return pd.Series(dtype=float)
        gain = pd.Series(self.model.feature_importance("gain"), index=columns)
        return (gain / gain.sum()).sort_values(ascending=False)


def make_ridge(columns: list[str], alpha: float):
    numeric = [c for c in columns if c not in CAT_FEATURES]
    pre = ColumnTransformer(
        [
            ("num", StandardScaler(), numeric),
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore"),
                CAT_FEATURES + ["dow", "month"],
            ),
        ]
    )
    return make_pipeline(pre, Ridge(alpha=alpha))


# --------------------------------------------------------------------- evaluation


def bootstrap_mae_gain(
    y: np.ndarray, pred_a: np.ndarray, pred_b: np.ndarray, dates: pd.Series
) -> tuple[float, float, float]:
    """Date-block bootstrap of MAE(b) - MAE(a); positive means a is better."""
    rng = np.random.default_rng(SEED)
    diff = np.abs(pred_b - y) - np.abs(pred_a - y)
    per_day = pd.DataFrame({"d": dates.to_numpy(), "diff": diff}).groupby("d")["diff"]
    sums, counts = per_day.sum().to_numpy(), per_day.count().to_numpy()
    idx = rng.integers(0, len(sums), size=(N_BOOTSTRAP, len(sums)))
    samples = sums[idx].sum(axis=1) / counts[idx].sum(axis=1)
    return (
        float(diff.mean()),
        float(np.quantile(samples, 0.025)),
        float(np.quantile(samples, 0.975)),
    )


def slice_masks(train: pd.DataFrame, test: pd.DataFrame) -> dict[str, np.ndarray]:
    train_users = train.groupby("user_email").size()
    seen_user = test["user_email"].isin(train_users.index).to_numpy()
    seen_client = test["client_id"].isin(train["client_id"]).to_numpy()
    n_hist = test["user_email"].map(train_users).fillna(0).to_numpy()
    return {
        "warm (seen user & client, >100 train rows)": seen_user
        & seen_client
        & (n_hist > SPARSE_USER_MAX_TRAIN_ROWS),
        f"sparse user (1-{SPARSE_USER_MAX_TRAIN_ROWS} train rows)": seen_user
        & (n_hist <= SPARSE_USER_MAX_TRAIN_ROWS),
        "unseen client (seen user)": seen_user & ~seen_client,
        "unseen user": ~seen_user,
    }


def fmt_table(rows: list[dict], columns: list[str]) -> str:
    def cell(v):
        if isinstance(v, float):
            return f"{v:.3f}"
        return str(v)

    lines = ["| " + " | ".join(columns) + " |", "|" + "|".join("---" for _ in columns) + "|"]
    lines += ["| " + " | ".join(cell(r[c]) for c in columns) + " |" for r in rows]
    return "\n".join(lines)


# --------------------------------------------------------------------------- main


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, default=ML_DIR / "data")
    parser.add_argument("--artifacts-dir", type=Path, default=ML_DIR / "artifacts")
    parser.add_argument("--report", type=Path, default=ML_DIR / "REPORT.md")
    args = parser.parse_args()

    train, test, clients = load(args.data_dir)
    DEPARTMENT_CATEGORIES[:] = sorted(set(clients["department"].dropna()) | {"Unknown"})
    fit, valid = time_split(train, VALID_FRACTION)
    y_fit, y_val = fit["hours"].to_numpy(), valid["hours"].to_numpy()
    y_train, y_test = train["hours"].to_numpy(), test["hours"].to_numpy()

    # Stage 1: model selection / early stopping on fit -> valid (valid featurised like test).
    fb_fit = FeatureBuilder.fit(fit)
    x_fit, x_val = fb_fit.transform(fit, expanding=True), fb_fit.transform(valid, expanding=False)
    gbm = GBM()
    gbm_val_mae = gbm.select_and_fit(x_fit, y_fit, x_val, y_val)
    ridge_val = {}
    for alpha in (0.1, 1.0, 10.0, 100.0, 1000.0, 10000.0):
        m = make_ridge(list(x_fit.columns), alpha).fit(x_fit, y_fit)
        ridge_val[alpha] = float(np.mean(np.abs(m.predict(x_val) - y_val)))
    ridge_alpha = min(ridge_val, key=ridge_val.get)
    val_baselines = {
        k: metrics(y_val, v)["mae"] for k, v in baseline_predictions(fit, valid).items()
    }

    # Stage 2: refit on the full training period; test uses stats frozen at train end.
    fb = FeatureBuilder.fit(train)
    x_train, x_test = fb.transform(train, expanding=True), fb.transform(test, expanding=False)
    gbm.refit(x_train, y_train, n_rows_fit=len(x_fit))
    ridge = make_ridge(list(x_train.columns), ridge_alpha).fit(x_train, y_train)

    preds_test = baseline_predictions(train, test)
    preds_test["ridge"] = np.clip(ridge.predict(x_test), 0.01, 24.0)
    preds_test[gbm.name] = gbm.predict(x_test)
    preds_train = baseline_predictions(train, train)
    preds_train["ridge"] = np.clip(ridge.predict(x_train), 0.01, 24.0)
    preds_train[gbm.name] = gbm.predict(x_train)

    overall = []
    for name in preds_test:
        tr, te = metrics(y_train, preds_train[name]), metrics(y_test, preds_test[name])
        overall.append(
            {
                "model": name,
                "train MAE": tr["mae"],
                "test MAE": te["mae"],
                "test RMSE": te["rmse"],
                "test within ±1h": te["within_1h"],
                "test bias": te["bias"],
            }
        )

    best_baseline = min(
        ("global_mean", "user_client_mean"), key=lambda k: metrics(y_test, preds_test[k])["mae"]
    )
    gain, lo, hi = bootstrap_mae_gain(
        y_test, preds_test[gbm.name], preds_test[best_baseline], test["date"]
    )
    beats = lo > 0

    per_tenant = []
    for user, idx in test.groupby("user_email").groups.items():
        pos = test.index.get_indexer(idx)
        row = {
            "tenant": user.split("@")[0],
            "train rows": int((train["user_email"] == user).sum()),
            "test rows": len(pos),
        }
        for name in ("user_client_mean", "ridge", gbm.name):
            m = metrics(y_test[pos], preds_test[name][pos])
            row[f"{name} MAE"] = m["mae"]
            row[f"{name} RMSE"] = m["rmse"]
        per_tenant.append(row)
    per_tenant.sort(key=lambda r: r["train rows"])
    tenants_won = sum(r[f"{gbm.name} MAE"] < r["user_client_mean MAE"] for r in per_tenant)

    slices = []
    for label, mask in slice_masks(train, test).items():
        if not mask.any():
            continue
        row = {"slice": label, "test rows": int(mask.sum())}
        for name in ("global_mean", "user_client_mean", "ridge", gbm.name):
            row[f"{name} MAE"] = metrics(y_test[mask], preds_test[name][mask])["mae"]
        slices.append(row)

    importance = gbm.importance(list(x_train.columns))

    # ------------------------------------------------------------------ outputs
    args.artifacts_dir.mkdir(parents=True, exist_ok=True)
    results = {
        "model": gbm.name,
        "objective": gbm.objective,
        "boosting_rounds": gbm.best_iter,
        "validation": {
            "gbm_mae": gbm_val_mae,
            "gbm_objective_mae": gbm.valid_curve,
            "ridge_alpha_mae": {str(k): v for k, v in ridge_val.items()},
            "baselines_mae": val_baselines,
        },
        "overall": overall,
        "beats_baseline": {
            "baseline": best_baseline,
            "mae_gain": gain,
            "ci95": [lo, hi],
            "significant": bool(beats),
        },
        "per_tenant": per_tenant,
        "cold_start": slices,
        "feature_importance": importance.round(5).to_dict(),
    }
    (args.artifacts_dir / "metrics.json").write_text(json.dumps(results, indent=2) + "\n")
    test.assign(**{f"pred_{k}": np.round(v, 3) for k, v in preds_test.items()}).to_csv(
        args.artifacts_dir / "test_predictions.csv", index=False
    )

    stats = dataset_stats(train, test, clients, args.data_dir)
    report = render_report(
        stats,
        results,
        overall,
        per_tenant,
        slices,
        importance,
        tenants_won,
        ridge_alpha,
        list(x_train.columns),
        fb.keywords,
    )
    args.report.write_text(report)

    print(f"Rows: train={len(train)} (fit={len(fit)}, valid={len(valid)}) test={len(test)}")
    print(
        f"{gbm.name}: objective={gbm.objective} rounds={gbm.best_iter} valid MAE={gbm_val_mae:.3f}"
    )
    print(f"ridge: alpha={ridge_alpha} valid MAE={ridge_val[ridge_alpha]:.3f}")
    print("\nOverall")
    print(pd.DataFrame(overall).round(3).to_string(index=False))
    print("\nCold-start slices (test MAE)")
    print(pd.DataFrame(slices).round(3).to_string(index=False))
    print("\nPer tenant (test)")
    print(pd.DataFrame(per_tenant).round(3).to_string(index=False))
    print("\nTop features (gain share)")
    print(importance.head(12).round(3).to_string())
    verdict = "PASS" if beats else "FAIL"
    print(
        f"\n[{verdict}] {gbm.name} vs {best_baseline}: test MAE gain {gain:.3f}h "
        f"(95% date-block bootstrap CI {lo:.3f}..{hi:.3f}); "
        f"better on {tenants_won}/{len(per_tenant)} tenants"
    )
    print(f"Wrote {args.report} and {args.artifacts_dir}/")


def dataset_stats(train, test, clients, data_dir: Path) -> dict:
    both = pd.concat([train, test])
    meta_path = data_dir / "generator_config.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    q = both["hours"].quantile([0.1, 0.25, 0.5, 0.75, 0.9]).to_dict()
    top_values = both["hours"].value_counts(normalize=True).head(6)
    return {
        "rows": len(both),
        "train_rows": len(train),
        "test_rows": len(test),
        "tenants": both["user_email"].nunique(),
        "train_tenants": train["user_email"].nunique(),
        "clients": both["client_id"].nunique(),
        "departments": both["department"].nunique(),
        "train_range": (train["date"].min().date(), train["date"].max().date()),
        "test_range": (test["date"].min().date(), test["date"].max().date()),
        "hours_mean": both["hours"].mean(),
        "hours_std": both["hours"].std(),
        "hours_min": both["hours"].min(),
        "hours_max": both["hours"].max(),
        "hours_q": q,
        "top_values": top_values,
        "weekend_share": (both["date"].dt.dayofweek >= 5).mean(),
        "desc_missing": both["description"].fillna("").str.strip().eq("").mean(),
        "rows_per_tenant": both.groupby("user_email").size().describe(),
        "seed": meta.get("config", {}).get("seed"),
    }


def render_report(
    s,
    results,
    overall,
    per_tenant,
    slices,
    importance,
    tenants_won,
    ridge_alpha,
    columns,
    keywords,
) -> str:
    gbm_name = results["model"]
    bb = results["beats_baseline"]
    q = s["hours_q"]
    significance = "statistically significant" if bb["significant"] else "NOT significant"
    hours_range = f"min {s['hours_min']:.2f}, max {s['hours_max']:.2f}"
    quantiles = " / ".join(f"{v:.2f}" for v in q.values())
    top_vals = ", ".join(f"{v:g}h ({p:.0%})" for v, p in s["top_values"].items())
    rpt = s["rows_per_tenant"]
    overall_tbl = fmt_table(
        overall,
        ["model", "train MAE", "test MAE", "test RMSE", "test within ±1h", "test bias"],
    )
    tenant_cols = ["tenant", "train rows", "test rows"] + [
        f"{n} {m}" for n in ("user_client_mean", "ridge", gbm_name) for m in ("MAE", "RMSE")
    ]
    tenant_tbl = fmt_table(per_tenant, tenant_cols)
    slice_cols = ["slice", "test rows"] + [
        f"{n} MAE" for n in ("global_mean", "user_client_mean", "ridge", gbm_name)
    ]
    slice_tbl = fmt_table(slices, slice_cols)
    imp_rows = [{"feature": k, "gain share": float(v)} for k, v in importance.head(15).items()]
    imp_tbl = fmt_table(imp_rows, ["feature", "gain share"]) if imp_rows else "_n/a_"
    kw_share = float(importance[[c for c in importance.index if c.startswith("kw_")]].sum())
    val = results["validation"]
    obj_curve = ", ".join(f"{k}={v:.3f}" for k, v in val["gbm_objective_mae"].items())
    gbm_row = next(r for r in overall if r["model"] == gbm_name)
    base_row = next(r for r in overall if r["model"] == bb["baseline"])
    gap = gbm_row["test MAE"] / gbm_row["train MAE"] - 1
    overfit_note = f"test is {gap:.0%} worse than train; " + (
        "modest gap, expected since test rows use statistics frozen at the cut-off"
        if gap < 0.25
        else "large gap — likely overfitting, revisit regularisation"
    )
    slice_notes = "\n".join(
        f"  - {r['slice']}: {r[gbm_name + ' MAE']:.3f}h vs {r['user_client_mean MAE']:.3f}h "
        f"baseline ({r['user_client_mean MAE'] - r[gbm_name + ' MAE']:+.3f}h gain, "
        f"{r['test rows']} rows)"
        for r in slices
    )

    return f"""# Timesheet `hours` prediction — ML report

_Generated by `python ml/train.py` (seed {s["seed"]}). Re-running the pipeline
reproduces this file exactly._

## TL;DR

- **{gbm_name}** reaches test MAE **{gbm_row["test MAE"]:.3f}h** vs
  **{base_row["test MAE"]:.3f}h** for the strongest baseline (`{bb["baseline"]}`):
  a gain of **{bb["mae_gain"]:.3f}h** (95% date-block bootstrap CI
  {bb["ci95"][0]:.3f}..{bb["ci95"][1]:.3f}) — {significance}.
- It beats the per-user-per-client baseline on **{tenants_won}/{len(per_tenant)} tenants**.
- Train vs test MAE for {gbm_name}: {gbm_row["train MAE"]:.3f} vs {gbm_row["test MAE"]:.3f}
  ({overfit_note}).

## 1. Dataset

Synthetic data from `ml/generate_data.py`, mirroring the app schema
(`backend/src/database/init.js`) and validation bounds
(`backend/src/validation/schemas.js`).

| stat | value |
|---|---|
| work entries | {s["rows"]} (train {s["train_rows"]}, test {s["test_rows"]}) |
| tenants (`user_email`) | {s["tenants"]} ({s["train_tenants"]} present in train) |
| clients / departments | {s["clients"]} / {s["departments"]} |
| train dates | {s["train_range"][0]} → {s["train_range"][1]} |
| test dates | {s["test_range"][0]} → {s["test_range"][1]} |
| rows per tenant | min {rpt["min"]:.0f}, median {rpt["50%"]:.0f}, max {rpt["max"]:.0f} |
| hours mean ± sd | {s["hours_mean"]:.2f} ± {s["hours_std"]:.2f} ({hours_range}) |
| hours p10/p25/p50/p75/p90 | {quantiles} |
| most common values | {top_vals} |
| weekend entries | {s["weekend_share"]:.1%} |
| description missing/empty | {s["desc_missing"]:.1%} |

Generative process (hidden from the model): `hours = user_base × client_factor ×
department_factor × task_type_factor × day_of_week × month_season × lognormal noise`,
occasional full-day (8h) entries, then per-user rounding habits snap values to
0.5/1/2/4/8h buckets or quarter hours. `task_type` is only observable through the
description template. Tenant segments: 14 regular, 3 sparse (≈12% activity), 2 late
joiners (start 3–6 weeks before the split), 1 brand-new user (starts after the split);
~8% of clients only become active in the test period.

## 2. Methodology

**Splits.** Time-based: the generator puts the last 20% of the calendar span in
`test.csv`. Inside train, the last {VALID_FRACTION:.0%} of the span is a validation
slice used for early stopping, LightGBM objective choice ({obj_curve} valid MAE) and
Ridge `alpha` (chosen {ridge_alpha}). The final models are refit on the whole train
period (boosting rounds scaled by the row ratio) and scored once on test.

**Features** ({len(columns)} total):
- calendar: `dow`, `month`, `is_weekend`;
- description: `desc_len`, `desc_words`, `desc_missing`, and {len(keywords)} binary
  keyword flags (`kw_*`, vocabulary = most frequent tokens in the training period);
- `department` (categorical);
- hierarchically smoothed target encodings (m={SMOOTHING:g}):
  `client_te` (→ department → global), `user_te` (→ global), `user_client_te` (→ user);
- frequency encodings: `client_freq`, `user_freq`, `user_client_freq`;
- `user_rolling_mean`: user's mean hours over the previous {ROLLING_DAYS} days.

**Leakage controls.**
- On training rows every target/frequency/rolling statistic is *expanding*: it only uses
  rows from strictly earlier dates (same-day rows excluded), so a row never sees its own label.
- Validation and test rows use statistics frozen at the end of the corresponding
  history (fit period / full train period); **no test labels are ever used to build
  features**. Unseen users/clients fall back to their priors with frequency 0.
- Keyword vocabulary and the global prior are fit on history only.
- Baselines use the same training-period data only.

**Metrics.** MAE (primary), RMSE, share of predictions within ±1h, mean bias. The
significance check is a paired bootstrap over test *dates* ({N_BOOTSTRAP} resamples),
since entries within a day are correlated.

## 3. Results

### Overall

{overall_tbl}

Validation MAE (fit→valid): {gbm_name} {val["gbm_mae"]:.3f}, ridge
{val["ridge_alpha_mae"][str(ridge_alpha)]:.3f}, baselines
{", ".join(f"{k} {v:.3f}" for k, v in val["baselines_mae"].items())}.

### Cold-start slices (test MAE)

{slice_tbl}

### Per tenant (test)

Sorted by training history size.

{tenant_tbl}

### Feature importance ({gbm_name}, share of total gain, top 15)

{imp_tbl}

Keyword flags jointly account for {kw_share:.1%} of gain.

## 4. Notes and limitations

- **Cold start.** {gbm_name} vs `user_client_mean` per slice:
{slice_notes}
  For unseen users every tenant-specific feature collapses to the global prior, so the
  model relies on department, calendar and description signal alone; unseen clients
  fall back to the department prior and the user's own history. Slices are small (tens
  of rows), so treat their numbers as indicative. A production system should refresh
  statistics online as entries arrive (here they are frozen at the train cut-off by
  design, which understates achievable accuracy late in the test window).
- **Bias.** The chosen objective is `{results["objective"]}`; an L1 model predicts the
  conditional median, which is below the mean for this right-skewed target, hence the
  negative test bias ({gbm_row["test bias"]:+.3f}h). Use an L2 objective if unbiased
  totals (e.g. monthly billing forecasts) matter more than per-entry MAE.
- **Synthetic data.** The data-generating process is known and multiplicative with
  deliberately learnable structure (task type leaks into description templates).
  Absolute numbers will not transfer to real data; the pipeline, splits and leakage
  controls will.
- **Sparse schema.** `work_entries` has no task type, project, complexity or
  start/end time; `description` is free text and ~15% missing. Much of the remaining
  error is irreducible noise plus per-user rounding habits (values snap to buckets).
- **Metric choice.** Because values cluster at 0.5/1/2/4/8, an L1-type objective
  (median) typically wins on MAE while an L2 model would win on RMSE; the objective is
  chosen on validation MAE.
- Single seed/single split; no hyperparameter search beyond objective/alpha.
"""


if __name__ == "__main__":
    main()
