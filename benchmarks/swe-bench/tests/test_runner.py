from __future__ import annotations

from pathlib import Path

import pytest

from harness_swe_bench.config import load_suite
from harness_swe_bench.runner import (
    GOLD_INSTANCE,
    _load_or_run_cell,
    _require_pipeline_ok,
    gold_suite_config,
    prepare_run_dir,
)


ROOT = Path(__file__).resolve().parents[1]


def test_gold_suite_has_an_independent_snapshot_cache_key() -> None:
    suite = load_suite(ROOT / "config" / "stage1.yaml")

    gold = gold_suite_config(suite)

    assert gold.instances == (GOLD_INSTANCE,)
    assert gold.suite == f"{suite.suite}-gold-smoke"


def test_run_directory_requires_explicit_resume(tmp_path: Path) -> None:
    first = prepare_run_dir(tmp_path, "fixed", resume=False)
    assert first.is_dir()

    try:
        prepare_run_dir(tmp_path, "fixed", resume=False)
    except RuntimeError as error:
        assert "--resume" in str(error)
    else:
        raise AssertionError("existing run directory was silently reused")

    assert prepare_run_dir(tmp_path, "fixed", resume=True) == first


def test_resume_refuses_an_incomplete_cell(tmp_path: Path) -> None:
    cell_dir = tmp_path / "instances" / "owner__repo-1" / "codex"
    cell_dir.mkdir(parents=True)
    (cell_dir / "host.log").write_text("agent started\n", encoding="utf-8")

    class RuntimeThatMustNotRun:
        def run_cell(self, **kwargs):
            raise AssertionError("resume attempted a second model call")

    with pytest.raises(RuntimeError, match="new run ID"):
        _load_or_run_cell(
            resume=True,
            runtime=RuntimeThatMustNotRun(),
            run_id="interrupted",
            instance={"instance_id": "owner__repo-1"},
            host="codex",
            image=object(),
            cell_dir=cell_dir,
            marketplace_root=tmp_path / "marketplace",
            prompt_template=tmp_path / "prompt.md",
            api_key="not-a-real-secret",
        )


def test_stage_run_rejects_a_failed_agent_cell_before_evaluation() -> None:
    failed = {
        "instance_id": "owner__repo-1",
        "host": "codex",
        "attempt": 1,
        "pipeline_ok": False,
    }

    with pytest.raises(RuntimeError, match="official evaluation was not started"):
        _require_pipeline_ok(failed)
