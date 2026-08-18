from __future__ import annotations

from pathlib import Path

import pytest

from harness_swe_bench.prompt import FORBIDDEN_INSTANCE_FIELDS, render_prompt


SAFE_INSTANCE = {
    "instance_id": "owner__repo-1",
    "repo": "owner/repo",
    "base_commit": "abc123",
    "problem_statement": "Fix the observable regression.",
    "patch": "SECRET_GOLD_PATCH",
    "test_patch": "SECRET_TEST_PATCH",
    "FAIL_TO_PASS": ["secret::test"],
    "PASS_TO_PASS": ["secret::regression"],
}
ROOT = Path(__file__).resolve().parents[1]


def test_render_prompt_exposes_only_safe_instance_fields(tmp_path) -> None:
    template = tmp_path / "prompt.md"
    template.write_text(
        "{{repo}}\n{{instance_id}}\n{{base_commit}}\n{{problem_statement}}\n",
        encoding="utf-8",
    )

    rendered = render_prompt(template, SAFE_INSTANCE)

    assert rendered == (
        "owner/repo\nowner__repo-1\nabc123\nFix the observable regression.\n"
    )
    assert all(str(SAFE_INSTANCE[field]) not in rendered for field in FORBIDDEN_INSTANCE_FIELDS)


@pytest.mark.parametrize("field", sorted(FORBIDDEN_INSTANCE_FIELDS))
def test_render_prompt_rejects_forbidden_placeholders(tmp_path, field: str) -> None:
    template = tmp_path / "prompt.md"
    template.write_text("{{" + field + "}}\n", encoding="utf-8")

    with pytest.raises(ValueError, match="forbidden SWE-bench field"):
        render_prompt(template, SAFE_INSTANCE)


def test_committed_prompt_routes_through_tdd_guard_without_a_denied_edit() -> None:
    rendered = render_prompt(ROOT / "prompts" / "issue-fix.md", SAFE_INSTANCE)

    assert "Before editing production code" in rendered
    assert "observe the intended test failure" in rendered
    assert "Only then edit production code" in rendered
