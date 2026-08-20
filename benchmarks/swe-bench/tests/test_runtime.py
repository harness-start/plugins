from __future__ import annotations

import json
import io
import shlex
import subprocess
import types
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

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
    compiled = compile(script, "<network-probe>", "exec")
    tunnels: list[bytes] = []
    tls_hosts: list[str] = []
    proxy_responses = iter([
        b"HTTP/1.1 200 Connection Established\r\n\r\n",
        b"HTTP/1.1 403 Forbidden\r\n\r\n",
    ])

    class Connection:
        def __init__(self, response: bytes) -> None:
            self.response = response

        def sendall(self, payload: bytes) -> None:
            tunnels.append(payload)

        def recv(self, _size: int) -> bytes:
            response, self.response = self.response, b""
            return response

        def close(self) -> None:
            pass

        def do_handshake(self) -> None:
            pass

    def create_connection(address, *, timeout):
        assert timeout in {5, 10}
        if address == ("egress-proxy", 3128):
            return Connection(next(proxy_responses))
        raise OSError("direct connections are blocked")

    class TlsContext:
        def wrap_socket(self, connection, *, server_hostname):
            tls_hosts.append(server_hostname)
            return connection

    fake_socket = types.SimpleNamespace(create_connection=create_connection)
    fake_ssl = types.SimpleNamespace(create_default_context=lambda: TlsContext())
    output = io.StringIO()
    with patch.dict("sys.modules", {"socket": fake_socket, "ssl": fake_ssl}), redirect_stdout(output):
        exec(compiled, {"__name__": "__main__"})

    assert output.getvalue() == "deepseek=tls-ok github_proxy=denied github_direct=blocked\n"
    assert tls_hosts == ["api.deepseek.com"]
    assert tunnels == [
        b"CONNECT api.deepseek.com:443 HTTP/1.1\r\nHost: api.deepseek.com:443\r\nConnection: close\r\n\r\n",
        b"CONNECT github.com:443 HTTP/1.1\r\nHost: github.com:443\r\nConnection: close\r\n\r\n",
    ]


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
    logical_lines: list[str] = []
    pending = ""
    for raw_line in dockerfile.splitlines():
        line = raw_line.strip()
        pending = f"{pending} {line}".strip()
        if pending.endswith("\\"):
            pending = pending[:-1].rstrip()
            continue
        if pending:
            logical_lines.append(pending)
        pending = ""
    run_tokens = [
        shlex.split(line.removeprefix("RUN "))
        for line in logical_lines
        if line.startswith("RUN ")
    ]
    symlinks = {
        (tokens[index + 2], tokens[index + 3])
        for tokens in run_tokens
        for index, token in enumerate(tokens[:-3])
        if token == "ln" and tokens[index + 1] == "-s"
    }

    assert symlinks == {
        (
            "../lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe",
            "/usr/local/bin/claude",
        ),
        (
            "../lib/node_modules/@openai/codex/bin/codex.js",
            "/usr/local/bin/codex",
        ),
    }


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
