from __future__ import annotations

import json
from pathlib import Path

import pytest

from harness_swe_bench.harness import (
    assert_no_benchmark_leakage,
    marketplace_plugins,
    materialize_marketplace,
    payload_fingerprint,
    validate_marketplace_snapshot,
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


def test_profile_fingerprint_and_snapshot_exclude_unselected_plugins(tmp_path: Path) -> None:
    write_catalog(tmp_path / ".claude-plugin" / "marketplace.json", ["one", "two"])
    write_catalog(tmp_path / ".agents" / "plugins" / "marketplace.json", ["one", "two"])
    installer = tmp_path / "scripts" / "install-all.sh"
    installer.parent.mkdir(parents=True)
    installer.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    for name in ("one", "two"):
        plugin = tmp_path / "plugins" / name / "dist"
        plugin.mkdir(parents=True)
        (plugin / "hook.mjs").write_text(f"{name}\n", encoding="utf-8")

    before = payload_fingerprint(tmp_path, selected_plugins=("one",))
    (tmp_path / "plugins" / "two" / "dist" / "hook.mjs").write_text("changed\n", encoding="utf-8")
    assert payload_fingerprint(tmp_path, selected_plugins=("one",)) == before

    destination = tmp_path / "snapshot"
    materialize_marketplace(tmp_path, destination, selected_plugins=("one",))
    assert (destination / "plugins" / "one").is_dir()
    assert not (destination / "plugins" / "two").exists()
    for catalog in (
        destination / ".claude-plugin" / "marketplace.json",
        destination / ".agents" / "plugins" / "marketplace.json",
    ):
        assert [entry["name"] for entry in json.loads(catalog.read_text())["plugins"]] == ["one"]
    assert json.loads((destination / "snapshot-manifest.json").read_text())["plugins"] == ["one"]
    validate_marketplace_snapshot(tmp_path, destination, selected_plugins=("one",))

    (tmp_path / "plugins" / "one" / "dist" / "hook.mjs").write_text("stale\n")
    with pytest.raises(ValueError, match="fingerprint mismatch"):
        validate_marketplace_snapshot(tmp_path, destination, selected_plugins=("one",))


def test_snapshot_validation_rejects_a_different_plugin_selection(tmp_path: Path) -> None:
    write_catalog(tmp_path / ".claude-plugin" / "marketplace.json", ["one", "two"])
    write_catalog(tmp_path / ".agents" / "plugins" / "marketplace.json", ["one", "two"])
    installer = tmp_path / "scripts" / "install-all.sh"
    installer.parent.mkdir(parents=True)
    installer.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    for name in ("one", "two"):
        dist = tmp_path / "plugins" / name / "dist"
        dist.mkdir(parents=True)
        (dist / "hook.mjs").write_text(f"{name}\n", encoding="utf-8")
    destination = tmp_path / "snapshot"
    materialize_marketplace(tmp_path, destination, selected_plugins=("one",))

    with pytest.raises(ValueError, match="plugin selection mismatch"):
        validate_marketplace_snapshot(tmp_path, destination, selected_plugins=("two",))


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


def test_leakage_guard_rejects_identity_and_long_prompt_overlap(tmp_path: Path) -> None:
    write_catalog(tmp_path / ".claude-plugin" / "marketplace.json", ["one", "two"])
    write_catalog(tmp_path / ".agents" / "plugins" / "marketplace.json", ["one", "two"])
    for name in ("one", "two"):
        skill = tmp_path / "plugins" / name / "skills" / "method" / "SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text("Use repository evidence and verify the public contract.\n", encoding="utf-8")

    rows = [{
        "instance_id": "sample__widget-31415",
        "repo": "sample/widget",
        "problem_statement": (
            "The public parser must retain every original token while preserving stable "
            "ordering across repeated normalization passes in the same request."
        ),
    }]
    assert_no_benchmark_leakage(tmp_path, ("one",), rows)

    leaked = tmp_path / "plugins" / "one" / "skills" / "method" / "SKILL.md"
    leaked.write_text("Internal note for sample__widget-31415.\n", encoding="utf-8")
    with pytest.raises(ValueError, match="benchmark identity"):
        assert_no_benchmark_leakage(tmp_path, ("one",), rows)

    leaked.write_text(
        "Checklist: public parser must retain every original token while preserving stable "
        "ordering across repeated normalization passes in the same request.\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="problem statement overlap"):
        assert_no_benchmark_leakage(tmp_path, ("one",), rows)


def test_leakage_guard_ignores_unselected_and_development_only_files(tmp_path: Path) -> None:
    write_catalog(tmp_path / ".claude-plugin" / "marketplace.json", ["one", "two"])
    write_catalog(tmp_path / ".agents" / "plugins" / "marketplace.json", ["one", "two"])
    for name in ("one", "two"):
        (tmp_path / "plugins" / name / "dist").mkdir(parents=True)
        (tmp_path / "plugins" / name / "dist" / "hook.mjs").write_text("generic runtime\n")
    (tmp_path / "plugins" / "one" / "tests").mkdir()
    (tmp_path / "plugins" / "one" / "tests" / "fixture.txt").write_text("sample__widget-31415\n")
    (tmp_path / "plugins" / "two" / "dist" / "hook.mjs").write_text("sample__widget-31415\n")

    assert_no_benchmark_leakage(
        tmp_path,
        ("one",),
        [{
            "instance_id": "sample__widget-31415",
            "repo": "sample/widget",
            "problem_statement": "A deliberately long synthetic statement with enough separate words for scanning.",
        }],
    )
