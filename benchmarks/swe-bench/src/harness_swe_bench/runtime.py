from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from harness_swe_bench.config import SuiteConfig
from harness_swe_bench.prompt import render_prompt


@dataclass(frozen=True)
class AgentImage:
    instance_image_key: str
    instance_image_id: str
    agent_image_key: str
    agent_image_id: str
    evaluator_layers: int
    agent_layers: int


def _safe(value: str, limit: int = 48) -> str:
    normalized = re.sub(r"[^a-z0-9_.-]+", "-", value.lower()).strip("-.")
    suffix = hashlib.sha256(value.encode("utf-8")).hexdigest()[:8]
    return f"{normalized[:limit]}-{suffix}"


def _tree_digest(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    files: list[Path] = []
    for path in paths:
        if path.is_dir():
            files.extend(item for item in path.rglob("*") if item.is_file())
        else:
            files.append(path)
    for path in sorted(files, key=str):
        digest.update(str(path).encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()


def network_probe_script() -> str:
    return r'''
import socket
import ssl
import sys

def proxy_tunnel(host, use_tls):
    connection = socket.create_connection(("egress-proxy", 3128), timeout=10)
    connection.sendall(
        f"CONNECT {host}:443 HTTP/1.1\r\nHost: {host}:443\r\nConnection: close\r\n\r\n".encode()
    )
    response = b""
    while b"\r\n\r\n" not in response and len(response) < 65536:
        chunk = connection.recv(4096)
        if not chunk:
            break
        response += chunk
    status = response.split(b"\r\n", 1)[0]
    if b" 403 " in status:
        connection.close()
        return "denied"
    if b" 200 " not in status:
        connection.close()
        return "connect-error"
    if use_tls:
        context = ssl.create_default_context()
        secured = context.wrap_socket(connection, server_hostname=host)
        secured.do_handshake()
        secured.close()
        return "tls-ok"
    connection.close()
    return "connected"

def direct_connection(host):
    try:
        connection = socket.create_connection((host, 443), timeout=5)
    except OSError:
        return "blocked"
    connection.close()
    return "connected"

try:
    deepseek = proxy_tunnel("api.deepseek.com", True)
except OSError:
    deepseek = "network-error"
try:
    github_proxy = proxy_tunnel("github.com", False)
except OSError:
    github_proxy = "network-error"
github_direct = direct_connection("github.com")
print(f"deepseek={deepseek} github_proxy={github_proxy} github_direct={github_direct}")
if deepseek != "tls-ok" or github_proxy != "denied" or github_direct != "blocked":
    sys.exit(1)
'''


def official_test_spec(
    instance: dict[str, Any],
    *,
    make_spec=None,
    install_fallback=None,
):
    from harness_swe_bench.official_evaluator import install_github_transport_fallback

    if install_fallback is None:
        install_fallback = install_github_transport_fallback
    install_fallback()
    if make_spec is None:
        from swebench.harness.test_spec.test_spec import make_test_spec

        make_spec = make_test_spec
    return make_spec(instance, namespace="swebench")


def direct_registry_image(image: str) -> str:
    if not image.startswith("swebench/"):
        raise ValueError(f"official image is outside the swebench namespace: {image}")
    return f"registry-1.docker.io/{image}"


class DockerRuntime:
    def __init__(self, repo_root: Path, benchmark_root: Path, suite: SuiteConfig) -> None:
        self.repo_root = repo_root.resolve()
        self.benchmark_root = benchmark_root.resolve()
        self.suite = suite
        tool_digest = _tree_digest(
            [
                benchmark_root / "docker" / "agent-tools",
                benchmark_root / "src" / "harness_swe_bench",
                repo_root / "docker" / "host-acceptance" / "models.json",
            ]
        )
        proxy_digest = _tree_digest([benchmark_root / "docker" / "egress-proxy"])
        self.tool_image = f"harness-swe-agent-tools:{tool_digest[:12]}"
        self.proxy_image = f"harness-swe-egress-proxy:{proxy_digest[:12]}"

    def docker(
        self,
        args: list[str],
        *,
        check: bool = True,
        capture: bool = False,
        env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["docker", *args],
            check=check,
            capture_output=capture,
            text=True,
            env=env,
        )

    def build_support_images(self) -> None:
        self.docker(
            [
                "build",
                "-t",
                self.tool_image,
                "--build-arg",
                f"CLAUDE_CODE_VERSION={self.suite.toolchain.claude_code}",
                "--build-arg",
                f"CODEX_VERSION={self.suite.toolchain.codex}",
                "-f",
                str(self.benchmark_root / "docker" / "agent-tools" / "Dockerfile"),
                str(self.repo_root),
            ]
        )
        self.docker(
            [
                "build",
                "-t",
                self.proxy_image,
                "-f",
                str(self.benchmark_root / "docker" / "egress-proxy" / "Dockerfile"),
                str(self.benchmark_root / "docker" / "egress-proxy"),
            ]
        )

    def ensure_agent_image(self, instance: dict[str, Any]) -> AgentImage:
        import docker
        from docker.errors import ImageNotFound

        client = docker.from_env()
        spec = official_test_spec(instance)
        try:
            evaluator = client.images.get(spec.instance_image_key)
        except ImageNotFound:
            direct_image = direct_registry_image(spec.instance_image_key)
            self.docker(["pull", direct_image])
            self.docker(["tag", direct_image, spec.instance_image_key])
            evaluator = client.images.get(spec.instance_image_key)

        agent_key = f"harness-swe-agent:{_safe(spec.instance_id)}"
        self.docker(
            [
                "build",
                "--build-arg",
                f"TOOL_IMAGE={self.tool_image}",
                "--build-arg",
                f"INSTANCE_IMAGE={spec.instance_image_key}",
                "-t",
                agent_key,
                "-f",
                str(self.benchmark_root / "docker" / "agent-overlay" / "Dockerfile"),
                str(self.benchmark_root / "docker" / "agent-overlay"),
            ]
        )
        agent = client.images.get(agent_key)
        evaluator_layers = list(evaluator.attrs.get("RootFS", {}).get("Layers") or [])
        agent_layers = list(agent.attrs.get("RootFS", {}).get("Layers") or [])
        if not evaluator_layers or agent_layers[: len(evaluator_layers)] != evaluator_layers:
            raise RuntimeError("agent image does not preserve the official evaluator image layers")
        return AgentImage(
            instance_image_key=spec.instance_image_key,
            instance_image_id=evaluator.id,
            agent_image_key=agent_key,
            agent_image_id=agent.id,
            evaluator_layers=len(evaluator_layers),
            agent_layers=len(agent_layers),
        )

    def _start_proxy(self, token: str) -> tuple[str, str]:
        network = f"harness-swe-net-{_safe(token, 24)}"
        proxy = f"harness-swe-proxy-{_safe(token, 24)}"
        self.docker(["network", "create", "--internal", network])
        try:
            self.docker(["run", "-d", "--name", proxy, self.proxy_image])
            self.docker(["network", "connect", "--alias", "egress-proxy", network, proxy])
            for _ in range(30):
                health = self.docker(
                    ["inspect", "-f", "{{.State.Health.Status}}", proxy],
                    check=False,
                    capture=True,
                )
                if health.returncode == 0 and health.stdout.strip() == "healthy":
                    return network, proxy
                time.sleep(0.5)
            raise RuntimeError("egress proxy did not become healthy")
        except BaseException:
            self._stop_proxy(network, proxy)
            raise

    def _stop_proxy(self, network: str, proxy: str) -> None:
        self.docker(["rm", "-f", proxy], check=False, capture=True)
        self.docker(["network", "rm", network], check=False, capture=True)

    def verify_network_policy(self, output: Path) -> None:
        network, proxy = self._start_proxy("policy-check")
        try:
            result = self.docker(
                [
                    "run",
                    "--rm",
                    "--network",
                    network,
                    "--entrypoint",
                    "python",
                    self.proxy_image,
                    "-c",
                    network_probe_script(),
                ],
                check=False,
                capture=True,
            )
            proxy_log = self.docker(["logs", proxy], check=False, capture=True)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(
                result.stdout + result.stderr + "\n===== proxy =====\n" + proxy_log.stdout + proxy_log.stderr,
                encoding="utf-8",
            )
            if result.returncode != 0:
                raise RuntimeError(f"network policy check failed; see {output}")
        finally:
            self._stop_proxy(network, proxy)

    def run_cell(
        self,
        *,
        run_id: str,
        instance: dict[str, Any],
        host: str,
        image: AgentImage,
        cell_dir: Path,
        marketplace_root: Path,
        prompt_template: Path,
        api_key: str,
    ) -> dict[str, object]:
        cell_dir.mkdir(parents=True, exist_ok=True)
        home = cell_dir / "home"
        home.mkdir(exist_ok=True)
        snapshot_manifest = json.loads(
            (marketplace_root / "snapshot-manifest.json").read_text(encoding="utf-8")
        )
        snapshot_fingerprint = snapshot_manifest.get("payload_fingerprint")
        if not isinstance(snapshot_fingerprint, str) or re.fullmatch(
            r"[0-9a-f]{64}", snapshot_fingerprint
        ) is None:
            raise ValueError("marketplace snapshot manifest has no valid payload fingerprint")
        prompt = render_prompt(prompt_template, instance)
        (cell_dir / "prompt.md").write_text(prompt, encoding="utf-8")
        token = f"{run_id}-{instance['instance_id']}-{host}"
        network, proxy = self._start_proxy(token)
        container = f"harness-swe-agent-{_safe(token, 24)}"
        environment = os.environ.copy()
        environment["DEEPSEEK_API_KEY"] = api_key
        proxy_url = "http://egress-proxy:3128"
        command = [
            "run",
            "--name",
            container,
            "--network",
            network,
            "-e",
            "DEEPSEEK_API_KEY",
            "-e",
            f"SWE_HOST={host}",
            "-e",
            "SWE_SUITE_CONFIG=/benchmark/stage1.yaml",
            "-e",
            f"SWE_HOST_UID={os.getuid()}",
            "-e",
            f"SWE_HOST_GID={os.getgid()}",
            "-e",
            f"AI_EXPERTS_SESSION_ID={_safe(token)}",
            "-e",
            "AI_EXPERTS_TRIGGER_FROM=user-request",
            "-e",
            f"HTTPS_PROXY={proxy_url}",
            "-e",
            f"HTTP_PROXY={proxy_url}",
            "-e",
            f"https_proxy={proxy_url}",
            "-e",
            f"http_proxy={proxy_url}",
            "-e",
            "NO_PROXY=localhost,127.0.0.1",
            "-v",
            f"{marketplace_root.resolve()}:/marketplace:ro",
            "-v",
            f"{self.suite.path}:/benchmark/stage1.yaml:ro",
            "-v",
            f"{cell_dir.resolve()}:/out",
            "-v",
            f"{home.resolve()}:/home/benchmark",
            image.agent_image_key,
        ]
        started = time.monotonic()
        docker_result: subprocess.CompletedProcess[str] | None = None
        proxy_text = ""
        try:
            docker_result = self.docker(command, check=False, capture=True, env=environment)
            (cell_dir / "container.log").write_text(
                docker_result.stdout + docker_result.stderr, encoding="utf-8"
            )
            proxy_log = self.docker(["logs", proxy], check=False, capture=True)
            proxy_text = proxy_log.stdout + proxy_log.stderr
            (cell_dir / "proxy.log").write_text(proxy_text, encoding="utf-8")
        finally:
            self.docker(["rm", "-f", container], check=False, capture=True)
            self._stop_proxy(network, proxy)

        duration = round(time.monotonic() - started, 2)
        host_exit_path = cell_dir / "host.exit"
        host_exit = (
            int(host_exit_path.read_text(encoding="utf-8").strip())
            if host_exit_path.is_file()
            else (docker_result.returncode if docker_result is not None else -1)
        )
        patch_path = cell_dir / "patch.diff"
        patch = patch_path.read_text(encoding="utf-8") if patch_path.is_file() else ""
        manifest_path = cell_dir / "install-manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
        model_evidence = f"ALLOW {self.suite.model.api_host}:443" in proxy_text
        pipeline_ok = bool(
            docker_result is not None
            and docker_result.returncode == 0
            and host_exit == 0
            and patch.strip()
            and manifest.get("missing_from_log") == []
            and model_evidence
        )
        result: dict[str, object] = {
            "instance_id": instance["instance_id"],
            "host": host,
            "attempt": 1,
            "pipeline_ok": pipeline_ok,
            "resolved": False,
            "host_exit": host_exit,
            "docker_exit": docker_result.returncode if docker_result is not None else -1,
            "duration_sec": duration,
            "patch_bytes": len(patch.encode("utf-8")),
            "model_endpoint_evidence": model_evidence,
            "instance_image": image.instance_image_key,
            "instance_image_id": image.instance_image_id,
            "agent_image": image.agent_image_key,
            "agent_image_id": image.agent_image_id,
            "payload_fingerprint": snapshot_fingerprint,
        }
        (cell_dir / "status.json").write_text(
            json.dumps(result, indent=2) + "\n", encoding="utf-8"
        )
        return result
