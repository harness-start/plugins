from __future__ import annotations

import subprocess
from pathlib import Path

from harness_swe_bench.patch import collect_patch, write_predictions


def git(repo: Path, *args: str, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], cwd=repo, input=input_text, check=True, capture_output=True, text=True
    )


def test_collect_patch_includes_untracked_binary_and_remains_applicable(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    git(source, "init", "-q")
    git(source, "config", "user.email", "benchmark@example.invalid")
    git(source, "config", "user.name", "Benchmark")
    (source / "tracked.py").write_text("VALUE = 1\n", encoding="utf-8")
    git(source, "add", "tracked.py")
    git(source, "commit", "-qm", "base")
    (source / "tracked.py").write_text("VALUE = 2\n", encoding="utf-8")
    (source / "new module.py").write_text("NEW = True\n", encoding="utf-8")
    (source / "blob.bin").write_bytes(b"\x00\x01\x02")

    patch = collect_patch(source)

    assert "tracked.py" in patch
    assert "new module.py" in patch
    assert "blob.bin" in patch
    assert "GIT binary patch" in patch
    clean = tmp_path / "clean"
    git(tmp_path, "clone", "-q", str(source), str(clean))
    git(clean, "apply", "--check", "-", input_text=patch)


def test_write_predictions_uses_official_jsonl_shape(tmp_path: Path) -> None:
    path = tmp_path / "predictions.jsonl"
    write_predictions(
        path,
        [{"instance_id": "owner__repo-1", "model_name_or_path": "model", "model_patch": "diff"}],
    )
    assert path.read_text(encoding="utf-8") == (
        '{"instance_id": "owner__repo-1", "model_name_or_path": "model", "model_patch": "diff"}\n'
    )
