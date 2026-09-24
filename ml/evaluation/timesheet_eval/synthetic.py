"""Deterministic synthetic work entries for demos and tests.

The generator plants a segment x project-type interaction (Engineering development work
runs long, Finance meetings run short) that an additive linear model cannot represent,
so the bias check has something real to find.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

SEGMENTS: dict[str, list[str]] = {
    "Engineering": ["Acme Robotics", "Nimbus Cloud", "Vertex Labs"],
    "Marketing": ["BrightSide Media", "Pulse Creative"],
    "Finance": ["Ledgerly", "Crown Capital"],
    "Operations": ["Harbor Logistics", "Summit Facilities"],
    "Unassigned": ["Misc Client"],
}
SEGMENT_WEIGHTS = [0.35, 0.2, 0.2, 0.2, 0.05]

DESCRIPTIONS: dict[str, list[str]] = {
    "development": [
        "Implement checkout feature",
        "Fix login bug",
        "Refactor API client",
        "Develop reporting module",
    ],
    "testing": ["Regression test pass", "QA for release candidate"],
    "design": ["Design onboarding mockups", "Wireframe dashboard"],
    "meetings": ["Weekly sync meeting", "Sprint planning", "Client call"],
    "support": ["Support ticket triage", "Incident troubleshooting"],
    "documentation": ["Documentation update", "Write specification"],
    "analysis": ["Market research", "Cost analysis"],
    "other": ["Admin", ""],
}
PROJECT_TYPE_WEIGHTS = [0.3, 0.1, 0.1, 0.2, 0.12, 0.08, 0.06, 0.04]

BASE_HOURS = {
    "development": 5.0,
    "testing": 3.5,
    "design": 4.0,
    "meetings": 1.5,
    "support": 2.5,
    "documentation": 2.0,
    "analysis": 3.5,
    "other": 1.0,
}
SEGMENT_OFFSET = {
    "Engineering": 0.5,
    "Marketing": 0.0,
    "Finance": -0.25,
    "Operations": 0.25,
    "Unassigned": 0.0,
}
INTERACTION = {("Engineering", "development"): 1.5, ("Finance", "meetings"): -0.75}


def generate_work_entries(
    n_rows: int = 2000,
    seed: int = 7,
    start: str = "2025-01-01",
    days: int = 365,
) -> pd.DataFrame:
    if n_rows < 1:
        raise ValueError("n_rows must be >= 1")
    rng = np.random.default_rng(seed)
    segment_names = list(SEGMENTS)
    project_types = list(DESCRIPTIONS)
    segments = rng.choice(segment_names, size=n_rows, p=SEGMENT_WEIGHTS)
    ptypes = rng.choice(project_types, size=n_rows, p=PROJECT_TYPE_WEIGHTS)
    dates = pd.Timestamp(start) + pd.to_timedelta(rng.integers(0, days, size=n_rows), unit="D")

    records = []
    for i in range(n_rows):
        segment, ptype, date = str(segments[i]), str(ptypes[i]), dates[i]
        clients = SEGMENTS[segment]
        client_idx = int(rng.integers(len(clients)))
        weekend_penalty = -1.0 if date.dayofweek >= 5 else 0.0
        mean = (
            BASE_HOURS[ptype]
            + SEGMENT_OFFSET[segment]
            + INTERACTION.get((segment, ptype), 0.0)
            + weekend_penalty
        )
        hours = float(np.clip(np.round((mean + rng.normal(0, 0.8)) * 4) / 4, 0.25, 12.0))
        records.append(
            {
                "id": i + 1,
                "client_id": segment_names.index(segment) * 10 + client_idx + 1,
                "client_name": clients[client_idx],
                "department": "" if segment == "Unassigned" else segment,
                "user_email": f"user{int(rng.integers(1, 6))}@example.com",
                "hours": hours,
                "description": str(rng.choice(DESCRIPTIONS[ptype])),
                "date": date.strftime("%Y-%m-%d"),
            }
        )
    return pd.DataFrame.from_records(records)
