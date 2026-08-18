from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

from harness_swe_bench.config import SuiteConfig


@dataclass(frozen=True)
class DatasetSnapshot:
    path: Path
    sha256: str
    rows: tuple[dict[str, object], ...]


def _safe_segment(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-.")


def snapshot_dataset(suite: SuiteConfig, cache_dir: Path) -> DatasetSnapshot:
    from datasets import load_dataset

    dataset = load_dataset(
        suite.dataset.name,
        split=suite.dataset.split,
        revision=suite.dataset.revision,
    )
    by_id = {str(row.get("instance_id")): dict(row) for row in dataset}
    missing = [instance_id for instance_id in suite.instances if instance_id not in by_id]
    if missing:
        raise ValueError(f"dataset is missing configured instance(s): {', '.join(missing)}")
    rows = tuple(by_id[instance_id] for instance_id in suite.instances)
    target_dir = cache_dir / "datasets" / suite.dataset.revision
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / f"{_safe_segment(suite.suite)}.json"
    payload = json.dumps(rows, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    path.write_text(payload, encoding="utf-8")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return DatasetSnapshot(path=path.resolve(), sha256=digest, rows=rows)
