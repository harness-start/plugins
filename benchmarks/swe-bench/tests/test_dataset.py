from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

from harness_swe_bench.config import load_suite
from harness_swe_bench.dataset import snapshot_dataset


ROOT = Path(__file__).resolve().parents[1]


def test_snapshot_uses_pinned_revision_and_config_order(tmp_path: Path, monkeypatch) -> None:
    suite = load_suite(ROOT / "config" / "stage1.yaml")
    observed: dict[str, object] = {}
    rows = [
        {"instance_id": "django__django-11001", "problem_statement": "third"},
        {"instance_id": "astropy__astropy-12907", "problem_statement": "first"},
        {"instance_id": "django__django-10914", "problem_statement": "second"},
        {"instance_id": "unselected", "patch": "must not be selected"},
    ]

    def fake_load_dataset(name: str, *, split: str, revision: str):
        observed.update(name=name, split=split, revision=revision)
        return rows

    monkeypatch.setitem(sys.modules, "datasets", SimpleNamespace(load_dataset=fake_load_dataset))

    snapshot = snapshot_dataset(suite, tmp_path)
    selected = json.loads(snapshot.path.read_text(encoding="utf-8"))

    assert observed == {
        "name": suite.dataset.name,
        "split": "test",
        "revision": suite.dataset.revision,
    }
    assert [row["instance_id"] for row in selected] == list(suite.instances)
    assert snapshot.sha256 == __import__("hashlib").sha256(snapshot.path.read_bytes()).hexdigest()
