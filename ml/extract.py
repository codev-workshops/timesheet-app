"""Extract (client, user, description, date, department) -> hours training rows.

Reads the app's SQLite DB (``DATABASE_PATH`` env var or ``--db``). Falls back to the
synthetic generator when the DB is missing, in-memory, unreadable or has fewer than
``MIN_DB_ROWS`` rows. ``work_entries.date`` is epoch milliseconds in this app (a JS
Date bound as a number), but ISO strings are handled too.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

import synthetic_data

MIN_DB_ROWS = 200

EXTRACT_SQL = (
    "SELECT we.client_id, we.user_email, we.description, we.date, c.name AS client_name, "
    "c.department, we.hours FROM work_entries we JOIN clients c ON we.client_id = c.id"
)


def _to_datetime_scalar(value) -> pd.Timestamp:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return pd.NaT
    if isinstance(value, pd.Timestamp):
        ts = value
    elif isinstance(value, (int, float, np.integer, np.floating)) and not isinstance(value, bool):
        ts = pd.Timestamp(int(value), unit="ms", tz="UTC")
    else:
        text = str(value).strip()
        if not text:
            return pd.NaT
        if text.lstrip("-").isdigit():
            ts = pd.Timestamp(int(text), unit="ms", tz="UTC")
        else:
            ts = pd.Timestamp(text)
    if ts.tzinfo is not None:
        ts = ts.tz_convert("UTC").tz_localize(None)
    return ts


def normalize_dates(values) -> pd.Series:
    """Epoch-ms integers, digit strings, ISO dates/datetimes or datetimes -> tz-naive UTC datetimes."""
    series = pd.Series(values)
    if pd.api.types.is_datetime64_any_dtype(series):
        if series.dt.tz is not None:
            series = series.dt.tz_convert("UTC").dt.tz_localize(None)
        return series
    return pd.to_datetime(series.map(_to_datetime_scalar))


def read_db(db_path: str | Path) -> pd.DataFrame:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        return pd.read_sql_query(EXTRACT_SQL, conn)
    finally:
        conn.close()


def load_dataset(
    db_path: str | None = None,
    min_rows: int = MIN_DB_ROWS,
    n_synthetic: int = synthetic_data.DEFAULT_ROWS,
    seed: int = synthetic_data.DEFAULT_SEED,
    force_synthetic: bool = False,
) -> tuple[pd.DataFrame, str]:
    """Return ``(df, source)`` where source is ``"db"`` or ``"synthetic"``."""
    db_path = db_path if db_path is not None else os.environ.get("DATABASE_PATH")
    df = None
    if not force_synthetic and db_path and db_path != ":memory:" and Path(db_path).is_file():
        try:
            df = read_db(db_path)
        except (sqlite3.Error, pd.errors.DatabaseError) as exc:
            print(f"[extract] could not read {db_path}: {exc}; using synthetic data")
            df = None
        if df is not None and len(df) < min_rows:
            print(f"[extract] {db_path} has {len(df)} rows (< {min_rows}); using synthetic data")
            df = None

    if df is None:
        return synthetic_data.generate_dataset(n_synthetic, seed), "synthetic"

    df = df.copy()
    df["date"] = normalize_dates(df["date"])
    df["hours"] = pd.to_numeric(df["hours"], errors="coerce")
    df["description"] = df["description"].fillna("").astype(str)
    df = df.dropna(subset=["date", "hours", "client_id"]).reset_index(drop=True)
    df["client_id"] = df["client_id"].astype(int)
    return df, "db"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", help="SQLite DB path (default: $DATABASE_PATH)")
    parser.add_argument("--out", help="write extracted rows to this CSV")
    args = parser.parse_args(argv)
    df, source = load_dataset(args.db)
    print(f"[extract] {len(df)} rows from {source}")
    if args.out:
        synthetic_data.write_csv(df, args.out)
        print(f"[extract] wrote {args.out}")


if __name__ == "__main__":
    main()
