import joblib
import pytest
from fastapi.testclient import TestClient

import serve
import synthetic_data as sd
from pipeline import FEATURE_COLUMNS, build_pipeline

CONTRACT_EXAMPLE = {
    "clientId": 3,
    "description": "Code review for PR",
    "userEmail": "alice@example.com",
    "date": "2026-10-29",
    "department": "Engineering",
}


@pytest.fixture(scope="module")
def model_path(tmp_path_factory):
    df = sd.generate_dataset(400, seed=9)
    pipe = build_pipeline(n_estimators=50, max_depth=3)
    pipe.fit(df[FEATURE_COLUMNS], df["hours"])
    path = tmp_path_factory.mktemp("model") / "model.joblib"
    joblib.dump({"pipeline": pipe, "model_version": "xgb-test-000000"}, path)
    return path


@pytest.fixture(scope="module")
def client(model_path):
    return TestClient(serve.create_app(model_path))


def _assert_valid_prediction(body):
    assert set(body) == {"estimatedHours", "modelVersion"}
    assert isinstance(body["estimatedHours"], float)
    assert 0.25 <= body["estimatedHours"] <= 12
    assert round(body["estimatedHours"], 2) == body["estimatedHours"]
    assert isinstance(body["modelVersion"], str) and body["modelVersion"]


def test_predict_contract_example(client):
    res = client.post("/predict", json=CONTRACT_EXAMPLE)
    assert res.status_code == 200
    _assert_valid_prediction(res.json())
    assert res.json()["modelVersion"] == "xgb-test-000000"


@pytest.mark.parametrize("overrides", [
    {"clientId": 987654},
    {"department": "Quantum Research"},
    {"clientId": 987654, "department": None, "userEmail": "new.user@example.com"},
    {"description": ""},
    {"date": "2026-10-29T08:15:00.000Z"},
    {"date": "2026-10-31T08:15:00+05:30"},
])
def test_predict_unknown_values_and_optional_fields(client, overrides):
    res = client.post("/predict", json={**CONTRACT_EXAMPLE, **overrides})
    assert res.status_code == 200, res.text
    _assert_valid_prediction(res.json())


def test_department_absent_is_allowed(client):
    body = {k: v for k, v in CONTRACT_EXAMPLE.items() if k != "department"}
    res = client.post("/predict", json=body)
    assert res.status_code == 200
    _assert_valid_prediction(res.json())


@pytest.mark.parametrize("field", ["clientId", "description", "userEmail", "date"])
def test_missing_required_field_is_422(client, field):
    body = {k: v for k, v in CONTRACT_EXAMPLE.items() if k != field}
    assert client.post("/predict", json=body).status_code == 422


@pytest.mark.parametrize("overrides", [
    {"clientId": "abc"},
    {"date": "29/10/2026"},
    {"date": "not-a-date"},
    {"description": None},
])
def test_invalid_values_are_422(client, overrides):
    assert client.post("/predict", json={**CONTRACT_EXAMPLE, **overrides}).status_code == 422


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "modelLoaded": True, "modelVersion": "xgb-test-000000"}


def test_missing_artifact_returns_503(tmp_path):
    c = TestClient(serve.create_app(tmp_path / "missing.joblib"))
    res = c.post("/predict", json=CONTRACT_EXAMPLE)
    assert res.status_code == 503
    assert "detail" in res.json()
    assert c.get("/health").json()["modelLoaded"] is False


def test_ml_model_path_env_var(model_path, monkeypatch):
    monkeypatch.setenv("ML_MODEL_PATH", str(model_path))
    c = TestClient(serve.create_app())
    assert c.get("/health").json()["modelVersion"] == "xgb-test-000000"


def test_committed_artifact_serves_contract_example():
    if not serve.DEFAULT_MODEL_PATH.exists():
        pytest.skip("no trained artifact; run `python ml/train.py`")
    c = TestClient(serve.create_app(serve.DEFAULT_MODEL_PATH))
    health = c.get("/health").json()
    assert health["modelLoaded"] is True
    res = c.post("/predict", json=CONTRACT_EXAMPLE)
    assert res.status_code == 200
    _assert_valid_prediction(res.json())
    assert res.json()["modelVersion"] == health["modelVersion"]
