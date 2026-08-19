from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

STAGE1_INSTANCES = (
    "astropy__astropy-12907",
    "django__django-10914",
    "django__django-11001",
)
STAGE1_HOSTS = ("claude", "codex")
STAGE1_CELLS = tuple(
    (instance_id, host)
    for instance_id in STAGE1_INSTANCES
    for host in STAGE1_HOSTS
)


def required_cells(
    instances: Iterable[str], hosts: Iterable[str]
) -> tuple[tuple[str, str], ...]:
    return tuple((instance_id, host) for instance_id in instances for host in hosts)


def suite_passes(
    cells: Iterable[Mapping[str, object]],
    required: Iterable[tuple[str, str]],
) -> bool:
    """Return true only when every configured cell passes on its first attempt."""
    rows = list(cells)
    expected = tuple(required)
    observed = [(row.get("instance_id"), row.get("host")) for row in rows]
    if len(rows) != len(expected) or set(observed) != set(expected):
        return False
    if len(set(observed)) != len(observed):
        return False
    return all(
        row.get("attempt") == 1
        and row.get("pipeline_ok") is True
        and row.get("resolved") is True
        for row in rows
    )


def stage1_passes(cells: Iterable[Mapping[str, object]]) -> bool:
    """Return true only for the exact six required, first-attempt successes."""
    return suite_passes(cells, STAGE1_CELLS)


def official_report(evaluation_dir: Path, run_id: str) -> dict[str, Any]:
    matches = sorted(evaluation_dir.glob(f"*.{run_id}.json"))
    if len(matches) != 1:
        raise ValueError(
            f"expected one official report for {run_id}, found {len(matches)}"
        )
    data = json.loads(matches[0].read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("official SWE-bench report must be a JSON object")
    return data


def write_suite_report(
    run_dir: Path,
    *,
    metadata: Mapping[str, object],
    cells: Iterable[Mapping[str, object]],
    required: Iterable[tuple[str, str]],
) -> dict[str, Any]:
    rows = [dict(row) for row in cells]
    expected = tuple(required)
    passed = suite_passes(rows, expected)
    resolved = sum(row.get("resolved") is True for row in rows)
    report: dict[str, Any] = {
        "schema_version": 1,
        **dict(metadata),
        "cells": rows,
        "resolved": resolved,
        "required": len(expected),
        "suite_pass": passed,
    }
    if expected == STAGE1_CELLS:
        # Kept only for consumers of the original stage-1 report schema.
        report["stage_pass"] = passed
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    suite_name = metadata.get("suite", "<unknown>")
    lines = [
        f"# SWE-bench suite {suite_name}: {metadata.get('run_id', '<unknown>')}",
        "",
        f"**{'PASS' if passed else 'FAIL'} — {resolved}/{len(expected)} officially resolved**",
        "",
        "| Instance | Host | Pipeline | Resolved |",
        "| --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            "| {instance_id} | {host} | {pipeline} | {resolved} |".format(
                instance_id=row.get("instance_id", ""),
                host=row.get("host", ""),
                pipeline="PASS" if row.get("pipeline_ok") is True else "FAIL",
                resolved="PASS" if row.get("resolved") is True else "FAIL",
            )
        )
    (run_dir / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return report


def write_stage1_report(
    run_dir: Path,
    *,
    metadata: Mapping[str, object],
    cells: Iterable[Mapping[str, object]],
) -> dict[str, Any]:
    return write_suite_report(
        run_dir,
        metadata=metadata,
        cells=cells,
        required=STAGE1_CELLS,
    )
