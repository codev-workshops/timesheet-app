"""Reproducible synthetic timesheet data grounded in the app's domain.

Each user owns a few clients (the app scopes clients by ``user_email``); every
client belongs to a department. Work entries are drawn from work-type templates
with their own hour distributions, shifted per department, client and user so
that ``client_id``, ``department`` and ``description`` all carry signal.

CLI::

    python synthetic_data.py --rows 2000 --seed 42 --csv data/synthetic.csv [--sqlite out.db]
"""

from __future__ import annotations

import argparse
import sqlite3
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

HOURS_MIN = 0.25
HOURS_MAX = 12.0
DEFAULT_ROWS = 2000
DEFAULT_SEED = 42
START_DATE = date(2026, 4, 1)
N_DAYS = 183

COLUMNS = ["client_id", "user_email", "description", "date", "client_name", "department", "hours"]

USERS = [
    "alice@example.com",
    "bob@example.com",
    "carol@example.com",
    "dave@example.com",
    "erin@example.com",
    "frank@example.com",
    "grace@example.com",
    "heidi@example.com",
]

DEPARTMENTS = ["Engineering", "Marketing", "Sales", "Operations", "Finance"]

CLIENT_NAMES = [
    "Acme Corp", "Globex", "Initech", "Umbrella Health", "Stark Industries", "Wayne Enterprises",
    "Hooli", "Pied Piper", "Soylent Foods", "Cyberdyne", "Tyrell Logistics", "Wonka Retail",
    "Vandelay Imports", "Gringotts Bank", "Oscorp", "Massive Dynamic", "Dunder Mifflin",
    "Prestige Worldwide", "Monarch Solutions", "Nakatomi Trading", "Aperture Labs",
    "Black Mesa", "Duff Beverages", "Bluth Company",
]

COMPONENTS = ["login page", "checkout flow", "reports API", "dashboard", "billing service",
              "search", "export to CSV", "user settings", "notifications", "mobile layout"]
TOPICS = ["Q3 roadmap", "campaign results", "renewal", "budget review", "onboarding",
          "requirements", "status update", "pricing", "kickoff", "retrospective"]
FEATURES = ["SSO integration", "invoice generation", "audit logging", "dark mode",
            "bulk import", "role-based access", "analytics widgets", "webhooks"]
DOCS = ["API reference", "runbook", "onboarding guide", "release notes", "architecture doc",
        "user manual"]
ENVS = ["staging", "production", "QA", "the demo environment"]


@dataclass(frozen=True)
class WorkType:
    name: str
    templates: tuple[str, ...]
    sampler: Callable[[np.random.Generator, float], float]


def _normal(mean: float, sd: float) -> Callable[[np.random.Generator, float], float]:
    return lambda rng, scale: rng.normal(mean * scale, sd * scale)


def _uniform(low: float, high: float) -> Callable[[np.random.Generator, float], float]:
    return lambda rng, scale: rng.uniform(low, high) * scale


def _lognormal(median: float, sigma: float) -> Callable[[np.random.Generator, float], float]:
    return lambda rng, scale: median * scale * rng.lognormal(0.0, sigma)


WORK_TYPES: dict[str, WorkType] = {
    "standup": WorkType("standup", (
        "Team standup", "Daily standup", "Standup meeting", "Morning standup with the team",
        "Team sync / standup", "Daily scrum",
    ), _uniform(0.25, 1.0)),
    "client_meeting": WorkType("client_meeting", (
        "Client meeting", "Meeting with client about {topic}", "Client call: {topic}",
        "Client workshop on {topic}", "Call with stakeholders re {topic}",
    ), _normal(1.5, 0.5)),
    "bug_fix": WorkType("bug_fix", (
        "Bug fix", "Fixed bug in {component}", "Bug fix: {component} error",
        "Investigated and fixed issue in {component}", "Hotfix for {component}",
    ), _lognormal(2.0, 0.45)),
    "code_review": WorkType("code_review", (
        "Code review", "Code review for PR #{pr}", "Reviewed pull request #{pr}",
        "PR review: {component}", "Code review and feedback on {feature}",
    ), _normal(1.0, 0.4)),
    "feature": WorkType("feature", (
        "Feature development", "Implemented {feature}", "Feature work: {feature}",
        "Developing {feature} for {component}", "Built {feature}",
    ), _normal(4.0, 1.5)),
    "deployment": WorkType("deployment", (
        "Deployment", "Deployed release to {env}", "Production deployment",
        "Release deployment and smoke tests on {env}", "Deploy to {env}",
    ), _normal(1.75, 0.6)),
    "documentation": WorkType("documentation", (
        "Documentation", "Wrote {doc}", "Updated {doc}", "Documentation for {feature}",
        "Drafted {doc}",
    ), _normal(2.0, 0.75)),
}

# Relative frequency of each work type per department.
DEPARTMENT_MIX: dict[str, dict[str, float]] = {
    "Engineering": {"standup": 3, "client_meeting": 1, "bug_fix": 3, "code_review": 3,
                    "feature": 4, "deployment": 2, "documentation": 1},
    "Marketing": {"standup": 2, "client_meeting": 4, "bug_fix": 0.3, "code_review": 0.3,
                  "feature": 1, "deployment": 0.3, "documentation": 3},
    "Sales": {"standup": 2, "client_meeting": 6, "bug_fix": 0.2, "code_review": 0.2,
              "feature": 0.5, "deployment": 0.2, "documentation": 2},
    "Operations": {"standup": 3, "client_meeting": 1.5, "bug_fix": 2, "code_review": 1,
                   "feature": 1, "deployment": 4, "documentation": 2},
    "Finance": {"standup": 2, "client_meeting": 3, "bug_fix": 0.5, "code_review": 0.5,
                "feature": 1, "deployment": 0.3, "documentation": 4},
}

# Department-level multipliers on the work-type hour means.
DEPARTMENT_SCALE = {"Engineering": 1.15, "Marketing": 0.85, "Sales": 0.9,
                    "Operations": 1.0, "Finance": 1.25}


def _fill(template: str, rng: np.random.Generator) -> str:
    return template.format(
        topic=rng.choice(TOPICS), component=rng.choice(COMPONENTS), feature=rng.choice(FEATURES),
        doc=rng.choice(DOCS), env=rng.choice(ENVS), pr=int(rng.integers(100, 2000)),
    )


def _random_case(text: str, rng: np.random.Generator) -> str:
    roll = rng.random()
    if roll < 0.1:
        return text.lower()
    if roll < 0.13:
        return text.upper()
    return text


def generate_clients(seed: int = DEFAULT_SEED) -> pd.DataFrame:
    """2-4 clients per user, ids 1..N, each with a department and a client-level hour scale."""
    rng = np.random.default_rng(seed)
    names = list(rng.permutation(CLIENT_NAMES))
    rows = []
    client_id = 1
    for user in USERS:
        for _ in range(int(rng.integers(2, 5))):
            name = names[(client_id - 1) % len(names)]
            department = DEPARTMENTS[int(rng.integers(0, len(DEPARTMENTS)))]
            rows.append({
                "client_id": client_id,
                "client_name": name,
                "department": department,
                "user_email": user,
                "email": f"contact@{name.lower().replace(' ', '')}.example",
                "client_scale": float(np.clip(rng.lognormal(0.0, 0.3), 0.6, 1.8)),
            })
            client_id += 1
    return pd.DataFrame(rows)


def generate_dataset(n_rows: int = DEFAULT_ROWS, seed: int = DEFAULT_SEED) -> pd.DataFrame:
    """Return a DataFrame with ``COLUMNS`` (date as tz-naive datetime64, hours in 0.25 steps)."""
    rng = np.random.default_rng(seed)
    clients = generate_clients(seed)
    user_scale = {u: float(np.clip(rng.normal(1.0, 0.08), 0.8, 1.2)) for u in USERS}
    # Some clients are busier than others.
    client_weights = rng.dirichlet(np.full(len(clients), 2.0))

    # Mostly weekdays; weekends get ~4% of entries.
    all_days = [START_DATE + timedelta(days=i) for i in range(N_DAYS)]
    day_weights = np.array([0.15 if d.weekday() >= 5 else 1.0 for d in all_days])
    day_weights /= day_weights.sum()

    rows = []
    client_idx = rng.choice(len(clients), size=n_rows, p=client_weights)
    day_idx = rng.choice(len(all_days), size=n_rows, p=day_weights)
    for ci, di in zip(client_idx, day_idx):
        client = clients.iloc[int(ci)]
        dept = client["department"]
        mix = DEPARTMENT_MIX[dept]
        names = list(mix)
        probs = np.array([mix[n] for n in names], dtype=float)
        work = WORK_TYPES[names[int(rng.choice(len(names), p=probs / probs.sum()))]]
        day = all_days[int(di)]

        scale = DEPARTMENT_SCALE[dept] * client["client_scale"] * user_scale[client["user_email"]]
        if day.weekday() >= 5:
            scale *= 0.7
        if day.month in (7, 8):  # summer slowdown
            scale *= 0.92
        hours = work.sampler(rng, scale)
        hours = float(np.clip(round(hours * 4) / 4, HOURS_MIN, HOURS_MAX))

        if rng.random() < 0.04:
            description = ""
        else:
            template = work.templates[int(rng.integers(0, len(work.templates)))]
            description = _random_case(_fill(template, rng), rng)

        rows.append({
            "client_id": int(client["client_id"]),
            "user_email": client["user_email"],
            "description": description,
            "date": datetime(day.year, day.month, day.day),
            "client_name": client["client_name"],
            "department": dept,
            "hours": hours,
        })

    df = pd.DataFrame(rows, columns=COLUMNS)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values(["date", "client_id"], kind="stable").reset_index(drop=True)


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  department TEXT,
  email TEXT,
  user_email TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS work_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  user_email TEXT NOT NULL,
  hours DECIMAL(5,2) NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
  FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_clients_user_email ON clients (user_email);
CREATE INDEX IF NOT EXISTS idx_work_entries_client_id ON work_entries (client_id);
CREATE INDEX IF NOT EXISTS idx_work_entries_user_email ON work_entries (user_email);
CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries (date);
"""


def to_epoch_ms(ts: pd.Timestamp) -> int:
    """Match how the backend stores dates: a JS Date bound by node-sqlite3 as epoch ms (UTC)."""
    return int(ts.to_pydatetime().replace(tzinfo=UTC).timestamp() * 1000)


def insert_into_sqlite(df: pd.DataFrame, db_path: str | Path) -> dict[int, int]:
    """Insert users, clients and work entries (schema of backend/src/database/init.js).

    Returns a mapping from generated client_id to the id assigned by SQLite.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        conn.executescript(SCHEMA_SQL)
        with conn:
            for user in sorted(df["user_email"].unique()):
                conn.execute("INSERT OR IGNORE INTO users (email) VALUES (?)", (user,))
            clients = df[["client_id", "client_name", "department", "user_email"]].drop_duplicates(
                "client_id").sort_values("client_id")
            id_map: dict[int, int] = {}
            for row in clients.itertuples(index=False):
                cur = conn.execute(
                    "INSERT INTO clients (name, description, department, email, user_email) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (row.client_name, f"Synthetic client ({row.department})", row.department,
                     f"contact@{row.client_name.lower().replace(' ', '')}.example",
                     row.user_email),
                )
                id_map[int(row.client_id)] = int(cur.lastrowid)
            conn.executemany(
                "INSERT INTO work_entries (client_id, user_email, hours, description, date) "
                "VALUES (?, ?, ?, ?, ?)",
                [
                    (id_map[int(r.client_id)], r.user_email, float(r.hours), r.description,
                     to_epoch_ms(pd.Timestamp(r.date)))
                    for r in df.itertuples(index=False)
                ],
            )
        return id_map
    finally:
        conn.close()


def write_csv(df: pd.DataFrame, path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    out = df.copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    out.to_csv(path, index=False)
    return path


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--csv", default=str(Path(__file__).resolve().parent / "data" / "synthetic.csv"))
    parser.add_argument("--sqlite", help="also insert rows into this SQLite DB file")
    args = parser.parse_args(argv)

    df = generate_dataset(args.rows, args.seed)
    print(f"generated {len(df)} rows -> {write_csv(df, args.csv)}")
    if args.sqlite:
        insert_into_sqlite(df, args.sqlite)
        print(f"inserted into {args.sqlite}")


if __name__ == "__main__":
    main()
