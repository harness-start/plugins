from __future__ import annotations

import json
from pathlib import Path

import pytest

from harness_swe_bench.harness import (
    marketplace_plugins,
    materialize_marketplace,
    payload_fingerprint,
)


def write_catalog(path: Path, names: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"plugins": [{"name": name} for name in names]}), encoding="utf-8")


def test_marketplace_plugins_requires_matching_dual_catalogs(tmp_path: Path) -> None:
    write_catalog(tmp_path / ".claude-plugin" / "marketplace.json", ["one", "two"])
    write_catalog(tmp_path / ".agents" / "plugins" / "marketplace.json", ["two", "one"])
    (tmp_path / "plugins" / "one").mkdir(parents=True)
    (tmp_path / "plugins" / "two").mkdir(parents=True)
    assert marketplace_plugins(tmp_path) == ("one", "two")

    write_catalog(tmp_path / ".agents" / "plugins" / "marketplace.json", ["one"])
    with pytest.raises(ValueError, match="catalogs differ"):
        marketplace_plugins(tmp_path)


def test_payload_fingerprint_changes_with_runtime_payload(tmp_path: Path) -> None:
    write_catalog(tmp_path / ".claude-plugin" / "marketplace.json", ["one"])
    write_catalog(tmp_path / ".agents" / "plugins" / "marketplace.json", ["one"])
    installer = tmp_path / "scripts" / "install-all.sh"
    installer.parent.mkdir(parents=True)
    installer.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    plugin = tmp_path / "plugins" / "one"
    (plugin / "dist").mkdir(parents=True)
    artifact = plugin / "dist" / "hook.mjs"
    artifact.write_text("one\n", encoding="utf-8")
    first = payload_fingerprint(tmp_path)
    artifact.write_text("two\n", encoding="utf-8")
    assert payload_fingerprint(tmp_path) != first


def test_materialized_marketplace_excludes_secrets_and_development_sources(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    write_catalog(repo / ".claude-plugin" / "marketplace.json", ["one"])
    write_catalog(repo / ".agents" / "plugins" / "marketplace.json", ["one"])
    installer = repo / "scripts" / "install-all.sh"
    installer.parent.mkdir(parents=True)
    installer.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    plugin = repo / "plugins" / "one"
    (plugin / "dist").mkdir(parents=True)
    (plugin / "dist" / "hook.mjs").write_text("runtime\n", encoding="utf-8")
    (plugin / "src").mkdir()
    (plugin / "src" / "hook.ts").write_text("development\n", encoding="utf-8")
    (repo / ".env").write_text("DEEPSEEK_API_KEY=secret\n", encoding="utf-8")

    destination = tmp_path / "snapshot"
    materialize_marketplace(repo, destination)

    assert (destination / "plugins" / "one" / "dist" / "hook.mjs").is_file()
    assert not (destination / "plugins" / "one" / "src").exists()
    assert not (destination / ".env").exists()


def test_materialized_marketplace_rejects_symbolic_links(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    write_catalog(repo / ".claude-plugin" / "marketplace.json", ["one"])
    write_catalog(repo / ".agents" / "plugins" / "marketplace.json", ["one"])
    installer = repo / "scripts" / "install-all.sh"
    installer.parent.mkdir(parents=True)
    installer.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    plugin = repo / "plugins" / "one"
    (plugin / "dist").mkdir(parents=True)
    (plugin / "dist" / "escape").symlink_to(repo / ".env")

    with pytest.raises(ValueError, match="symbolic link"):
        materialize_marketplace(repo, tmp_path / "snapshot")
