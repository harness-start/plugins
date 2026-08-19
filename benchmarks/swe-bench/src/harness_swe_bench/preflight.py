from __future__ import annotations

import importlib.metadata
import json
import shutil
import subprocess
from pathlib import Path

from harness_swe_bench.config import SuiteConfig
from harness_swe_bench.harness import payload_fingerprint, resolve_plugins
from harness_swe_bench.prompt import render_prompt


def validate_network_allowlist(suite: SuiteConfig, allowlist_path: Path) -> None:
    configured = {
        line.strip().lower()
        for line in allowlist_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
    expected = {host.lower() for host in suite.network.allowed_hosts}
    if configured != expected:
        raise ValueError(
            f"proxy allowlist does not match suite: configured={sorted(configured)}, "
            f"expected={sorted(expected)}"
        )
    if suite.model.api_host.lower() not in configured:
        raise ValueError("model API host is not in the proxy allowlist")


def static_preflight(
    repo_root: Path,
    benchmark_root: Path,
    suite: SuiteConfig,
    *,
    check_dist: bool = True,
) -> dict[str, object]:
    for command in ("docker", "git", "node", "npm", "uv"):
        if shutil.which(command) is None:
            raise RuntimeError(f"required command is missing: {command}")
    validate_network_allowlist(
        suite, benchmark_root / "docker" / "egress-proxy" / "allowlist.txt"
    )
    installed_swebench = importlib.metadata.version("swebench")
    if installed_swebench != suite.toolchain.swebench:
        raise RuntimeError(
            f"swebench version mismatch: expected {suite.toolchain.swebench}, got {installed_swebench}"
        )
    plugins = resolve_plugins(
        repo_root,
        mode=suite.harness.mode,
        configured=suite.harness.plugins,
    )
    models = json.loads(
        (repo_root / "docker" / "host-acceptance" / "models.json").read_text(
            encoding="utf-8"
        )
    )
    slugs = {
        row.get("slug")
        for row in models.get("models", [])
        if isinstance(row, dict)
    }
    if suite.model.name not in slugs:
        raise RuntimeError(f"Codex model catalog has no {suite.model.name}")
    render_prompt(
        benchmark_root / "prompts" / "issue-fix.md",
        {
            "repo": "owner/repo",
            "instance_id": "owner__repo-1",
            "base_commit": "deadbeef",
            "problem_statement": "Synthetic preflight statement.",
        },
    )
    if check_dist:
        result = subprocess.run(
            ["npm", "run", "check:dist"],
            cwd=repo_root,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError("npm run check:dist failed; benchmark never auto-builds plugin dist")
    return {
        "swebench_version": installed_swebench,
        "plugins": list(plugins),
        "plugin_count": len(plugins),
        "payload_fingerprint": payload_fingerprint(
            repo_root, selected_plugins=plugins
        ),
    }
