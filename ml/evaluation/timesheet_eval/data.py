"""Load and normalize historical work entry data.

Supported sources:
- CSV / JSON exports (a list of records or the API's ``{"workEntries": [...]}`` envelope)
- A file-based SQLite copy of the timesheet-app database (``work_entries`` joined to
  ``clients``), opened read-only.
"""

from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .config import DEFAULT_CLIENT_SEGMENT, DEFAULT_PROJECT_TYPE

SQLITE_SUFFIXES = {".db", ".sqlite", ".sqlite3"}
MAX_HOURS_PER_ENTRY = 24.0

COLUMN_ALIASES = {
    "clientid": "client_id",
    "clientname": "client_name",
    "client": "client_name",
    "useremail": "user_email",
    "segment": "client_segment",
    "clientsegment": "client_segment",
    "projecttype": "project_type",
    "work_date": "date",
}

SQLITE_QUERY = """
    SELECT we.id AS id,
           we.client_id AS client_id,
           c.name AS client_name,
           c.department AS department,
           we.user_email AS user_email,
           we.hours AS hours,
           we.description AS description,
           we.date AS date
    FROM work_entries we
    JOIN clients c ON c.id = we.client_id AND c.user_email = we.user_email
"""


@dataclass(frozen=True)
class LoadedData:
    frame: pd.DataFrame
    source: str
    rows_loaded: int
    rows_dropped: int


def _normalize_column_name(name: str) -> str:
    key = re.sub(r"[\s\-]+", "_", str(name).strip().lower())
    return COLUMN_ALIASES.get(key.replace("_", ""), COLUMN_ALIASES.get(key, key))


def read_raw(path: str | Path, user_email: str | None = None) -> pd.DataFrame:
    """Read raw rows from a CSV, JSON, or SQLite source without cleaning."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Data source not found: {path}")
    suffix = path.suffix.lower()
    if suffix == ".csv":
        frame = pd.read_csv(path)
    elif suffix == ".json":
        with path.open(encoding="utf-8") as fh:
            payload = json.load(fh)
        if isinstance(payload, dict):
            if "workEntries" not in payload:
                raise ValueError("JSON object input must contain a 'workEntries' array")
            payload = payload["workEntries"]
        frame = pd.DataFrame.from_records(payload)
    elif suffix in SQLITE_SUFFIXES:
        frame = _read_sqlite(path, user_email)
    else:
        raise ValueError(
            f"Unsupported data source {path.name!r}; expected .csv, .json, or one of "
            f"{sorted(SQLITE_SUFFIXES)}"
        )
    frame = frame.rename(columns=_normalize_column_name)
    if user_email is not None and suffix not in SQLITE_SUFFIXES:
        if "user_email" not in frame.columns:
            raise ValueError("--user-email was given but the data has no user_email column")
        frame = frame[frame["user_email"] == user_email]
    return frame


def _read_sqlite(path: Path, user_email: str | None) -> pd.DataFrame:
    uri = f"{path.resolve().as_uri()}?mode=ro"
    query = SQLITE_QUERY
    params: tuple[str, ...] = ()
    if user_email is not None:
        query += " WHERE we.user_email = ?"
        params = (user_email,)
    with sqlite3.connect(uri, uri=True) as conn:
        return pd.read_sql_query(query, conn, params=params)


def classify_project_type(description: object, rules: dict[str, list[str]]) -> str:
    """Map a free-text description to a project type using ordered keyword rules."""
    if not isinstance(description, str) or not description.strip():
        return DEFAULT_PROJECT_TYPE
    text = description.lower()
    for project_type, keywords in rules.items():
        for keyword in keywords:
            if re.search(rf"\b{re.escape(keyword.lower())}", text):
                return project_type
    return DEFAULT_PROJECT_TYPE


def _clean_label(series: pd.Series, default: str) -> pd.Series:
    cleaned = series.astype("string").str.strip()
    return cleaned.mask(cleaned.isna() | (cleaned == ""), default).astype(str)


def normalize(frame: pd.DataFrame, project_type_rules: dict[str, list[str]]) -> pd.DataFrame:
    """Coerce types, drop unusable rows, and derive segment / project-type labels."""
    missing = {"hours", "date"} - set(frame.columns)
    if missing:
        raise ValueError(f"Data is missing required column(s): {sorted(missing)}")

    df = frame.copy()
    df["hours"] = pd.to_numeric(df["hours"], errors="coerce")
    df["date"] = pd.to_datetime(df["date"], errors="coerce", format="mixed")
    if "description" not in df.columns:
        df["description"] = ""
    df["description"] = df["description"].fillna("").astype(str)

    valid = (
        df["hours"].notna()
        & (df["hours"] > 0)
        & (df["hours"] <= MAX_HOURS_PER_ENTRY)
        & df["date"].notna()
    )
    df = df[valid].copy()

    if "client_segment" in df.columns:
        segment_source = df["client_segment"]
    elif "department" in df.columns:
        segment_source = df["department"]
    else:
        segment_source = pd.Series(pd.NA, index=df.index)
    df["client_segment"] = _clean_label(segment_source, DEFAULT_CLIENT_SEGMENT)

    derived = df["description"].map(lambda d: classify_project_type(d, project_type_rules))
    if "project_type" in df.columns:
        provided = df["project_type"].astype("string").str.strip()
        df["project_type"] = provided.mask(provided.isna() | (provided == ""), derived).astype(str)
    else:
        df["project_type"] = derived

    if "id" not in df.columns:
        df["id"] = range(1, len(df) + 1)
    return df.sort_values(["date", "id"], kind="mergesort").reset_index(drop=True)


def load_work_entries(
    path: str | Path,
    project_type_rules: dict[str, list[str]],
    user_email: str | None = None,
) -> LoadedData:
    raw = read_raw(path, user_email=user_email)
    frame = normalize(raw, project_type_rules)
    return LoadedData(
        frame=frame,
        source=Path(path).name,
        rows_loaded=len(raw),
        rows_dropped=len(raw) - len(frame),
    )
