"""Feature pipeline + XGBoost regressor for estimating work-entry hours.

Pickled pipelines reference this module as ``pipeline`` (top level), so always import
it with ``ml/`` on ``sys.path`` (train.py, serve.py and the tests do this).
"""

from __future__ import annotations

from typing import ClassVar

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBRegressor

from extract import normalize_dates

CATEGORICAL_FEATURES = ["client_id", "user_email", "department"]
TEXT_FEATURE = "description"
DATE_FEATURE = "date"
FEATURE_COLUMNS = CATEGORICAL_FEATURES + [TEXT_FEATURE, DATE_FEATURE]
TARGET = "hours"
MISSING = "__missing__"


class CategoricalCleaner(BaseEstimator, TransformerMixin):
    """Cast categoricals to stripped strings; null/blank -> ``__missing__``."""

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        df = pd.DataFrame(X).copy()
        for col in df.columns:
            values = df[col].astype(object).where(df[col].notna(), MISSING)
            values = values.map(lambda v: str(v).strip() or MISSING)
            df[col] = values
        return df

    def get_feature_names_out(self, input_features=None):
        return np.asarray(input_features, dtype=object)


class TextCleaner(BaseEstimator, TransformerMixin):
    """Null -> ``""`` and lowercase; returns a 1-D array for TfidfVectorizer."""

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        series = pd.Series(np.asarray(X).ravel(), dtype=object)
        return series.where(series.notna(), "").astype(str).str.lower().to_numpy()


class DateFeatures(BaseEstimator, TransformerMixin):
    """Date (epoch ms, ISO string or datetime) -> day_of_week, is_weekend, month."""

    feature_names: ClassVar[list[str]] = ["day_of_week", "is_weekend", "month"]

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        dates = normalize_dates(np.asarray(X).ravel())
        dow = dates.dt.dayofweek.to_numpy(dtype=float)
        return np.column_stack([dow, (dow >= 5).astype(float), dates.dt.month.to_numpy(dtype=float)])

    def get_feature_names_out(self, input_features=None):
        return np.asarray(self.feature_names, dtype=object)


def build_preprocessor(max_tfidf_features: int = 500) -> ColumnTransformer:
    categorical = Pipeline([
        ("clean", CategoricalCleaner()),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    text = Pipeline([
        ("clean", TextCleaner()),
        ("tfidf", TfidfVectorizer(max_features=max_tfidf_features, ngram_range=(1, 2),
                                  token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z]+\b")),
    ])
    return ColumnTransformer(
        [
            ("cat", categorical, CATEGORICAL_FEATURES),
            ("text", text, [TEXT_FEATURE]),
            ("date", DateFeatures(), [DATE_FEATURE]),
        ],
        sparse_threshold=1.0,
    )


def build_regressor(seed: int = 42, **params) -> XGBRegressor:
    defaults = {"n_estimators": 300, "max_depth": 4, "learning_rate": 0.05, "min_child_weight": 1.0,
                "subsample": 0.9, "colsample_bytree": 0.8, "tree_method": "hist",
                "objective": "reg:squarederror", "n_jobs": 1, "random_state": seed}
    defaults.update(params)
    return XGBRegressor(**defaults)


def wrap_target(regressor, log_target: bool):
    if not log_target:
        return regressor
    return TransformedTargetRegressor(regressor=regressor, func=np.log1p, inverse_func=np.expm1,
                                      check_inverse=False)


def build_pipeline(log_target: bool = True, seed: int = 42, max_tfidf_features: int = 500,
                   **xgb_params) -> Pipeline:
    return Pipeline([
        ("features", build_preprocessor(max_tfidf_features)),
        ("model", wrap_target(build_regressor(seed, **xgb_params), log_target)),
    ])


def to_frame(rows) -> pd.DataFrame:
    """Coerce records/DataFrame to the model's input columns (missing columns -> None)."""
    df = pd.DataFrame(rows)
    for col in FEATURE_COLUMNS:
        if col not in df.columns:
            df[col] = None
    return df[FEATURE_COLUMNS]
