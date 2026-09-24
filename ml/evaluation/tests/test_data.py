import json
import sqlite3

import pandas as pd
import pytest

from timesheet_eval.config import DEFAULT_PROJECT_TYPE_RULES
from timesheet_eval.data import classify_project_type, load_work_entries, normalize

RULES = DEFAULT_PROJECT_TYPE_RULES


@pytest.mark.parametrize(
    ("description", "expected"),
    [
        ("Fix login bug", "development"),
        ("Regression testing for release", "testing"),
        ("Weekly sync meeting", "meetings"),
        ("Support ticket triage", "support"),
        ("", "other"),
        (None, "other"),
        ("Lunch", "other"),
    ],
)
def test_classify_project_type(description, expected):
    assert classify_project_type(description, RULES) == expected


def test_classify_uses_rule_order():
    rules = {"meetings": ["meeting"], "development": ["fix"]}
    assert classify_project_type("Meeting to fix scope", rules) == "meetings"


def test_normalize_drops_invalid_rows_and_derives_labels():
    raw = pd.DataFrame(
        {
            "hours": [2, "abc", -1, 30, 4],
            "date": ["2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04", "not a date"],
            "department": ["Engineering", "", None, "Ops", "Ops"],
            "description": ["Implement API", "x", "y", "z", "w"],
        }
    )
    df = normalize(raw, RULES)
    assert len(df) == 1
    assert df.loc[0, "client_segment"] == "Engineering"
    assert df.loc[0, "project_type"] == "development"


def test_normalize_prefers_explicit_columns():
    raw = pd.DataFrame(
        {
            "hours": [1, 2],
            "date": ["2025-01-01", "2025-01-02"],
            "department": ["Eng", "Eng"],
            "client_segment": ["Enterprise", ""],
            "project_type": ["retainer", ""],
            "description": ["Fix bug", "Fix bug"],
        }
    )
    df = normalize(raw, RULES)
    assert df["client_segment"].tolist() == ["Enterprise", "Unassigned"]
    assert df["project_type"].tolist() == ["retainer", "development"]


def test_normalize_requires_hours_and_date():
    with pytest.raises(ValueError, match="missing required"):
        normalize(pd.DataFrame({"hours": [1]}), RULES)


def test_load_csv_with_app_export_headers(tmp_path):
    path = tmp_path / "export.csv"
    path.write_text("Date,Hours,Description,Created At\n2025-02-01,3.5,Design mockups,2025-02-01\n")
    loaded = load_work_entries(path, RULES)
    assert loaded.rows_loaded == 1
    row = loaded.frame.iloc[0]
    assert row["hours"] == 3.5
    assert row["project_type"] == "design"
    assert row["client_segment"] == "Unassigned"


def test_load_json_api_envelope(tmp_path):
    path = tmp_path / "entries.json"
    path.write_text(
        json.dumps(
            {
                "workEntries": [
                    {
                        "id": 1,
                        "client_id": 2,
                        "client_name": "Acme",
                        "hours": 2,
                        "description": "Client call",
                        "date": "2025-03-04",
                    }
                ]
            }
        )
    )
    loaded = load_work_entries(path, RULES)
    assert loaded.frame.iloc[0]["project_type"] == "meetings"


def _make_sqlite(path):
    with sqlite3.connect(path) as conn:
        conn.executescript(
            """
            CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT, department TEXT,
                                  user_email TEXT);
            CREATE TABLE work_entries (id INTEGER PRIMARY KEY, client_id INTEGER,
                                       user_email TEXT, hours DECIMAL(5,2),
                                       description TEXT, date DATE);
            INSERT INTO clients VALUES (1, 'Acme', 'Engineering', 'a@example.com');
            INSERT INTO clients VALUES (2, 'Beta', 'Finance', 'b@example.com');
            INSERT INTO work_entries VALUES (1, 1, 'a@example.com', 4, 'Fix bug', '2025-01-01');
            INSERT INTO work_entries VALUES (2, 2, 'b@example.com', 1, 'Sync', '2025-01-02');
            INSERT INTO work_entries VALUES (3, 1, 'b@example.com', 9, 'Orphan', '2025-01-03');
            """
        )


def test_load_sqlite_joins_clients_by_owner(tmp_path):
    db = tmp_path / "timesheet.db"
    _make_sqlite(db)
    loaded = load_work_entries(db, RULES)
    assert sorted(loaded.frame["id"].tolist()) == [1, 2]
    assert set(loaded.frame["client_segment"]) == {"Engineering", "Finance"}


def test_load_sqlite_user_scope(tmp_path):
    db = tmp_path / "timesheet.db"
    _make_sqlite(db)
    loaded = load_work_entries(db, RULES, user_email="a@example.com")
    assert loaded.frame["user_email"].unique().tolist() == ["a@example.com"]


def test_load_sqlite_is_read_only(tmp_path):
    db = tmp_path / "timesheet.db"
    _make_sqlite(db)
    before = db.read_bytes()
    load_work_entries(db, RULES)
    assert db.read_bytes() == before


def test_user_scope_requires_column(tmp_path):
    path = tmp_path / "e.csv"
    path.write_text("date,hours\n2025-01-01,1\n")
    with pytest.raises(ValueError, match="user_email"):
        load_work_entries(path, RULES, user_email="a@example.com")


def test_unsupported_extension(tmp_path):
    path = tmp_path / "e.parquet"
    path.write_bytes(b"")
    with pytest.raises(ValueError, match="Unsupported"):
        load_work_entries(path, RULES)


def test_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_work_entries(tmp_path / "nope.csv", RULES)
