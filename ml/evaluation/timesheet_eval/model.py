from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

TARGET = "hours"
CATEGORICAL_FEATURES = ["client_segment", "project_type", "day_of_week"]
NUMERIC_FEATURES = ["description_word_count", "month_sin", "month_cos"]
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def build_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Derive model inputs from normalized work entries (no target leakage)."""
    month_angle = 2 * np.pi * (frame["date"].dt.month - 1) / 12
    return pd.DataFrame(
        {
            "client_segment": frame["client_segment"].astype(str),
            "project_type": frame["project_type"].astype(str),
            "day_of_week": frame["date"].dt.dayofweek.map(lambda d: DAY_NAMES[d]),
            "description_word_count": frame["description"].str.split().str.len().fillna(0),
            "month_sin": np.sin(month_angle),
            "month_cos": np.cos(month_angle),
        },
        index=frame.index,
    )


def build_baseline_model() -> Pipeline:
    preprocess = ColumnTransformer(
        [
            ("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
            ("numeric", StandardScaler(), NUMERIC_FEATURES),
        ]
    )
    return Pipeline([("preprocess", preprocess), ("regressor", LinearRegression())])


def build_mean_reference() -> DummyRegressor:
    return DummyRegressor(strategy="mean")


def fit(model: Pipeline | DummyRegressor, train: pd.DataFrame) -> Pipeline | DummyRegressor:
    model.fit(build_features(train), train[TARGET].to_numpy(dtype=float))
    return model


def predict(model: Pipeline | DummyRegressor, frame: pd.DataFrame) -> np.ndarray:
    return np.asarray(model.predict(build_features(frame)), dtype=float)


def encoded_feature_count(model: Pipeline) -> int:
    return len(model.named_steps["preprocess"].get_feature_names_out())
