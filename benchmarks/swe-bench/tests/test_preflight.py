from __future__ import annotations

from pathlib import Path

import pytest

from harness_swe_bench.config import load_suite
from harness_swe_bench.preflight import validate_network_allowlist


ROOT = Path(__file__).resolve().parents[1]


def test_proxy_allowlist_must_exactly_match_suite(tmp_path: Path) -> None:
    suite = load_suite(ROOT / "config" / "stage1.yaml")
    allowlist = tmp_path / "allowlist.txt"
    allowlist.write_text("api.deepseek.com\n", encoding="utf-8")
    validate_network_allowlist(suite, allowlist)

    allowlist.write_text("api.deepseek.com\ngithub.com\n", encoding="utf-8")
    with pytest.raises(ValueError, match="does not match"):
        validate_network_allowlist(suite, allowlist)
