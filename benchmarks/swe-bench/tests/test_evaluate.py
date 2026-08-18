from __future__ import annotations

from pathlib import Path

from harness_swe_bench.evaluate import evaluation_command


def test_evaluation_command_uses_local_snapshot_and_selected_instances(tmp_path: Path) -> None:
    snapshot = tmp_path / "dataset.json"
    predictions = tmp_path / "preds.jsonl"
    report_dir = tmp_path / "report"

    command = evaluation_command(
        snapshot=snapshot,
        predictions=predictions,
        run_id="run-1",
        instance_ids=("one", "two"),
        max_workers=1,
        timeout_sec=1800,
        cache_level="env",
        report_dir=report_dir,
    )

    assert command[:3] == ["python", "-m", "harness_swe_bench.official_evaluator"]
    assert command[command.index("--dataset_name") + 1] == str(snapshot.resolve())
    assert command[command.index("--predictions_path") + 1] == str(predictions.resolve())
    assert command[command.index("--instance_ids") + 1 :] == ["one", "two"]
    assert command[command.index("--max_workers") + 1] == "1"
    assert command[command.index("--report_dir") + 1] == str(report_dir.resolve())
