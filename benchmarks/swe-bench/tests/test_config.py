from __future__ import annotations

from pathlib import Path

import pytest

from harness_swe_bench.config import load_suite
from harness_swe_bench.report import STAGE1_HOSTS, STAGE1_INSTANCES


ROOT = Path(__file__).resolve().parents[1]


def test_committed_stage1_suite_matches_frozen_acceptance_baseline() -> None:
    suite = load_suite(ROOT / "config" / "stage1.yaml")

    assert suite.dataset.name == "princeton-nlp/SWE-bench_Lite"
    assert suite.dataset.revision == "6ec7bb89b9342f664a54a6e0a6ea6501d3437cc2"
    assert suite.instances == STAGE1_INSTANCES
    assert suite.hosts == STAGE1_HOSTS
    assert suite.model.name == "deepseek-v4-flash"
    assert suite.model.reasoning_effort == "high"
    assert suite.agent.attempts == 1
    assert suite.network.allowed_hosts == ("api.deepseek.com",)
    assert suite.grader.max_workers == 1


def test_suite_rejects_duplicate_instances_and_retry_policy(tmp_path: Path) -> None:
    config = tmp_path / "bad.yaml"
    config.write_text(
        """
schema_version: 1
suite: bad
dataset: {name: dataset, revision: deadbeef, split: test}
instances: [same, same]
hosts: [claude, codex]
model: {name: deepseek-v4-flash, api_host: api.deepseek.com, reasoning_effort: high}
agent: {timeout_sec: 10, attempts: 2}
harness: {mode: full}
network: {allowed_hosts: [api.deepseek.com]}
grader: {max_workers: 1, timeout_sec: 10, cache_level: env}
toolchain: {swebench: 4.1.0, claude_code: 2.1.170, codex: 0.147.0}
""",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="unique|attempts"):
        load_suite(config)
