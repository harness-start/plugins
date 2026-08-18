from __future__ import annotations

import json
import os
import subprocess
from collections.abc import Iterable, Mapping
from pathlib import Path


def _git(workspace: Path, *args: str, text: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-c", f"safe.directory={workspace}", "-C", str(workspace), *args],
        check=False,
        capture_output=True,
        text=text,
    )


def _untracked_paths(workspace: Path) -> list[str]:
    result = _git(workspace, "ls-files", "--others", "--exclude-standard", "-z", text=False)
    if result.returncode != 0:
        raise RuntimeError("failed to enumerate untracked files")
    return [os.fsdecode(path) for path in result.stdout.split(b"\0") if path]


def _untracked_diff(workspace: Path, relative_path: str) -> str:
    result = subprocess.run(
        ["git", "diff", "--no-index", "--binary", "--", "/dev/null", relative_path],
        cwd=workspace,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode not in {0, 1}:
        raise RuntimeError(f"failed to collect patch for untracked path: {relative_path}")
    return result.stdout


def collect_patch(workspace: Path) -> str:
    tracked = _git(workspace, "diff", "--binary", "HEAD")
    if tracked.returncode != 0:
        raise RuntimeError("failed to collect tracked Git diff")
    untracked = "".join(
        _untracked_diff(workspace, path) for path in _untracked_paths(workspace)
    )
    return tracked.stdout + untracked


def write_predictions(path: Path, rows: Iterable[Mapping[str, object]]) -> None:
    required = ("instance_id", "model_name_or_path", "model_patch")
    lines: list[str] = []
    for row in rows:
        if any(not isinstance(row.get(field), str) for field in required):
            raise ValueError("prediction rows require string instance_id, model_name_or_path, and model_patch")
        normalized = {field: row[field] for field in required}
        lines.append(json.dumps(normalized, ensure_ascii=False))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
