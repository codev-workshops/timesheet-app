from __future__ import annotations

import numpy as np
import pandas as pd

from .config import SPLIT_NAMES


def split_dataset(
    frame: pd.DataFrame,
    ratios: dict[str, float],
    strategy: str = "random",
    seed: int = 42,
) -> dict[str, pd.DataFrame]:
    """Split rows into train/validation/test.

    ``random`` shuffles with a seeded RNG; ``chronological`` keeps date order so the
    validation and test sets are strictly later than the training data.
    """
    frame = frame.reset_index(drop=True)
    n = len(frame)
    if n < len(SPLIT_NAMES):
        raise ValueError(f"Need at least {len(SPLIT_NAMES)} rows to split; got {n}")

    if strategy == "random":
        order = np.random.default_rng(seed).permutation(n)
    elif strategy == "chronological":
        sort_cols = [c for c in ("date", "id") if c in frame.columns]
        order = frame.sort_values(sort_cols, kind="mergesort").index.to_numpy()
    else:
        raise ValueError(f"Unknown split strategy {strategy!r}")

    n_train = max(1, int(round(n * ratios["train"])))
    n_val = max(1, int(round(n * ratios["validation"])))
    if n_train + n_val >= n:
        n_train = max(1, n - n_val - 1)
    boundaries = {
        "train": order[:n_train],
        "validation": order[n_train : n_train + n_val],
        "test": order[n_train + n_val :],
    }
    return {name: frame.iloc[idx].reset_index(drop=True) for name, idx in boundaries.items()}
