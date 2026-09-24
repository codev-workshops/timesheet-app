import pandas as pd
import pytest

from timesheet_eval.splits import split_dataset

RATIOS = {"train": 0.6, "validation": 0.2, "test": 0.2}


def _ids(splits):
    return {name: set(part["id"]) for name, part in splits.items()}


def test_random_split_sizes_and_disjoint(sample_frame):
    splits = split_dataset(sample_frame, RATIOS, "random", seed=1)
    sizes = {k: len(v) for k, v in splits.items()}
    assert sizes == {"train": 720, "validation": 240, "test": 240}
    ids = _ids(splits)
    assert not ids["train"] & ids["validation"]
    assert not ids["train"] & ids["test"]
    assert not ids["validation"] & ids["test"]
    assert sum(sizes.values()) == len(sample_frame)


def test_random_split_is_reproducible(sample_frame):
    a = split_dataset(sample_frame, RATIOS, "random", seed=5)
    b = split_dataset(sample_frame, RATIOS, "random", seed=5)
    c = split_dataset(sample_frame, RATIOS, "random", seed=6)
    assert _ids(a) == _ids(b)
    assert _ids(a) != _ids(c)


def test_chronological_split_orders_by_date(sample_frame):
    shuffled = sample_frame.sample(frac=1, random_state=0)
    splits = split_dataset(shuffled, RATIOS, "chronological")
    assert splits["train"]["date"].max() <= splits["validation"]["date"].min()
    assert splits["validation"]["date"].max() <= splits["test"]["date"].min()


def test_tiny_dataset_keeps_every_split_non_empty():
    frame = pd.DataFrame({"id": [1, 2, 3], "date": pd.to_datetime(["2025-01-01"] * 3)})
    splits = split_dataset(frame, {"train": 0.9, "validation": 0.05, "test": 0.05})
    assert all(len(part) == 1 for part in splits.values())


def test_too_few_rows():
    with pytest.raises(ValueError):
        split_dataset(pd.DataFrame({"id": [1, 2]}), RATIOS)
