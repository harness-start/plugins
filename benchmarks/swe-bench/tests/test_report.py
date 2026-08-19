from __future__ import annotations

import json

from harness_swe_bench.report import (
    STAGE1_CELLS,
    official_report,
    required_cells,
    stage1_passes,
    suite_passes,
    write_suite_report,
    write_stage1_report,
)


def resolved_cells() -> list[dict[str, object]]:
    return [
        {
            "instance_id": instance_id,
            "host": host,
            "attempt": 1,
            "pipeline_ok": True,
            "resolved": True,
        }
        for instance_id, host in STAGE1_CELLS
    ]


def test_stage1_passes_only_for_exact_single_attempt_six_of_six() -> None:
    assert stage1_passes(resolved_cells()) is True


def test_stage1_fails_for_unresolved_missing_or_duplicate_cells() -> None:
    unresolved = resolved_cells()
    unresolved[0]["resolved"] = False
    assert stage1_passes(unresolved) is False
    assert stage1_passes(resolved_cells()[:-1]) is False
    assert stage1_passes([*resolved_cells(), resolved_cells()[0]]) is False


def test_stage1_fails_when_attempt_is_not_one_or_pipeline_failed() -> None:
    retried = resolved_cells()
    retried[0]["attempt"] = 2
    assert stage1_passes(retried) is False
    failed_pipeline = resolved_cells()
    failed_pipeline[0]["pipeline_ok"] = False
    assert stage1_passes(failed_pipeline) is False


def test_write_stage1_report_persists_machine_and_human_verdicts(tmp_path) -> None:
    report = write_stage1_report(
        tmp_path,
        metadata={"run_id": "run-1", "dataset_revision": "revision"},
        cells=resolved_cells(),
    )

    assert report["schema_version"] == 1
    assert report["stage_pass"] is True
    assert report["resolved"] == 6
    assert json.loads((tmp_path / "report.json").read_text(encoding="utf-8"))["stage_pass"] is True
    markdown = (tmp_path / "report.md").read_text(encoding="utf-8")
    assert "6/6" in markdown and "PASS" in markdown


def test_suite_report_uses_configured_instances_and_hosts_as_the_exact_gate(tmp_path) -> None:
    required = required_cells(
        ("owner__repo-1", "owner__repo-2"),
        ("claude", "codex"),
    )
    cells = [
        {
            "instance_id": instance_id,
            "host": host,
            "attempt": 1,
            "pipeline_ok": True,
            "resolved": True,
        }
        for instance_id, host in required
    ]

    report = write_suite_report(
        tmp_path,
        metadata={"run_id": "run-2", "suite": "followup-two"},
        cells=cells,
        required=required,
    )

    assert suite_passes(cells, required) is True
    assert report["required"] == 4
    assert report["suite_pass"] is True
    assert "stage_pass" not in report
    markdown = (tmp_path / "report.md").read_text(encoding="utf-8")
    assert "SWE-bench suite followup-two" in markdown
    assert "4/4" in markdown


def test_official_report_selects_exact_run_report(tmp_path) -> None:
    expected = {"resolved_ids": ["one"], "error_ids": []}
    (tmp_path / "model.run-1.json").write_text(json.dumps(expected), encoding="utf-8")
    (tmp_path / "unrelated.json").write_text("{}", encoding="utf-8")
    assert official_report(tmp_path, "run-1") == expected
