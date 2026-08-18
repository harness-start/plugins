from __future__ import annotations

from harness_swe_bench.container_entry import activated_command


def test_activated_command_uses_official_testbed_conda_environment() -> None:
    command = activated_command(["codex", "exec", "prompt"])

    assert command[:2] == ["bash", "-lc"]
    assert "conda activate testbed" in command[2]
    assert command[-4:] == ["benchmark-agent", "codex", "exec", "prompt"]
