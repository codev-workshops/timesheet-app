"""FastAPI service exposing the hours-estimation model.

Run from the repo root with ``uvicorn ml.serve:app --host 0.0.0.0 --port 8000``
or from ``ml/`` with ``uvicorn serve:app --host 0.0.0.0 --port 8000``.
``ML_MODEL_PATH`` overrides the artifact path (default: ``artifacts/model.joblib``
next to this file).
"""

from __future__ import annotations

import logging
import math
import os
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

ML_DIR = Path(__file__).resolve().parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import joblib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from pipeline import to_frame

HOURS_MIN, HOURS_MAX = 0.25, 12.0
DEFAULT_MODEL_PATH = ML_DIR / "artifacts" / "model.joblib"

logger = logging.getLogger("ml.serve")


class PredictRequest(BaseModel):
    clientId: int
    description: str
    userEmail: str
    date: str = Field(description="ISO date (YYYY-MM-DD) or full ISO datetime")
    department: str | None = None

    @field_validator("date")
    @classmethod
    def _iso_date(cls, value: str) -> str:
        text = value.strip()
        try:
            if len(text) == 10:
                date.fromisoformat(text)
            else:
                datetime.fromisoformat(text)
        except ValueError as exc:
            raise ValueError("date must be an ISO date (YYYY-MM-DD) or ISO datetime") from exc
        return text


class PredictResponse(BaseModel):
    estimatedHours: float
    modelVersion: str


class HealthResponse(BaseModel):
    status: str
    modelLoaded: bool
    modelVersion: str | None = None


class ModelHolder:
    def __init__(self, path: Path):
        self.path = path
        self.pipeline: Any = None
        self.model_version: str | None = None
        self.error: str | None = None

    def load(self) -> None:
        try:
            artifact = joblib.load(self.path)
        except Exception as exc:  # noqa: BLE001 - surface any load failure as 503
            self.pipeline, self.model_version = None, None
            self.error = f"model artifact not loaded from {self.path}: {exc}"
            logger.error(self.error)
            return
        if isinstance(artifact, dict):
            self.pipeline = artifact["pipeline"]
            self.model_version = artifact.get("model_version")
        else:
            self.pipeline = artifact
        self.model_version = self.model_version or f"xgb-{self.path.stem}"
        self.error = None

    @property
    def loaded(self) -> bool:
        return self.pipeline is not None


def resolve_model_path(model_path: str | os.PathLike | None = None) -> Path:
    return Path(model_path or os.environ.get("ML_MODEL_PATH") or DEFAULT_MODEL_PATH)


def create_app(model_path: str | os.PathLike | None = None) -> FastAPI:
    holder = ModelHolder(resolve_model_path(model_path))
    holder.load()

    app = FastAPI(title="Timesheet hours estimator", version="1.0.0")
    app.state.model = holder

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(status="ok" if holder.loaded else "degraded",
                              modelLoaded=holder.loaded, modelVersion=holder.model_version)

    @app.post("/predict", response_model=PredictResponse)
    def predict(req: PredictRequest) -> PredictResponse:
        if not holder.loaded:
            raise HTTPException(status_code=503, detail=holder.error or "model not loaded")
        frame = to_frame([{
            "client_id": req.clientId,
            "user_email": req.userEmail,
            "department": req.department,
            "description": req.description,
            "date": req.date,
        }])
        raw = float(holder.pipeline.predict(frame)[0])
        if not math.isfinite(raw):
            raw = HOURS_MIN
        hours = round(min(max(raw, HOURS_MIN), HOURS_MAX), 2)
        return PredictResponse(estimatedHours=hours, modelVersion=holder.model_version)

    return app


app = create_app()
