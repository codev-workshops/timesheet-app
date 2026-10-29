import sqlite3

import pandas as pd

import extract
import synthetic_data as sd


def test_shape_columns_and_ranges():
    df = sd.generate_dataset(2000, seed=42)
    assert len(df) == 2000
    assert list(df.columns) == sd.COLUMNS
    assert df["hours"].between(0.25, 12).all()
    assert ((df["hours"] * 4) % 1 == 0).all()
    assert set(df["department"]) <= set(sd.DEPARTMENTS)
    assert df["department"].nunique() >= 4
    assert df["client_id"].nunique() >= 15
    span = df["date"].max() - df["date"].min()
    assert pd.Timedelta(days=150) <= span <= pd.Timedelta(days=190)
    assert (df["date"].dt.dayofweek >= 5).mean() < 0.1
    assert df["description"].str.len().gt(0).mean() > 0.9


def test_reproducible_with_seed():
    pd.testing.assert_frame_equal(sd.generate_dataset(300, seed=7), sd.generate_dataset(300, seed=7))
    assert not sd.generate_dataset(300, seed=7).equals(sd.generate_dataset(300, seed=8))


def test_work_types_have_distinct_hours():
    df = sd.generate_dataset(2000, seed=42)
    desc = df["description"].str.lower()
    standup = df.loc[desc.str.contains("standup|scrum"), "hours"].mean()
    feature = df.loc[desc.str.contains("feature|implemented|built"), "hours"].mean()
    assert standup < 1.0
    assert feature > 3.0


def test_each_client_belongs_to_one_user_and_department():
    df = sd.generate_dataset(1000, seed=1)
    per_client = df.groupby("client_id")[["user_email", "department"]].nunique()
    assert (per_client == 1).all().all()


def test_insert_into_sqlite_uses_epoch_ms_and_round_trips(tmp_path):
    db = tmp_path / "timesheet.db"
    df = sd.generate_dataset(250, seed=3)
    sd.insert_into_sqlite(df, db)

    conn = sqlite3.connect(db)
    try:
        assert conn.execute("SELECT typeof(date) FROM work_entries LIMIT 1").fetchone()[0] == "integer"
        assert conn.execute("SELECT COUNT(*) FROM work_entries").fetchone()[0] == 250
    finally:
        conn.close()

    loaded, source = extract.load_dataset(str(db))
    assert source == "db"
    assert len(loaded) == 250
    assert sorted(loaded["date"].dt.date) == sorted(df["date"].dt.date)
    assert loaded["hours"].sum() == df["hours"].sum()
