from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path


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


def payload_fingerprint(repo_root: Path) -> str:
    digest = hashlib.sha256()
    roots = [
        repo_root / "scripts" / "install-all.sh",
        repo_root / ".claude-plugin" / "marketplace.json",
        repo_root / ".agents" / "plugins" / "marketplace.json",
    ]
    for name in marketplace_plugins(repo_root):
        plugin = repo_root / "plugins" / name
        for relative in (
            ".claude-plugin",
            ".codex-plugin",
            "hooks",
            "mcp",
            "skills",
            "dist",
        ):
            target = plugin / relative
            if target.is_file():
                roots.append(target)
            elif target.is_dir():
                roots.extend(path for path in target.rglob("*") if path.is_file())
    for path in sorted(set(roots), key=lambda item: str(item.relative_to(repo_root))):
        relative = str(path.relative_to(repo_root)).encode("utf-8")
        digest.update(len(relative).to_bytes(8, "big"))
        digest.update(relative)
        content = path.read_bytes()
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return digest.hexdigest()


def materialize_marketplace(repo_root: Path, destination: Path) -> None:
    """Create the clean consumer payload mounted into benchmark agents."""
    if destination.exists():
        raise FileExistsError(f"marketplace snapshot already exists: {destination}")
    plugins = marketplace_plugins(repo_root)
    (destination / ".claude-plugin").mkdir(parents=True)
    (destination / ".agents" / "plugins").mkdir(parents=True)
    (destination / "scripts").mkdir(parents=True)
    shutil.copy2(
        repo_root / ".claude-plugin" / "marketplace.json",
        destination / ".claude-plugin" / "marketplace.json",
    )
    shutil.copy2(
        repo_root / ".agents" / "plugins" / "marketplace.json",
        destination / ".agents" / "plugins" / "marketplace.json",
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
        "payload_fingerprint": payload_fingerprint(repo_root),
        "plugins": list(plugins),
    }
    (destination / "snapshot-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
