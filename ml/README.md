# ML: work-entry hours estimator

Predicts the hours of a timesheet entry from `clientId`, `userEmail`, `description`,
`date` and the client's `department`. XGBoost on a scikit-learn feature pipeline, served
by FastAPI. Self-contained: nothing here touches `backend/` or `frontend/`.

| File | Purpose |
|---|---|
| `extract.py` | Pulls training rows from the app's SQLite DB (`DATABASE_PATH`), falls back to synthetic data |
| `synthetic_data.py` | Seeded synthetic dataset (~2000 rows); can also insert into a SQLite DB |
| `pipeline.py` | `ColumnTransformer` + `XGBRegressor` (optionally log1p target) |
| `train.py` | Time-based split, Optuna search, baseline comparison, writes `artifacts/` |
| `serve.py` | FastAPI app (`POST /predict`, `GET /health`) |
| `artifacts/model.joblib`, `artifacts/metrics.json` | Committed trained model + metrics |
| `data/synthetic.csv` | The synthetic dataset the committed model was trained on |

## Setup

```bash
python3.12 -m venv ml/.venv
ml/.venv/bin/pip install -r ml/requirements.txt
```

`xgboost-cpu` is the official CPU-only XGBoost wheel (same `xgboost` module, without the
CUDA/NCCL download).

## Train (single command)

```bash
ml/.venv/bin/python ml/train.py                       # from the repo root
DATABASE_PATH=/path/to/timesheet.db ml/.venv/bin/python ml/train.py   # train on a real DB
```

Options: `--n-trials 50`, `--seed 42`, `--force-synthetic`, `--db PATH`, `--output-dir`.

- **Data**: `DATABASE_PATH`/`--db` is read with
  `SELECT we.client_id, we.user_email, we.description, we.date, c.name AS client_name, c.department, we.hours FROM work_entries we JOIN clients c ON we.client_id = c.id`.
  When the DB is missing, `:memory:` (the backend's default), lacks the tables or has
  fewer than 200 rows, the seeded synthetic generator is used instead and written to
  `data/synthetic.csv`. `work_entries.date` is epoch milliseconds in this app (a JS
  `Date` bound by node-sqlite3); ISO strings are handled too.
- **Features**: one-hot (`handle_unknown="ignore"`) on `client_id`, `user_email`,
  `department`; TF-IDF (500 features, 1-2 grams) on `description` (null -> `""`);
  `day_of_week`, `is_weekend`, `month` from `date`.
- **Target**: log1p-transformed (`TransformedTargetRegressor`) when the training split's
  hours skewness is > 0.75; the decision and skew value are recorded in `metrics.json`.
- **Split**: earliest 80% of rows by date for training, latest 20% for test.
- **Search**: Optuna TPE over `max_depth`, `learning_rate`, `n_estimators`,
  `min_child_weight`, with early stopping (50 rounds) on the latest 15% of the training
  split. The final model is refit on the full training split with
  `n_estimators = best_iteration + 1`.
- **Gate**: compared against a per-client median baseline (global median for unseen
  clients). `train.py` exits 1 if the model doesn't beat it on test MAE.
- **Outputs**: `artifacts/model.joblib` (dict with `pipeline`, `model_version`, ...) and
  `artifacts/metrics.json` (test/baseline MAE+RMSE, best params, `model_version`,
  `n_train`/`n_test`, `data_source`, `log_target`).

Generate or load synthetic data on its own:

```bash
ml/.venv/bin/python ml/synthetic_data.py --rows 2000 --seed 42 --csv ml/data/synthetic.csv --sqlite /tmp/timesheet.db
```

## Serve

Either of these works (`serve.py` puts `ml/` on `sys.path`, so the pickled pipeline's
`pipeline` module resolves both ways):

```bash
ml/.venv/bin/uvicorn ml.serve:app --host 0.0.0.0 --port 8000          # from the repo root
cd ml && .venv/bin/uvicorn serve:app --host 0.0.0.0 --port 8000       # from ml/
```

`ML_MODEL_PATH` overrides the artifact (default `artifacts/model.joblib` next to
`serve.py`; relative values resolve against the working directory).

Docker (build context is `ml/`):

```bash
docker build -t timesheet-ml ml/
docker run --rm -p 8000:8000 timesheet-ml
```

## Contract

`POST /predict` (`Content-Type: application/json`)

```json
{
  "clientId": 3,
  "description": "Code review for PR",
  "userEmail": "alice@example.com",
  "date": "2026-10-29",
  "department": "Engineering"
}
```

- `clientId` integer, `description` string (may be `""`), `userEmail` string, `date` ISO
  date (`YYYY-MM-DD`) or ISO datetime: all required. `department` optional (null/absent OK).
- Unknown `clientId` / `userEmail` / `department` values never error; they're ignored by
  the encoders, and `department` + `description` carry the signal for new clients.

Response 200:

```json
{ "estimatedHours": 2.5, "modelVersion": "xgb-20261029-abc123" }
```

`estimatedHours` is clipped to [0.25, 12] and rounded to 2 decimals. Errors: 422 for an
invalid body, 503 `{"detail": "..."}` when the model artifact isn't loaded.

`GET /health` -> 200 `{"status":"ok","modelLoaded":true,"modelVersion":"..."}`
(`"status":"degraded","modelLoaded":false,"modelVersion":null` when no artifact loaded).

```bash
curl -s -X POST localhost:8000/predict -H 'Content-Type: application/json' \
  -d '{"clientId":3,"description":"Code review for PR","userEmail":"alice@example.com","date":"2026-10-29","department":"Engineering"}'
```

## Tests

```bash
ml/.venv/bin/python -m pytest -q ml/tests
```
