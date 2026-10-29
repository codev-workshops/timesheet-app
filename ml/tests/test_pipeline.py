import numpy as np
import pandas as pd

import synthetic_data as sd
from pipeline import FEATURE_COLUMNS, build_pipeline, to_frame


def _fit_small(log_target=True):
    df = sd.generate_dataset(300, seed=5)
    pipe = build_pipeline(log_target=log_target, n_estimators=30, max_depth=3)
    pipe.fit(df[FEATURE_COLUMNS], df["hours"])
    return pipe, df


def test_fit_predict_shape_and_finite():
    for log_target in (True, False):
        pipe, df = _fit_small(log_target)
        pred = pipe.predict(df[FEATURE_COLUMNS].head(25))
        assert pred.shape == (25,)
        assert np.isfinite(pred).all()


def test_unknown_categories_null_fields_and_mixed_dates():
    pipe, _ = _fit_small()
    frame = to_frame([
        {"client_id": 99999, "user_email": "new@example.com", "department": "Quantum",
         "description": "something never seen", "date": "2027-01-02"},
        {"client_id": 1, "user_email": "alice@example.com", "department": None,
         "description": None, "date": 1793232000000},
        {"client_id": 2, "user_email": "bob@example.com", "description": "Code review",
         "date": "2026-10-29T09:00:00Z"},
    ])
    pred = pipe.predict(frame)
    assert pred.shape == (3,) and np.isfinite(pred).all()


def test_date_features():
    from pipeline import DateFeatures

    out = DateFeatures().transform(pd.DataFrame({"date": ["2026-10-31", "2026-10-29"]}))
    assert out.tolist() == [[5.0, 1.0, 10.0], [3.0, 0.0, 10.0]]


def test_description_signal_is_learned():
    df = sd.generate_dataset(1500, seed=11)
    pipe = build_pipeline(n_estimators=200, max_depth=4)
    pipe.fit(df[FEATURE_COLUMNS], df["hours"])
    base = {"client_id": int(df["client_id"].iloc[0]), "user_email": df["user_email"].iloc[0],
            "department": df["department"].iloc[0], "date": "2026-06-10"}
    standup, feature = pipe.predict(to_frame([
        {**base, "description": "Team standup"},
        {**base, "description": "Feature development"},
    ]))
    assert feature > standup + 1.0
