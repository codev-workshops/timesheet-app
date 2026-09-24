import json
from datetime import UTC, datetime

from timesheet_eval.cli import main
from timesheet_eval.config import EvalConfig
from timesheet_eval.pipeline import run_evaluation
from timesheet_eval.report import render_markdown, to_serializable, write_json

FIXED_TIME = datetime(2026, 1, 1, tzinfo=UTC)


def test_report_structure(sample_data, config):
    report = run_evaluation(sample_data, config, generated_at=FIXED_TIME)
    assert set(report["metrics"]) == {"train", "validation", "test"}
    for split in report["metrics"].values():
        assert {"rmse", "mae", "r2"} <= set(split)
    assert sum(report["split"]["sizes"].values()) == len(sample_data.frame)
    for dim in ("client_segment", "project_type", "segment_x_project_type"):
        assert report["segments"][dim]
        assert report["bias"][dim]


def test_baseline_beats_mean_reference(sample_data, config):
    report = run_evaluation(sample_data, config, generated_at=FIXED_TIME)
    ref = report["reference_metrics"]["mean_predictor"]["test"]
    assert report["metrics"]["test"]["rmse"] < ref["rmse"]
    assert report["metrics"]["test"]["r2"] > 0.5


def test_planted_interaction_bias_is_detected(sample_data, config):
    report = run_evaluation(sample_data, config, generated_at=FIXED_TIME)
    flagged = {(f["dimension"], f["group"]): f for f in report["bias"]["flagged"]}
    key = ("segment_x_project_type", "Engineering / development")
    assert key in flagged
    assert flagged[key]["direction"] == "under-predicts"


def test_report_is_deterministic(sample_data):
    cfg = EvalConfig(split_strategy="chronological")
    a = run_evaluation(sample_data, cfg, generated_at=FIXED_TIME)
    b = run_evaluation(sample_data, cfg, generated_at=FIXED_TIME)
    assert json.dumps(to_serializable(a)) == json.dumps(to_serializable(b))


def test_json_and_markdown_outputs(sample_data, config, tmp_path):
    report = run_evaluation(sample_data, config, generated_at=FIXED_TIME)
    path = tmp_path / "report.json"
    write_json(report, path)
    loaded = json.loads(path.read_text())
    assert loaded["schema_version"] == 1
    md = render_markdown(to_serializable(report))
    assert "## Overall metrics" in md
    assert "## Prediction bias" in md
    assert "Engineering / development" in md


def test_cli_end_to_end(tmp_path, capsys):
    data = tmp_path / "entries.csv"
    out = tmp_path / "out"
    assert main(["generate-sample", "--rows", "600", "--out", str(data)]) == 0
    assert (
        main(
            [
                "evaluate",
                "--data",
                str(data),
                "--output-dir",
                str(out),
                "--train-ratio",
                "0.6",
                "--validation-ratio",
                "0.2",
                "--test-ratio",
                "0.2",
                "--split-strategy",
                "chronological",
            ]
        )
        == 0
    )
    report = json.loads((out / "report.json").read_text())
    assert report["split"]["sizes"] == {"train": 360, "validation": 120, "test": 120}
    assert (out / "report.md").read_text().startswith("# Work Entry Hours Model")
    assert "wrote" in capsys.readouterr().out


def test_cli_rejects_bad_ratios(tmp_path, capsys):
    data = tmp_path / "entries.csv"
    main(["generate-sample", "--rows", "50", "--out", str(data)])
    code = main(["evaluate", "--data", str(data), "--train-ratio", "0.9"])
    assert code == 2
    assert "sum to 1.0" in capsys.readouterr().err
