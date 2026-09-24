# Work Entry Model Evaluation

Offline evaluation harness for models that predict the **hours** of a timesheet-app work
entry. It loads historical work entries, splits them into train/validation/test sets,
trains a baseline linear regression, and writes a JSON report plus a markdown summary
that covers:

- RMSE, MAE and R² on every split, next to a mean-predictor reference
- performance per client segment, per project type, and per segment × project type pair
- a prediction-bias check that flags groups the model systematically over- or
  under-predicts

The harness is self-contained Python. It doesn't touch the backend or the frontend.

## Setup

Requires Python 3.11 or newer.

```bash
cd ml/evaluation
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt        # runtime
pip install -r requirements-dev.txt    # + pytest, ruff
```

## Quick start

```bash
# 1. Write a deterministic synthetic dataset (for demos, or when you have no export)
python -m timesheet_eval generate-sample --rows 2000 --out data/sample_work_entries.csv

# 2. Evaluate
python -m timesheet_eval evaluate --data data/sample_work_entries.csv --output-dir output
# -> output/report.json, output/report.md
```

`data/` and `output/` are git-ignored. Real exports contain user emails, so don't commit
them.

## Input data

The backend uses an in-memory SQLite database by default (see the root README), so there's
no persistent history to read from directly. Pass `--data` one of the following:

| Format | Notes |
|---|---|
| `.csv` | Needs `hours` and `date` columns. Header matching ignores case and treats spaces as underscores, so the app's per-client CSV export (`Date,Hours,Description,Created At`) loads as-is. |
| `.json` | A list of records, or the API envelope `{"workEntries": [...]}`. |
| `.db` / `.sqlite` / `.sqlite3` | A file-based copy of the app database. The harness opens it read-only and runs a parameterized query that joins `work_entries` to `clients` on both `client_id` and `user_email`. |

Recognised columns: `id`, `client_id`, `client_name`, `department`, `client_segment`,
`project_type`, `user_email`, `hours`, `date`, `description`. Rows with missing or
non-numeric hours, hours outside `(0, 24]`, or unparseable dates are dropped and counted in
the report.

Pass `--user-email someone@example.com` to evaluate only one user's entries. This matches
the app's per-user data isolation.

### Segments and project types

The app's schema has no explicit "client segment" or "project type" field, so the harness
derives them:

- **Client segment**: the `client_segment` column if present, otherwise the client's
  `department`. Blank values become `Unassigned`.
- **Project type**: the `project_type` column if present, otherwise a keyword
  classification of `description`. Rules are checked in order and the first match wins.
  Anything that matches no rule becomes `other`. The default rules are in
  `timesheet_eval/config.py`. To override them, pass a JSON file with
  `--project-type-rules rules.json`:

  ```json
  {"development": ["implement", "fix", "bug"], "meetings": ["meeting", "sync", "call"]}
  ```

## Configuration

| Flag | Default | Meaning |
|---|---|---|
| `--train-ratio` / `--validation-ratio` / `--test-ratio` | 0.7 / 0.15 / 0.15 | Each must be in (0, 1), and together they must sum to 1. |
| `--split-strategy` | `random` | `random` shuffles with a seed. `chronological` sorts by date, so validation and test are strictly later than train. Use it to estimate forward-looking performance. |
| `--seed` | 42 | RNG seed for the random split. |
| `--analysis-split` | `test` | The split used for the segment and bias analysis. |
| `--min-segment-size` | 10 | Groups with fewer rows are reported, marked as low support, and not bias-tested. |
| `--bias-alpha` | 0.05 | Significance level, applied after the Holm correction. |
| `--bias-threshold-hours` | 0.25 | The smallest \|mean error\| that counts as material. |

## Model

`LinearRegression` in a scikit-learn pipeline:

- Categorical features, one-hot encoded (unseen categories are ignored): `client_segment`,
  `project_type`, `day_of_week`
- Numeric features, standardized: `description_word_count`, and the month encoded
  cyclically as `month_sin` and `month_cos`

Every feature comes from fields that are known when an entry is created, so none of them
leak the target. A `DummyRegressor(mean)` trained on the same training split is reported
alongside as a reference: a useful model should beat it on every split.

To evaluate a different model, change `build_baseline_model` in
`timesheet_eval/model.py`. It must return any scikit-learn regressor that accepts the frame
from `build_features`.

## Bias check

The error is `predicted - actual`. For each group in each dimension, the harness reports:

- mean and median error, and a 95% confidence interval for the mean
- the over-prediction rate: the share of rows where the model predicted too many hours
- a one-sample t-test of mean error = 0, with p-values Holm-adjusted across the groups of
  that dimension

A group is **flagged** when all three of these hold:

- it has at least `min_segment_size` rows
- its adjusted p-value is below `alpha`
- its |mean error| is at least `threshold_hours`

Flagged groups report `over-predicts` or `under-predicts`.

On the training data, an OLS model with a one-hot feature for a category always has zero
mean residual within each level of that category. So on held-out data, per-segment and
per-project-type bias mostly reflects distribution shift, which is common with a
chronological split. The **segment × project type** dimension catches structure that an
additive model can't represent. For example, the synthetic dataset includes an
Engineering/development interaction, and the harness flags it as `under-predicts`.

## Report layout

`report.json` (`schema_version: 1`) contains these top-level keys:

```
dataset            source, row counts, date range, segment / project-type counts
config             the full EvalConfig used
split              strategy, seed, ratios, sizes, per-split date ranges
model              model type, target, features, encoded feature count
metrics            {train, validation, test} -> n, rmse, mae, r2, mean_actual, mean_predicted
reference_metrics  mean_predictor -> same shape as metrics
segments           analysis_split + {client_segment, project_type, segment_x_project_type}: [...]
bias               analysis_split, method params, per-dimension rows, flagged: [...]
warnings           human-readable caveats (dropped rows, low-support groups, unseen categories)
```

`report.md` summarizes the same data as tables. Floats in the JSON are rounded to 6
decimals, and undefined values (for example, R² on a constant target) are `null`.

## Development

```bash
pytest -q
ruff check . && ruff format --check .
```
