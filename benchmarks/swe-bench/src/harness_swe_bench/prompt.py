from __future__ import annotations

import re
from collections.abc import Mapping
from pathlib import Path

SAFE_INSTANCE_FIELDS = (
    "repo",
    "instance_id",
    "base_commit",
    "problem_statement",
)
FORBIDDEN_INSTANCE_FIELDS = frozenset(
    {"patch", "test_patch", "FAIL_TO_PASS", "PASS_TO_PASS"}
)
PLACEHOLDER = re.compile(r"\{\{(?P<name>[A-Za-z0-9_]+)\}\}")


def render_prompt(template_path: Path, instance: Mapping[str, object]) -> str:
    template = template_path.read_text(encoding="utf-8")
    placeholders = {match.group("name") for match in PLACEHOLDER.finditer(template)}
    forbidden = placeholders & FORBIDDEN_INSTANCE_FIELDS
    if forbidden:
        names = ", ".join(sorted(forbidden))
        raise ValueError(f"prompt references forbidden SWE-bench field(s): {names}")
    unknown = placeholders - set(SAFE_INSTANCE_FIELDS)
    if unknown:
        names = ", ".join(sorted(unknown))
        raise ValueError(f"prompt references unknown field(s): {names}")

    rendered = template
    for field in SAFE_INSTANCE_FIELDS:
        rendered = rendered.replace("{{" + field + "}}", str(instance.get(field, "")))
    return rendered
