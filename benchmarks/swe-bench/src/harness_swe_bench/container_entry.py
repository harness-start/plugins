from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from harness_swe_bench.config import load_suite
from harness_swe_bench.hosts import host_command, write_host_config
from harness_swe_bench.patch import collect_patch

WORKSPACE = Path("/testbed")
OUT = Path("/out")
HOME = Path("/home/benchmark")
MARKETPLACE = Path("/marketplace")


def run(command: list[str], *, env: dict[str, str] | None = None, log: Path | None = None) -> int:
    output = None
    if log is not None:
        log.parent.mkdir(parents=True, exist_ok=True)
        output = log.open("w", encoding="utf-8")
    try:
        return subprocess.run(
            command,
            env=env,
            stdout=output,
            stderr=subprocess.STDOUT if output is not None else None,
            check=False,
        ).returncode
    finally:
        if output is not None:
            output.close()


def agent_command(command: list[str]) -> list[str]:
    return ["runuser", "-u", "nonroot", "--preserve-environment", "--", *command]


def activated_command(command: list[str]) -> list[str]:
    script = """set -euo pipefail
if [[ -f /opt/miniconda3/etc/profile.d/conda.sh ]]; then
  set +u
  source /opt/miniconda3/etc/profile.d/conda.sh
  conda activate testbed
  set -u
fi
exec "$@"
"""
    return ["bash", "-lc", script, "benchmark-agent", *command]


def require_environment(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


def seal_workspace() -> None:
    subprocess.run(["rm", "-rf", "--", str(WORKSPACE / ".git")], check=True)
    subprocess.run(["git", "init", "--quiet", str(WORKSPACE)], check=True)
    subprocess.run(["git", "-C", str(WORKSPACE), "config", "user.email", "swe-bench@harness-start.local"], check=True)
    subprocess.run(["git", "-C", str(WORKSPACE), "config", "user.name", "Harness SWE-bench"], check=True)
    subprocess.run(["git", "-C", str(WORKSPACE), "add", "-A"], check=True)
    subprocess.run(
        ["git", "-C", str(WORKSPACE), "commit", "--quiet", "--allow-empty", "-m", "sealed SWE-bench base"],
        check=True,
    )


def restore_ownership() -> None:
    uid = require_environment("SWE_HOST_UID")
    gid = require_environment("SWE_HOST_GID")
    subprocess.run(["chown", "-R", f"{uid}:{gid}", str(HOME), str(OUT)], check=False)


def write_install_manifest(host: str) -> None:
    catalog = json.loads(
        (MARKETPLACE / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8")
    )
    plugins = sorted(
        row["name"] for row in catalog.get("plugins", []) if isinstance(row, dict) and row.get("name")
    )
    install_log = (OUT / "install.log").read_text(encoding="utf-8", errors="replace")
    missing = [plugin for plugin in plugins if plugin not in install_log]
    manifest = {"host": host, "plugins": plugins, "count": len(plugins), "missing_from_log": missing}
    (OUT / "install-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    if missing:
        raise RuntimeError(f"install log is missing plugin(s): {', '.join(missing)}")


def execute() -> int:
    host = require_environment("SWE_HOST")
    suite = load_suite(Path(require_environment("SWE_SUITE_CONFIG")))
    require_environment("DEEPSEEK_API_KEY")
    if host not in suite.hosts:
        raise RuntimeError(f"host is not in suite: {host}")
    if os.geteuid() != 0:
        raise RuntimeError("agent container must enter as root for one-time workspace sealing")
    subprocess.run(["id", "nonroot"], check=True, capture_output=True)

    OUT.mkdir(parents=True, exist_ok=True)
    HOME.mkdir(parents=True, exist_ok=True)
    seal_workspace()

    environment = os.environ.copy()
    environment.update(
        {
            "HOME": str(HOME),
            "CODEX_HOME": str(HOME / ".codex"),
            "ANTHROPIC_BASE_URL": f"https://{suite.model.api_host}/anthropic",
            "ANTHROPIC_AUTH_TOKEN": environment["DEEPSEEK_API_KEY"],
            "ANTHROPIC_MODEL": suite.model.name,
            "ANTHROPIC_DEFAULT_OPUS_MODEL": suite.model.name,
            "ANTHROPIC_DEFAULT_SONNET_MODEL": suite.model.name,
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": suite.model.name,
            "CLAUDE_CODE_SUBAGENT_MODEL": suite.model.name,
            "CLAUDE_CODE_EFFORT_LEVEL": suite.model.reasoning_effort,
            "AI_EXPERTS_SESSION_ID": require_environment("AI_EXPERTS_SESSION_ID"),
            "AI_EXPERTS_TRIGGER_FROM": require_environment("AI_EXPERTS_TRIGGER_FROM"),
        }
    )
    environment.pop("ANTHROPIC_API_KEY", None)

    write_host_config(host, HOME, suite, Path("/opt/harness/models.json"))
    subprocess.run(["chown", "-R", "nonroot:nonroot", str(WORKSPACE), str(HOME), str(OUT)], check=True)
    install_flag = "--claude-only" if host == "claude" else "--codex-only"
    install = agent_command(
        [
            "bash",
            str(MARKETPLACE / "scripts" / "install-all.sh"),
            "--local",
            str(MARKETPLACE),
            install_flag,
            "--language",
            "en-US",
            "--fail-fast",
        ]
    )
    install_exit = run(install, env=environment, log=OUT / "install.log")
    if install_exit != 0:
        (OUT / "host.exit").write_text(str(install_exit) + "\n", encoding="utf-8")
        return install_exit
    write_install_manifest(host)

    prompt = (OUT / "prompt.md").read_text(encoding="utf-8")
    command = host_command(host, prompt, suite, OUT / f"{host}.debug.log")
    command = agent_command(
        activated_command(["timeout", str(suite.agent.timeout_sec), *command])
    )
    host_exit = run(command, env=environment, log=OUT / "host.log")
    (OUT / "host.exit").write_text(str(host_exit) + "\n", encoding="utf-8")
    patch = collect_patch(WORKSPACE)
    (OUT / "patch.diff").write_text(patch, encoding="utf-8")
    environment_record = {
        "host": host,
        "model": suite.model.name,
        "reasoning_effort": suite.model.reasoning_effort,
        "python": subprocess.check_output(
            agent_command(activated_command(["python", "--version"])),
            env=environment,
            text=True,
            stderr=subprocess.STDOUT,
        ).strip(),
        "claude": subprocess.check_output(["claude", "--version"], text=True).strip(),
        "codex": subprocess.check_output(["codex", "--version"], text=True).strip(),
        "sealed_commit_count": subprocess.check_output(
            ["git", "-c", f"safe.directory={WORKSPACE}", "-C", str(WORKSPACE), "rev-list", "--count", "HEAD"],
            text=True,
        ).strip(),
    }
    (OUT / "environment.json").write_text(
        json.dumps(environment_record, indent=2) + "\n", encoding="utf-8"
    )
    return host_exit


def main() -> None:
    exit_code = 1
    try:
        exit_code = execute()
    finally:
        if HOME.exists() and OUT.exists():
            restore_ownership()
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
