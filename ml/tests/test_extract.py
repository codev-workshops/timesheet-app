import sqlite3

import pandas as pd

import extract
import synthetic_data as sd


def test_normalize_dates_handles_epoch_ms_and_iso():
    out = extract.normalize_dates([
        1793232000000,                # 2026-10-29T00:00:00Z as epoch ms
        "1793232000000",
        "2026-10-29",
        "2026-10-29T10:30:00.000Z",
        "2026-10-29T10:30:00+05:30",
    ])
    assert list(out.dt.date.astype(str)) == ["2026-10-29"] * 5
    assert out.dt.tz is None


def test_missing_or_memory_db_falls_back_to_synthetic(tmp_path, monkeypatch):
    monkeypatch.delenv("DATABASE_PATH", raising=False)
    for path in [None, ":memory:", str(tmp_path / "nope.db")]:
        df, source = extract.load_dataset(path, n_synthetic=50)
        assert source == "synthetic" and len(df) == 50


def test_small_db_falls_back_to_synthetic(tmp_path):
    db = tmp_path / "small.db"
    sd.insert_into_sqlite(sd.generate_dataset(20, seed=1), db)
    _, source = extract.load_dataset(str(db), n_synthetic=50)
    assert source == "synthetic"


def test_db_without_tables_falls_back(tmp_path):
    db = tmp_path / "empty.db"
    sqlite3.connect(db).close()
    _, source = extract.load_dataset(str(db), n_synthetic=50)
    assert source == "synthetic"


def test_database_path_env_var(tmp_path, monkeypatch):
    db = tmp_path / "app.db"
    sd.insert_into_sqlite(sd.generate_dataset(210, seed=2), db)
    monkeypatch.setenv("DATABASE_PATH", str(db))
    df, source = extract.load_dataset()
    assert source == "db" and len(df) == 210
    assert pd.api.types.is_datetime64_any_dtype(df["date"])
