"""Synthetic timesheet data generator.

Produces tables mirroring the app schema (backend/src/database/init.js):
users(email), clients(id, name, description, department, email, user_email) and
work_entries(id, client_id, user_email, hours, description, date), then writes a
time-based train/test split of work_entries.

Usage: python ml/generate_data.py [--seed N] [--out-dir DIR]
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd

ML_DIR = Path(__file__).resolve().parent
DEFAULT_OUT_DIR = ML_DIR / "data"

HOURS_MAX = 24.0
DESCRIPTION_MAX_LEN = 1000
ROUND_BUCKETS = np.array([0.5, 1.0, 2.0, 4.0, 8.0])


@dataclass(frozen=True)
class GeneratorConfig:
    seed: int = 42
    start_date: str = "2025-10-01"
    end_date: str = "2026-09-27"
    test_fraction: float = 0.2
    n_regular_users: int = 14
    n_sparse_users: int = 3
    n_late_joiners: int = 2
    n_new_users: int = 1
    min_clients_per_user: int = 5
    max_clients_per_user: int = 15
    new_client_fraction: float = 0.08
    weekday_activity: float = 0.85
    weekend_activity: float = 0.05
    sparse_activity: float = 0.12
    missing_description_rate: float = 0.15
    email_domain: str = "acme-consulting.example"


# department -> (duration multiplier, [(task template, task-type duration multiplier)])
DEPARTMENTS: dict[str, tuple[float, list[tuple[str, float]]]] = {
    "Engineering": (
        1.15,
        [
            ("Sprint planning meeting", 0.35),
            ("Code review for {topic}", 0.5),
            ("Implemented {topic}", 1.7),
            ("Bug fix: {topic}", 0.8),
            ("Deployment and release support for {topic}", 0.9),
            ("Architecture workshop on {topic}", 1.4),
        ],
    ),
    "Marketing": (
        0.9,
        [
            ("Campaign kickoff call", 0.35),
            ("Drafted copy for {topic}", 1.0),
            ("Social media content calendar for {topic}", 0.8),
            ("Analytics review of {topic}", 0.6),
            ("Brand strategy workshop", 1.5),
        ],
    ),
    "Finance": (
        1.0,
        [
            ("Monthly close reconciliation", 1.5),
            ("Budget review meeting", 0.4),
            ("Prepared {topic} report", 1.1),
            ("Audit support for {topic}", 1.3),
            ("Invoice processing", 0.5),
        ],
    ),
    "Legal": (
        1.05,
        [
            ("Contract review: {topic}", 1.0),
            ("Compliance assessment of {topic}", 1.4),
            ("Client call re {topic}", 0.35),
            ("Drafted NDA", 0.6),
            ("Regulatory research on {topic}", 1.2),
        ],
    ),
    "Design": (
        0.95,
        [
            ("Wireframes for {topic}", 1.2),
            ("Design review meeting", 0.4),
            ("Prototype iteration on {topic}", 1.4),
            ("User research interviews", 1.0),
            ("Updated style guide", 0.7),
        ],
    ),
    "Operations": (
        0.85,
        [
            ("Weekly status call", 0.3),
            ("Vendor coordination for {topic}", 0.7),
            ("Process documentation: {topic}", 0.9),
            ("Onsite support", 2.2),
            ("Inventory and logistics planning", 0.8),
        ],
    ),
}

TOPICS = [
    "payment API",
    "login flow",
    "search indexing",
    "reporting module",
    "data export",
    "Q3 launch",
    "customer portal",
    "mobile app",
    "pricing page",
    "onboarding",
    "tax filing",
    "vendor contract",
    "privacy policy",
    "dashboard",
    "migration",
]

DETAIL_SENTENCES = [
    "Followed up with stakeholders on open questions.",
    "Captured action items and next steps.",
    "Addressed feedback from the previous round.",
    "Coordinated with the client team over email.",
    "Documented decisions in the shared drive.",
    "Resolved blockers raised during standup.",
]

FIRST_NAMES = [
    "alice",
    "bob",
    "carol",
    "dave",
    "erin",
    "frank",
    "grace",
    "heidi",
    "ivan",
    "judy",
    "mallory",
    "nia",
    "oscar",
    "peggy",
    "quinn",
    "rupert",
    "sybil",
    "trent",
    "uma",
    "victor",
    "wendy",
    "xavier",
]
LAST_NAMES = [
    "nguyen",
    "smith",
    "garcia",
    "khan",
    "muller",
    "rossi",
    "tanaka",
    "okafor",
    "silva",
    "kowalski",
    "dubois",
    "larsen",
]
COMPANY_PREFIX = [
    "Blue",
    "Summit",
    "North",
    "Bright",
    "Iron",
    "Cedar",
    "Nova",
    "Apex",
    "Harbor",
    "Pioneer",
    "Silver",
    "Granite",
    "Vertex",
    "Orchid",
    "Atlas",
    "Meridian",
]
COMPANY_SUFFIX = [
    "Labs",
    "Holdings",
    "Partners",
    "Systems",
    "Group",
    "Logistics",
    "Health",
    "Capital",
    "Retail",
    "Foods",
    "Energy",
    "Media",
]
# Mon..Sun duration multipliers
DOW_EFFECT = np.array([1.05, 1.0, 1.0, 0.98, 0.85, 0.6, 0.55])
MONTH_EFFECT = {12: 0.85, 8: 0.9, 1: 0.95}


def split_date(cfg: GeneratorConfig) -> pd.Timestamp:
    start, end = pd.Timestamp(cfg.start_date), pd.Timestamp(cfg.end_date)
    n_days = (end - start).days + 1
    return start + pd.Timedelta(days=int(round(n_days * (1 - cfg.test_fraction))))


def snap_hours(raw: float, p_bucket: float, rng: np.random.Generator) -> float:
    """Round a raw duration the way people fill timesheets: mostly round buckets."""
    u = rng.random()
    if u < p_bucket:
        idx = int(np.argmin(np.abs(np.log(ROUND_BUCKETS) - np.log(raw))))
        value = float(ROUND_BUCKETS[idx])
    elif u < p_bucket + (1 - p_bucket) * 0.6:
        value = max(0.25, round(raw * 4) / 4)
    else:
        value = max(0.1, round(raw, 2))
    return float(min(HOURS_MAX, round(value, 2)))


def make_users(cfg: GeneratorConfig, rng: np.random.Generator) -> pd.DataFrame:
    start, end, cut = pd.Timestamp(cfg.start_date), pd.Timestamp(cfg.end_date), split_date(cfg)
    total = cfg.n_regular_users + cfg.n_sparse_users + cfg.n_late_joiners + cfg.n_new_users
    names = rng.permutation([f"{f}.{last}" for f in FIRST_NAMES for last in LAST_NAMES])[:total]
    segments = (
        ["regular"] * cfg.n_regular_users
        + ["sparse"] * cfg.n_sparse_users
        + ["late_joiner"] * cfg.n_late_joiners
        + ["new"] * cfg.n_new_users
    )
    rows = []
    for name, segment in zip(names, segments, strict=True):
        if segment == "regular":
            active_from = start + pd.Timedelta(days=int(rng.integers(0, 30)))
            activity = cfg.weekday_activity
        elif segment == "sparse":
            active_from = start + pd.Timedelta(days=int(rng.integers(0, 60)))
            activity = cfg.sparse_activity
        elif segment == "late_joiner":
            active_from = cut - pd.Timedelta(days=int(rng.integers(21, 42)))
            activity = cfg.weekday_activity
        else:
            active_from = cut + pd.Timedelta(days=int(rng.integers(3, 14)))
            activity = cfg.weekday_activity
        rows.append(
            {
                "email": f"{name}@{cfg.email_domain}",
                "segment": segment,
                "active_from": min(active_from, end),
                "weekday_activity": activity,
                "base_hours": float(rng.lognormal(np.log(2.2), 0.3)),
                "p_bucket": float(rng.uniform(0.35, 0.85)),
                "entries_per_day": float(rng.uniform(1.4, 3.2)),
            }
        )
    return pd.DataFrame(rows)


def make_clients(
    cfg: GeneratorConfig, users: pd.DataFrame, rng: np.random.Generator
) -> pd.DataFrame:
    cut, end = split_date(cfg), pd.Timestamp(cfg.end_date)
    departments = list(DEPARTMENTS)
    rows = []
    client_id = 1
    for user in users.itertuples():
        n_clients = int(rng.integers(cfg.min_clients_per_user, cfg.max_clients_per_user + 1))
        dept_pref = rng.dirichlet(np.full(len(departments), 0.8))
        for _ in range(n_clients):
            dept = departments[int(rng.choice(len(departments), p=dept_pref))]
            name = f"{rng.choice(COMPANY_PREFIX)} {rng.choice(COMPANY_SUFFIX)}"
            is_new = user.segment != "new" and rng.random() < cfg.new_client_fraction
            if is_new:
                active_from = cut + pd.Timedelta(days=int(rng.integers(0, (end - cut).days)))
            else:
                active_from = user.active_from
            slug = name.lower().replace(" ", "")
            rows.append(
                {
                    "id": client_id,
                    "name": name,
                    "description": f"{dept} engagement with {name}",
                    "department": dept,
                    "email": f"contact@{slug}.example",
                    "user_email": user.email,
                    "active_from": active_from,
                    "weight": float(rng.lognormal(0, 0.8)),
                    "client_factor": float(rng.lognormal(0, 0.35)),
                }
            )
            client_id += 1
    return pd.DataFrame(rows)


def make_description(dept: str, rng: np.random.Generator, missing_rate: float):
    templates = DEPARTMENTS[dept][1]
    template, task_mult = templates[int(rng.integers(len(templates)))]
    if rng.random() < missing_rate:
        return (np.nan if rng.random() < 0.7 else ""), task_mult
    text = template.format(topic=rng.choice(TOPICS))
    n_details = rng.binomial(3, min(0.9, 0.15 * task_mult + 0.1))
    if n_details:
        extra = rng.choice(DETAIL_SENTENCES, size=n_details, replace=False)
        text = f"{text}. " + " ".join(extra)
    if rng.random() < 0.2:
        text += f" (ticket #{int(rng.integers(100, 9999))})"
    return text[:DESCRIPTION_MAX_LEN], task_mult


def make_work_entries(
    cfg: GeneratorConfig,
    users: pd.DataFrame,
    clients: pd.DataFrame,
    rng: np.random.Generator,
) -> pd.DataFrame:
    dates = pd.date_range(cfg.start_date, cfg.end_date, freq="D")
    rows = []
    for user in users.itertuples():
        user_clients = clients[clients["user_email"] == user.email]
        for day in dates[dates >= user.active_from]:
            dow = day.dayofweek
            p_active = user.weekday_activity if dow < 5 else cfg.weekend_activity
            if rng.random() >= p_active:
                continue
            available = user_clients[user_clients["active_from"] <= day]
            if available.empty:
                continue
            n_entries = 1 + rng.poisson(user.entries_per_day - 1)
            weights = available["weight"].to_numpy()
            picks = rng.choice(len(available), size=n_entries, p=weights / weights.sum())
            for pick in picks:
                client = available.iloc[int(pick)]
                description, task_mult = make_description(
                    client["department"], rng, cfg.missing_description_rate
                )
                raw = (
                    user.base_hours
                    * client["client_factor"]
                    * DEPARTMENTS[client["department"]][0]
                    * task_mult
                    * DOW_EFFECT[dow]
                    * MONTH_EFFECT.get(day.month, 1.0)
                    * rng.lognormal(0, 0.3)
                )
                if rng.random() < 0.03 and dow < 5:
                    raw = 8.0
                rows.append(
                    {
                        "client_id": int(client["id"]),
                        "user_email": user.email,
                        "hours": snap_hours(float(raw), user.p_bucket, rng),
                        "description": description,
                        "date": day.strftime("%Y-%m-%d"),
                    }
                )
    entries = pd.DataFrame(rows).sort_values(["date", "user_email", "client_id"], kind="stable")
    entries.insert(0, "id", np.arange(1, len(entries) + 1))
    return entries.reset_index(drop=True)


def validate(entries: pd.DataFrame, clients: pd.DataFrame, users: pd.DataFrame) -> None:
    """Enforce the app's Joi bounds (backend/src/validation/schemas.js) and tenancy."""
    hours = entries["hours"]
    assert (hours > 0).all() and (hours <= HOURS_MAX).all(), "hours out of (0, 24]"
    assert np.allclose(hours, hours.round(2)), "hours must have <= 2 decimals"
    assert entries["description"].fillna("").str.len().max() <= DESCRIPTION_MAX_LEN
    pd.to_datetime(entries["date"], format="%Y-%m-%d")
    owner = entries["client_id"].map(clients.set_index("id")["user_email"])
    assert (owner == entries["user_email"]).all(), "client must belong to entry's user"
    assert set(entries["user_email"]) <= set(users["email"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed", type=int, default=GeneratorConfig.seed)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    args = parser.parse_args()

    cfg = GeneratorConfig(seed=args.seed)
    rng = np.random.default_rng(cfg.seed)
    users = make_users(cfg, rng)
    clients = make_clients(cfg, users, rng)
    entries = make_work_entries(cfg, users, clients, rng)
    validate(entries, clients, users)

    cut = split_date(cfg)
    is_test = pd.to_datetime(entries["date"]) >= cut
    train, test = entries[~is_test], entries[is_test]

    out = args.out_dir
    out.mkdir(parents=True, exist_ok=True)
    users[["email"]].to_csv(out / "users.csv", index=False)
    client_cols = ["id", "name", "description", "department", "email", "user_email"]
    clients[client_cols].to_csv(out / "clients.csv", index=False)
    entries.to_csv(out / "work_entries.csv", index=False)
    train.to_csv(out / "train.csv", index=False)
    test.to_csv(out / "test.csv", index=False)
    # Generator-internal ground truth (never used as model features).
    users.assign(active_from=users["active_from"].dt.strftime("%Y-%m-%d")).to_csv(
        out / "user_profiles.csv", index=False
    )

    meta = {
        "config": asdict(cfg),
        "split_date": cut.strftime("%Y-%m-%d"),
        "rows": {"all": len(entries), "train": len(train), "test": len(test)},
        "users": len(users),
        "clients": len(clients),
    }
    (out / "generator_config.json").write_text(json.dumps(meta, indent=2) + "\n")

    print(f"Generated {len(users)} users, {len(clients)} clients, {len(entries)} work entries")
    print(f"Time split at {meta['split_date']}: train={len(train)} test={len(test)}")
    print(f"Wrote CSVs to {out}")


if __name__ == "__main__":
    main()
