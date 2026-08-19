from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path
from typing import Mapping, Sequence


RUNTIME_PLUGIN_PATHS = (
    ".claude-plugin",
    ".codex-plugin",
    "hooks",
    "mcp",
    "skills",
    "dist",
)
PROMPT_OVERLAP_WORDS = 12


def _catalog_names(path: Path) -> tuple[str, ...]:
    data = json.loads(path.read_text(encoding="utf-8"))
    plugins = data.get("plugins") if isinstance(data, dict) else None
    if not isinstance(plugins, list):
        raise ValueError(f"marketplace has no plugins list: {path}")
    names = tuple(
        sorted(
            entry["name"]
            for entry in plugins
            if isinstance(entry, dict)
            and isinstance(entry.get("name"), str)
            and entry["name"]
        )
    )
    if not names or len(names) != len(set(names)):
        raise ValueError(f"marketplace plugin names are empty or duplicated: {path}")
    return names


def marketplace_plugins(repo_root: Path) -> tuple[str, ...]:
    claude = _catalog_names(repo_root / ".claude-plugin" / "marketplace.json")
    codex = _catalog_names(repo_root / ".agents" / "plugins" / "marketplace.json")
    if claude != codex:
        raise ValueError("Claude and Codex marketplace catalogs differ")
    missing = [name for name in claude if not (repo_root / "plugins" / name).is_dir()]
    if missing:
        raise ValueError(f"marketplace plugins missing on disk: {', '.join(missing)}")
    return claude


def resolve_plugins(
    repo_root: Path,
    *,
    mode: str,
    configured: tuple[str, ...] = (),
) -> tuple[str, ...]:
    available = marketplace_plugins(repo_root)
    if mode == "full":
        return available
    if mode == "off":
        return ()
    if mode != "profile":
        raise ValueError(f"unknown harness mode: {mode}")
    unknown = sorted(set(configured) - set(available))
    if unknown:
        raise ValueError(f"profile plugins are not in both catalogs: {', '.join(unknown)}")
    return configured


def _selection(repo_root: Path, selected_plugins: tuple[str, ...] | None) -> tuple[str, ...]:
    available = marketplace_plugins(repo_root)
    if selected_plugins is None:
        return available
    if len(set(selected_plugins)) != len(selected_plugins):
        raise ValueError("selected plugins must be unique")
    unknown = sorted(set(selected_plugins) - set(available))
    if unknown:
        raise ValueError(f"selected plugins are not in both catalogs: {', '.join(unknown)}")
    return selected_plugins


def _filtered_catalog(path: Path, selected_plugins: tuple[str, ...]) -> bytes:
    data = json.loads(path.read_text(encoding="utf-8"))
    selected = set(selected_plugins)
    data["plugins"] = [
        entry
        for entry in data["plugins"]
        if isinstance(entry, dict) and entry.get("name") in selected
    ]
    found = {entry["name"] for entry in data["plugins"]}
    if found != selected:
        raise ValueError(f"catalog selection mismatch: {path}")
    return (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def _runtime_plugin_files(repo_root: Path, plugins: tuple[str, ...]) -> list[Path]:
    files: list[Path] = []
    for name in plugins:
        plugin = repo_root / "plugins" / name
        for relative in RUNTIME_PLUGIN_PATHS:
            target = plugin / relative
            if target.is_file():
                files.append(target)
            elif target.is_dir():
                files.extend(path for path in target.rglob("*") if path.is_file())
    return sorted(set(files), key=lambda item: str(item.relative_to(repo_root)))


def _normalized_words(text: str) -> list[str]:
    return re.findall(r"[\w]+", text.casefold(), flags=re.UNICODE)


def _prompt_ngrams(text: str) -> set[tuple[str, ...]]:
    words = _normalized_words(text)
    return {
        tuple(words[index : index + PROMPT_OVERLAP_WORDS])
        for index in range(len(words) - PROMPT_OVERLAP_WORDS + 1)
    }


def assert_no_benchmark_leakage(
    repo_root: Path,
    selected_plugins: tuple[str, ...],
    instances: Sequence[Mapping[str, object]],
) -> None:
    """Reject task identity or copied prompt prose in the consumer plugin payload."""
    identities = {
        str(value).casefold()
        for row in instances
        for value in (row.get("instance_id"), row.get("repo"))
        if isinstance(value, str) and value
    }
    prompt_ngrams = {
        ngram
        for row in instances
        if isinstance(row.get("problem_statement"), str)
        for ngram in _prompt_ngrams(str(row["problem_statement"]))
    }
    for path in _runtime_plugin_files(repo_root, selected_plugins):
        content = path.read_text(encoding="utf-8", errors="ignore")
        folded = content.casefold()
        if any(identity in folded for identity in identities):
            relative = path.relative_to(repo_root)
            raise ValueError(f"plugin payload contains benchmark identity: {relative}")
        if prompt_ngrams:
            content_words = _normalized_words(content)
            for index in range(len(content_words) - PROMPT_OVERLAP_WORDS + 1):
                if tuple(content_words[index : index + PROMPT_OVERLAP_WORDS]) in prompt_ngrams:
                    relative = path.relative_to(repo_root)
                    raise ValueError(
                        f"plugin payload contains problem statement overlap: {relative}"
                    )


def payload_fingerprint(
    repo_root: Path,
    *,
    selected_plugins: tuple[str, ...] | None = None,
) -> str:
    digest = hashlib.sha256()
    plugins = _selection(repo_root, selected_plugins)
    payloads: list[tuple[str, bytes]] = [
        (
            "scripts/install-all.sh",
            (repo_root / "scripts" / "install-all.sh").read_bytes(),
        ),
        (
            ".claude-plugin/marketplace.json",
            _filtered_catalog(repo_root / ".claude-plugin" / "marketplace.json", plugins),
        ),
        (
            ".agents/plugins/marketplace.json",
            _filtered_catalog(repo_root / ".agents" / "plugins" / "marketplace.json", plugins),
        ),
    ]
    for path in _runtime_plugin_files(repo_root, plugins):
        payloads.append((str(path.relative_to(repo_root)), path.read_bytes()))
    for relative_text, content in sorted(payloads):
        relative = relative_text.encode("utf-8")
        digest.update(len(relative).to_bytes(8, "big"))
        digest.update(relative)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return digest.hexdigest()


def materialize_marketplace(
    repo_root: Path,
    destination: Path,
    *,
    selected_plugins: tuple[str, ...] | None = None,
) -> None:
    """Create the clean consumer payload mounted into benchmark agents."""
    if destination.exists():
        raise FileExistsError(f"marketplace snapshot already exists: {destination}")
    plugins = _selection(repo_root, selected_plugins)
    (destination / ".claude-plugin").mkdir(parents=True)
    (destination / ".agents" / "plugins").mkdir(parents=True)
    (destination / "scripts").mkdir(parents=True)
    (destination / ".claude-plugin" / "marketplace.json").write_bytes(
        _filtered_catalog(repo_root / ".claude-plugin" / "marketplace.json", plugins)
    )
    (destination / ".agents" / "plugins" / "marketplace.json").write_bytes(
        _filtered_catalog(repo_root / ".agents" / "plugins" / "marketplace.json", plugins)
    )
    shutil.copy2(
        repo_root / "scripts" / "install-all.sh",
        destination / "scripts" / "install-all.sh",
    )
    ignored = shutil.ignore_patterns(
        "src",
        "tests",
        "acceptance",
        "node_modules",
        ".git",
        ".env",
        ".cache",
        "__pycache__",
        "*.pyc",
    )
    for name in plugins:
        shutil.copytree(
            repo_root / "plugins" / name,
            destination / "plugins" / name,
            symlinks=True,
            ignore=ignored,
        )
    symbolic_links = sorted(
        str(path.relative_to(destination))
        for path in destination.rglob("*")
        if path.is_symlink()
    )
    if symbolic_links:
        raise ValueError(
            "marketplace snapshot contains a symbolic link: " + ", ".join(symbolic_links)
        )
    manifest = {
        "schema_version": 1,
        "payload_fingerprint": payload_fingerprint(
            repo_root, selected_plugins=plugins
        ),
        "plugins": list(plugins),
    }
    (destination / "snapshot-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


def validate_marketplace_snapshot(
    repo_root: Path,
    destination: Path,
    *,
    selected_plugins: tuple[str, ...] | None = None,
) -> None:
    plugins = _selection(repo_root, selected_plugins)
    manifest_path = destination / "snapshot-manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"marketplace snapshot manifest is invalid: {manifest_path}") from error
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        raise ValueError(f"marketplace snapshot manifest schema is invalid: {manifest_path}")
    if manifest.get("plugins") != list(plugins):
        raise ValueError("marketplace snapshot plugin selection mismatch; use a new run ID")
    expected = payload_fingerprint(repo_root, selected_plugins=plugins)
    if manifest.get("payload_fingerprint") != expected:
        raise ValueError("marketplace snapshot fingerprint mismatch; use a new run ID")
