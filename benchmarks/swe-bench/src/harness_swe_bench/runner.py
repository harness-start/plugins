from __future__ import annotations

import json
import os
import subprocess
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from harness_swe_bench.config import SuiteConfig, load_suite
from harness_swe_bench.dataset import DatasetSnapshot, snapshot_dataset
from harness_swe_bench.evaluate import evaluation_command, run_evaluation
from harness_swe_bench.harness import (
    marketplace_plugins,
    materialize_marketplace,
    payload_fingerprint,
)
from harness_swe_bench.patch import write_predictions
from harness_swe_bench.preflight import static_preflight
from harness_swe_bench.report import official_report, write_stage1_report
from harness_swe_bench.runtime import DockerRuntime

GOLD_INSTANCE = "sympy__sympy-20590"


def gold_suite_config(suite: SuiteConfig) -> SuiteConfig:
    return replace(
        suite,
        suite=f"{suite.suite}-gold-smoke",
        instances=(GOLD_INSTANCE,),
    )


def utc_run_id(prefix: str) -> str:
    return datetime.now(timezone.utc).strftime(f"%Y%m%dT%H%M%SZ-{prefix}")


def read_api_key(repo_root: Path) -> str:
    key = os.environ.get("DEEPSEEK_API_KEY")
    if key:
        return key
    env_file = repo_root / ".env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            if name.strip() == "DEEPSEEK_API_KEY":
                key = value.strip().strip("'\"")
                break
    if not key:
        raise RuntimeError("DEEPSEEK_API_KEY is required")
    return key


def source_metadata(repo_root: Path, suite: SuiteConfig, snapshot: DatasetSnapshot) -> dict[str, object]:
    commit = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=repo_root, text=True
    ).strip()
    status = subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=repo_root, text=True
    )
    return {
        "harness_commit": commit,
        "source_clean": not bool(status.strip()),
        "source_status_sha256": __import__("hashlib").sha256(status.encode()).hexdigest(),
        "payload_fingerprint": payload_fingerprint(repo_root),
        "plugins": list(marketplace_plugins(repo_root)),
        "dataset_name": suite.dataset.name,
        "dataset_revision": suite.dataset.revision,
        "dataset_snapshot": str(snapshot.path),
        "dataset_snapshot_sha256": snapshot.sha256,
        "model": suite.model.name,
        "reasoning_effort": suite.model.reasoning_effort,
        "toolchain": {
            "swebench": suite.toolchain.swebench,
            "claude_code": suite.toolchain.claude_code,
            "codex": suite.toolchain.codex,
        },
    }


def prepare_run_dir(runs_root: Path, run_id: str, *, resume: bool) -> Path:
    run_dir = runs_root / run_id
    if run_dir.exists() and not resume:
        raise RuntimeError(f"run already exists; use a new run ID or --resume: {run_dir}")
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


def run_check(repo_root: Path, benchmark_root: Path, suite: SuiteConfig) -> dict[str, object]:
    result = static_preflight(repo_root, benchmark_root, suite)
    snapshot = snapshot_dataset(suite, benchmark_root / ".cache")
    runtime = DockerRuntime(repo_root, benchmark_root, suite)
    runtime.build_support_images()
    runtime.verify_network_policy(benchmark_root / ".cache" / "network-check.log")
    return {**result, "dataset_snapshot_sha256": snapshot.sha256, "network_policy": "pass"}


def run_gold_smoke(
    repo_root: Path,
    benchmark_root: Path,
    suite: SuiteConfig,
    run_id: str,
) -> bool:
    static_preflight(repo_root, benchmark_root, suite)
    gold_suite = gold_suite_config(suite)
    snapshot = snapshot_dataset(gold_suite, benchmark_root / ".cache")
    run_dir = prepare_run_dir(benchmark_root / "runs", run_id, resume=False)
    evaluation_dir = run_dir / "evaluation"
    command = evaluation_command(
        snapshot=snapshot.path,
        predictions="gold",
        run_id=run_id,
        instance_ids=(GOLD_INSTANCE,),
        max_workers=1,
        timeout_sec=suite.grader.timeout_sec,
        cache_level=suite.grader.cache_level,
        report_dir=evaluation_dir / "instances",
    )
    exit_code = run_evaluation(command, cwd=evaluation_dir)
    report = official_report(evaluation_dir, run_id) if exit_code == 0 else {}
    result = {
        "schema_version": 1,
        "run_id": run_id,
        "instance_id": GOLD_INSTANCE,
        "grader_exit": exit_code,
        "resolved": GOLD_INSTANCE in report.get("resolved_ids", []),
        "official_report": report,
    }
    (run_dir / "report.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return bool(result["resolved"] and exit_code == 0)


def _load_or_run_cell(
    *,
    resume: bool,
    runtime: DockerRuntime,
    run_id: str,
    instance: dict[str, Any],
    host: str,
    image,
    cell_dir: Path,
    marketplace_root: Path,
    prompt_template: Path,
    api_key: str,
) -> dict[str, object]:
    status = cell_dir / "status.json"
    if resume and status.is_file():
        data = json.loads(status.read_text(encoding="utf-8"))
        if data.get("instance_id") != instance["instance_id"] or data.get("host") != host:
            raise RuntimeError(f"resume status identity mismatch: {status}")
        return data
    if resume and cell_dir.exists():
        raise RuntimeError(
            f"resume found an incomplete cell; use a new run ID to preserve one attempt: {cell_dir}"
        )
    return runtime.run_cell(
        run_id=run_id,
        instance=instance,
        host=host,
        image=image,
        cell_dir=cell_dir,
        marketplace_root=marketplace_root,
        prompt_template=prompt_template,
        api_key=api_key,
    )


def _require_pipeline_ok(cell: dict[str, object]) -> None:
    if cell.get("pipeline_ok") is True:
        return
    instance_id = str(cell.get("instance_id", "unknown"))
    host = str(cell.get("host", "unknown"))
    raise RuntimeError(
        f"agent cell failed for {instance_id} on {host}; "
        "official evaluation was not started"
    )


def run_stage1(
    repo_root: Path,
    benchmark_root: Path,
    suite: SuiteConfig,
    run_id: str,
    *,
    resume: bool,
) -> dict[str, Any]:
    preflight = static_preflight(repo_root, benchmark_root, suite)
    api_key = read_api_key(repo_root)
    snapshot = snapshot_dataset(suite, benchmark_root / ".cache")
    run_dir = prepare_run_dir(benchmark_root / "runs", run_id, resume=resume)
    runtime = DockerRuntime(repo_root, benchmark_root, suite)
    runtime.build_support_images()
    runtime.verify_network_policy(run_dir / "network-check.log")
    marketplace_root = run_dir / "marketplace"
    if not marketplace_root.exists():
        materialize_marketplace(repo_root, marketplace_root)
    metadata = {"run_id": run_id, "suite": suite.suite, **source_metadata(repo_root, suite, snapshot), **preflight}
    (run_dir / "run.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    (run_dir / "dataset.snapshot.json").write_bytes(snapshot.path.read_bytes())

    by_id = {str(row["instance_id"]): row for row in snapshot.rows}
    cells: list[dict[str, object]] = []
    prompt_template = benchmark_root / "prompts" / "issue-fix.md"
    for instance_id in suite.instances:
        instance = by_id[instance_id]
        image = runtime.ensure_agent_image(instance)
        for host in suite.hosts:
            cell_dir = run_dir / "instances" / instance_id / host
            cell = _load_or_run_cell(
                resume=resume,
                runtime=runtime,
                run_id=run_id,
                instance=instance,
                host=host,
                image=image,
                cell_dir=cell_dir,
                marketplace_root=marketplace_root,
                prompt_template=prompt_template,
                api_key=api_key,
            )
            cells.append(cell)
            _require_pipeline_ok(cell)

    for host in suite.hosts:
        host_cells = [cell for cell in cells if cell["host"] == host]
        predictions = []
        for cell in host_cells:
            patch_path = run_dir / "instances" / str(cell["instance_id"]) / host / "patch.diff"
            patch = patch_path.read_text(encoding="utf-8") if patch_path.is_file() else ""
            predictions.append(
                {
                    "instance_id": cell["instance_id"],
                    "model_name_or_path": f"{host}+{suite.model.name}+harness-full+effort-{suite.model.reasoning_effort}",
                    "model_patch": patch,
                }
            )
        predictions_path = run_dir / "predictions" / f"{host}.jsonl"
        write_predictions(predictions_path, predictions)
        eval_run_id = f"{run_id}-{host}"
        evaluation_dir = run_dir / "evaluation" / host
        command = evaluation_command(
            snapshot=run_dir / "dataset.snapshot.json",
            predictions=predictions_path,
            run_id=eval_run_id,
            instance_ids=suite.instances,
            max_workers=suite.grader.max_workers,
            timeout_sec=suite.grader.timeout_sec,
            cache_level=suite.grader.cache_level,
            report_dir=evaluation_dir / "instances",
        )
        grader_exit = run_evaluation(command, cwd=evaluation_dir)
        grader = official_report(evaluation_dir, eval_run_id) if grader_exit == 0 else {}
        resolved_ids = set(grader.get("resolved_ids", []))
        completed_ids = set(grader.get("completed_ids", []))
        error_ids = set(grader.get("error_ids", []))
        (evaluation_dir / "official-report.json").write_text(
            json.dumps(grader, indent=2) + "\n", encoding="utf-8"
        )
        for cell in host_cells:
            instance_id = str(cell["instance_id"])
            cell["grader_exit"] = grader_exit
            cell["grader_completed"] = instance_id in completed_ids
            cell["resolved"] = instance_id in resolved_ids
            cell["pipeline_ok"] = bool(
                cell.get("pipeline_ok") is True
                and grader_exit == 0
                and instance_id in completed_ids
                and instance_id not in error_ids
            )
            status_path = run_dir / "instances" / instance_id / host / "status.json"
            status_path.write_text(json.dumps(cell, indent=2) + "\n", encoding="utf-8")

    return write_stage1_report(run_dir, metadata=metadata, cells=cells)


def load_report(benchmark_root: Path, run_id: str) -> dict[str, Any]:
    path = benchmark_root / "runs" / run_id / "report.json"
    if not path.is_file():
        raise RuntimeError(f"run report does not exist: {path}")
    return json.loads(path.read_text(encoding="utf-8"))
