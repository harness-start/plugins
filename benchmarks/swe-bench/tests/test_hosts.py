from __future__ import annotations

import json
from pathlib import Path

from harness_swe_bench.config import load_suite
from harness_swe_bench.hosts import host_command, write_host_config


ROOT = Path(__file__).resolve().parents[1]


def test_host_configs_pin_deepseek_without_persisting_secret(tmp_path: Path) -> None:
    suite = load_suite(ROOT / "config" / "stage1.yaml")
    models = tmp_path / "models.json"
    models.write_text(
        json.dumps(
            {
                "models": [
                    {
                        "slug": suite.model.name,
                        "apply_patch_tool_type": "freeform",
                        "supports_parallel_tool_calls": True,
                        "base_instructions": "Prefer apply_patch for edits.",
                        "model_messages": {
                            "instructions_template": "Prefer apply_patch for edits."
                        },
                    }
                ]
            }
        )
        + "\n",
        encoding="utf-8",
    )

    claude_home = tmp_path / "claude-home"
    codex_home = tmp_path / "codex-home"
    write_host_config("claude", claude_home, suite, models)
    write_host_config("codex", codex_home, suite, models)

    claude = (claude_home / ".claude" / "settings.json").read_text(encoding="utf-8")
    codex = (codex_home / ".codex" / "config.toml").read_text(encoding="utf-8")
    combined = claude + codex
    assert "deepseek-v4-flash" in combined
    assert "api.deepseek.com" in combined
    assert 'env_key = "DEEPSEEK_API_KEY"' in codex
    assert "experimental_bearer_token" not in codex
    assert "sk-secret" not in combined
    assert (codex_home / ".codex" / "models.json").is_file()


def test_codex_catalog_disables_unsupported_freeform_patch_tool(tmp_path: Path) -> None:
    suite = load_suite(ROOT / "config" / "stage1.yaml")
    models = tmp_path / "models.json"
    models.write_text(
        json.dumps(
            {
                "models": [
                    {
                        "slug": suite.model.name,
                        "apply_patch_tool_type": "freeform",
                        "supports_parallel_tool_calls": True,
                        "base_instructions": "Prefer apply_patch for edits.",
                        "model_messages": {
                            "instructions_template": "Prefer apply_patch for edits."
                        },
                    }
                ]
            }
        )
        + "\n",
        encoding="utf-8",
    )

    codex_home = tmp_path / "codex-home"
    write_host_config("codex", codex_home, suite, models)

    catalog = json.loads(
        (codex_home / ".codex" / "models.json").read_text(encoding="utf-8")
    )
    model = catalog["models"][0]
    assert model["apply_patch_tool_type"] is None
    assert model["supports_parallel_tool_calls"] is False
    assert "apply_patch" not in model["base_instructions"]
    assert "apply_patch" not in model["model_messages"]["instructions_template"]
    assert "shell commands" in model["base_instructions"]
    assert "cat heredocs" in model["base_instructions"]
    assert "Python file APIs" in model["base_instructions"]
    assert "at most one tool call per assistant turn" in model["base_instructions"]
    assert "wait for its output" in model["base_instructions"]


def test_host_commands_use_same_model_effort_and_disable_untrusted_paths(tmp_path: Path) -> None:
    suite = load_suite(ROOT / "config" / "stage1.yaml")
    prompt = "Fix the issue."
    claude = host_command("claude", prompt, suite, tmp_path / "claude.log")
    codex = host_command("codex", prompt, suite, tmp_path / "codex.log")

    assert claude[claude.index("--model") + 1] == suite.model.name
    assert "--disallowed-tools" in claude
    assert "WebSearch" in claude and "WebFetch" in claude
    assert codex[codex.index("-m") + 1] == suite.model.name
    assert "--dangerously-bypass-hook-trust" in codex
    assert "--dangerously-bypass-approvals-and-sandbox" in codex
