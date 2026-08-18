from __future__ import annotations

import subprocess
from pathlib import Path


def evaluation_command(
    *,
    snapshot: Path,
    predictions: Path | str,
    run_id: str,
    instance_ids: tuple[str, ...],
    max_workers: int,
    timeout_sec: int,
    cache_level: str,
    report_dir: Path,
) -> list[str]:
    prediction_arg = predictions if isinstance(predictions, str) else str(predictions.resolve())
    command = [
        "python",
        "-m",
        "harness_swe_bench.official_evaluator",
        "--dataset_name",
        str(snapshot.resolve()),
        "--predictions_path",
        prediction_arg,
        "--max_workers",
        str(max_workers),
        "--timeout",
        str(timeout_sec),
        "--run_id",
        run_id,
        "--cache_level",
        cache_level,
        "--report_dir",
        str(report_dir.resolve()),
        "--instance_ids",
        *instance_ids,
    ]
    return command


def run_evaluation(command: list[str], *, cwd: Path) -> int:
    cwd.mkdir(parents=True, exist_ok=True)
    return subprocess.run(command, cwd=cwd, check=False).returncode
