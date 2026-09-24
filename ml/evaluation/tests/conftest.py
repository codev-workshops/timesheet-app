import pytest

from timesheet_eval.config import EvalConfig
from timesheet_eval.data import LoadedData, normalize
from timesheet_eval.synthetic import generate_work_entries


@pytest.fixture
def config() -> EvalConfig:
    return EvalConfig()


@pytest.fixture
def sample_frame(config):
    return normalize(generate_work_entries(n_rows=1200, seed=3), config.project_type_rules)


@pytest.fixture
def sample_data(sample_frame) -> LoadedData:
    return LoadedData(
        frame=sample_frame, source="synthetic", rows_loaded=len(sample_frame), rows_dropped=0
    )
