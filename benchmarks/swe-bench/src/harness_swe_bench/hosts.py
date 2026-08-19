from __future__ import annotations

import json
from pathlib import Path

from harness_swe_bench.config import SuiteConfig


CODEX_SHELL_EDIT_INSTRUCTIONS = (
    "You are a coding agent. Issue at most one tool call per assistant turn and "
    "wait for its output before calling another tool. Use shell commands for file "
    "changes; the standalone "
    "patch editing tool is unavailable. Never write files with cat heredocs, tee, "
    "or shell output redirection because workspace hooks reject those commands. "
    "Use Python file APIs for multiline file edits. Complete the user request directly."
)


def write_codex_model_catalog(source: Path, destination: Path, model_name: str) -> None:
    catalog = json.loads(source.read_text(encoding="utf-8"))
    models = catalog.get("models") if isinstance(catalog, dict) else None
    if not isinstance(models, list):
        raise ValueError("Codex model catalog must contain a models list")
    selected = [
        row for row in models if isinstance(row, dict) and row.get("slug") == model_name
    ]
    if len(selected) != 1:
        raise ValueError(f"Codex model catalog must contain exactly one {model_name}")
    model = selected[0]
    model["apply_patch_tool_type"] = None
    model["supports_parallel_tool_calls"] = False
    model["base_instructions"] = CODEX_SHELL_EDIT_INSTRUCTIONS
    messages = model.get("model_messages")
    if not isinstance(messages, dict):
        messages = {}
        model["model_messages"] = messages
    messages["instructions_template"] = CODEX_SHELL_EDIT_INSTRUCTIONS
    destination.write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def write_host_config(
    host: str,
    home: Path,
    suite: SuiteConfig,
    models_json: Path,
) -> None:
    if host == "claude":
        config_dir = home / ".claude"
        config_dir.mkdir(parents=True, exist_ok=True)
        settings = {
            "hasTrustDialogAccepted": True,
            "env": {
                "ANTHROPIC_MODEL": suite.model.name,
                "ANTHROPIC_DEFAULT_OPUS_MODEL": suite.model.name,
                "ANTHROPIC_DEFAULT_SONNET_MODEL": suite.model.name,
                "ANTHROPIC_DEFAULT_HAIKU_MODEL": suite.model.name,
                "CLAUDE_CODE_SUBAGENT_MODEL": suite.model.name,
                "CLAUDE_CODE_EFFORT_LEVEL": suite.model.reasoning_effort,
            },
            "permissions": {"defaultMode": "bypassPermissions", "allow": ["*"]},
        }
        (config_dir / "settings.json").write_text(
            json.dumps(settings, indent=2) + "\n", encoding="utf-8"
        )
        return
    if host == "codex":
        config_dir = home / ".codex"
        config_dir.mkdir(parents=True, exist_ok=True)
        model_catalog = config_dir / "models.json"
        write_codex_model_catalog(models_json, model_catalog, suite.model.name)
        quote = json.dumps
        config = "\n".join(
            [
                f"model = {quote(suite.model.name)}",
                'model_provider = "deepseek"',
                'preferred_auth_method = "apikey"',
                f"model_reasoning_effort = {quote(suite.model.reasoning_effort)}",
                f"model_catalog_json = {quote(str(model_catalog))}",
                'approval_policy = "never"',
                'sandbox_mode = "danger-full-access"',
                "",
                "[model_providers.deepseek]",
                'name = "deepseek"',
                f'base_url = "https://{suite.model.api_host}/"',
                'wire_api = "responses"',
                'env_key = "DEEPSEEK_API_KEY"',
                "",
            ]
        )
        (config_dir / "config.toml").write_text(config, encoding="utf-8")
        return
    raise ValueError(f"unsupported host: {host}")


def host_command(
    host: str,
    prompt: str,
    suite: SuiteConfig,
    debug_log: Path,
) -> list[str]:
    if host == "claude":
        return [
            "claude",
            "-p",
            prompt,
            "--model",
            suite.model.name,
            "--disallowed-tools",
            "WebSearch",
            "WebFetch",
            "--dangerously-skip-permissions",
            "--permission-mode",
            "bypassPermissions",
            "--output-format",
            "text",
            "--debug",
            "--debug-file",
            str(debug_log),
        ]
    if host == "codex":
        return [
            "codex",
            "exec",
            "--skip-git-repo-check",
            "--dangerously-bypass-approvals-and-sandbox",
            "--dangerously-bypass-hook-trust",
            "-m",
            suite.model.name,
            "-C",
            "/testbed",
            prompt,
        ]
    raise ValueError(f"unsupported host: {host}")
