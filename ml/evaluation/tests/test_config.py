import pytest

from timesheet_eval.config import EvalConfig


def test_defaults_are_valid():
    cfg = EvalConfig()
    assert sum(cfg.ratios.values()) == pytest.approx(1.0)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"train_ratio": 0.8, "validation_ratio": 0.15, "test_ratio": 0.15},
        {"train_ratio": 1.0, "validation_ratio": 0.0, "test_ratio": 0.0},
        {"split_strategy": "stratified"},
        {"analysis_split": "holdout"},
        {"min_segment_size": 1},
        {"bias_alpha": 0.0},
        {"bias_threshold_hours": -1.0},
    ],
)
def test_invalid_config_rejected(kwargs):
    with pytest.raises(ValueError):
        EvalConfig(**kwargs)
