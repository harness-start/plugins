from __future__ import annotations

import json
import subprocess
from pathlib import Path

from harness_swe_bench.config import load_suite
from harness_swe_bench.runtime import (
    AgentImage,
    DockerRuntime,
    direct_registry_image,
    network_probe_script,
    official_test_spec,
)


ROOT = Path(__file__).resolve().parents[1]


def test_network_probe_checks_connect_and_tls_without_application_get() -> None:
    script = network_probe_script()

    assert "CONNECT {host}:443" in script
    assert "wrap_socket" in script
    assert 'deepseek != "tls-ok"' in script
    assert 'github_proxy != "denied"' in script
    assert "urlopen" not in script


def test_agent_overlay_uses_official_swebench_image_namespace() -> None:
    observed: dict[str, object] = {}
    sentinel = object()

    def fake_make_test_spec(instance, *, namespace):
        observed.update(instance=instance, namespace=namespace)
        return sentinel

    instance = {"instance_id": "owner__repo-1"}

    assert official_test_spec(
        instance,
        make_spec=fake_make_test_spec,
        install_fallback=lambda: None,
    ) is sentinel
    assert observed == {"instance": instance, "namespace": "swebench"}


def test_official_pull_bypasses_slow_docker_hub_mirror() -> None:
    assert direct_registry_image("swebench/example:latest") == (
        "registry-1.docker.io/swebench/example:latest"
    )


def test_overlay_preserves_cli_symlink_resolution() -> None:
    dockerfile = (ROOT / "docker" / "agent-overlay" / "Dockerfile").read_text(
        encoding="utf-8"
    )

    assert "ln -s ../lib/node_modules/@openai/codex/bin/codex.js" in dockerfile
    assert (
        "ln -s ../lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe"
        in dockerfile
    )


def test_run_cell_records_the_mounted_snapshot_fingerprint(tmp_path: Path) -> None:
    suite = load_suite(ROOT / "config" / "stage1.yaml")
    runtime = object.__new__(DockerRuntime)
    runtime.repo_root = tmp_path / "changing-development-tree"
    runtime.benchmark_root = ROOT
    runtime.suite = suite
    runtime._start_proxy = lambda token: ("network", "proxy")
    runtime._stop_proxy = lambda network, proxy: None

    cell_dir = tmp_path / "cell"
    marketplace = tmp_path / "marketplace"
    marketplace.mkdir()
    snapshot_fingerprint = "a" * 64
    (marketplace / "snapshot-manifest.json").write_text(
        json.dumps({"payload_fingerprint": snapshot_fingerprint}) + "\n",
        encoding="utf-8",
    )
    prompt_template = tmp_path / "prompt.md"
    prompt_template.write_text("Fix the issue.\n", encoding="utf-8")

    def fake_docker(args, **kwargs):
        if args[0] == "run":
            (cell_dir / "host.exit").write_text("0\n", encoding="utf-8")
            (cell_dir / "patch.diff").write_text("diff --git a/a b/a\n", encoding="utf-8")
            (cell_dir / "install-manifest.json").write_text(
                json.dumps({"missing_from_log": []}) + "\n", encoding="utf-8"
            )
            return subprocess.CompletedProcess(args, 0, stdout="", stderr="")
        if args[:2] == ["logs", "proxy"]:
            return subprocess.CompletedProcess(
                args,
                0,
                stdout=f"ALLOW {suite.model.api_host}:443\n",
                stderr="",
            )
        return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

    runtime.docker = fake_docker
    result = runtime.run_cell(
        run_id="fingerprint-test",
        instance={"instance_id": "owner__repo-1"},
        host="codex",
        image=AgentImage("official", "sha256:1", "agent", "sha256:2", 1, 2),
        cell_dir=cell_dir,
        marketplace_root=marketplace,
        prompt_template=prompt_template,
        api_key="not-a-real-secret",
    )

    assert result["pipeline_ok"] is True
    assert result["payload_fingerprint"] == snapshot_fingerprint
