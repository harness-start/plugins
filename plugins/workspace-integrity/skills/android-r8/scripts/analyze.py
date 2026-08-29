#!/usr/bin/env python3
"""Summarize R8 keep-radius JSON into deterministic text evidence."""

import json
import sys
from pathlib import Path
from typing import Any


def score(count: int, denominator: int, global_sources: list[str], flag: str) -> float:
    if any(flag in source for source in global_sources):
        return 0.0
    return max(0.0, 100.0 - ((count / denominator * 100.0) if denominator else 0.0))


def analyze(data: dict[str, Any]) -> str:
    constraints = {
        entry.get("id"): set(entry.get("constraints", []))
        for entry in data.get("keep_constraints_table", [])
    }
    rule_constraints = {
        entry.get("id"): constraints.get(entry.get("constraints_id"), set())
        for entry in data.get("keep_rule_blast_radius_table", [])
    }
    totals = {"DONT_OPTIMIZE": 0, "DONT_OBFUSCATE": 0, "DONT_SHRINK": 0}
    kept_items = 0
    for table in ("kept_class_info_table", "kept_field_info_table", "kept_method_info_table"):
        for item in data.get(table, []):
            kept_items += 1
            kept_by = item.get("kept_by", [])
            for constraint in totals:
                if any(constraint in rule_constraints.get(rule, set()) for rule in kept_by):
                    totals[constraint] += 1

    build_info = data.get("build_info", {})
    live_items = sum(
        int(build_info.get(key, 0))
        for key in ("live_class_count", "live_field_count", "live_method_count")
    )
    denominator = live_items if live_items > 0 else kept_items
    global_sources = [
        str(entry.get("source", "")).lower()
        for entry in data.get("global_keep_rule_blast_radius_table", [])
    ]
    lines = [
        f"Optimization Score: {score(totals['DONT_OPTIMIZE'], denominator, global_sources, '-dontoptimize'):.2f}%",
        f"Obfuscation Score: {score(totals['DONT_OBFUSCATE'], denominator, global_sources, '-dontobfuscate'):.2f}%",
        f"Shrinking Score: {score(totals['DONT_SHRINK'], denominator, global_sources, '-dontshrink'):.2f}%",
    ]

    impactful: list[dict[str, Any]] = []
    subsumed: list[dict[str, Any]] = []
    for rule in data.get("keep_rule_blast_radius_table", []):
        radius = rule.get("blast_radius", {})
        classes = len(radius.get("class_blast_radius", []))
        fields = len(radius.get("field_blast_radius", []))
        methods = len(radius.get("method_blast_radius", []))
        impact = classes + fields + methods
        if impact == 0:
            continue
        item = {
            "id": rule.get("id"),
            "source": rule.get("source"),
            "impact": impact,
            "impact_pct": f"{(impact / denominator * 100.0) if denominator else 0.0:.2f}%",
            "classes": classes,
            "fields": fields,
            "methods": methods,
            "subsumed_by": radius.get("subsumed_by", []),
        }
        (subsumed if item["subsumed_by"] else impactful).append(item)
    impactful.sort(key=lambda item: int(item["impact"]), reverse=True)
    subsumed.sort(key=lambda item: int(item["impact"]), reverse=True)
    lines.extend([
        "",
        json.dumps(
            {"top_5_impact_keep_rules": impactful[:5], "subsumed": subsumed},
            indent=2,
            sort_keys=True,
        ),
    ])
    return "\n".join(lines)


def main() -> int:
    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tmp/r8analysis/keepruleradius.json")
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("tmp/r8analysis/analysis_result.txt")
    try:
        data = json.loads(input_path.read_text(encoding="utf-8"))
        result = analyze(data)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(result + "\n", encoding="utf-8")
    except (OSError, ValueError, TypeError) as error:
        print(f"Failed to analyze {input_path}: {error}", file=sys.stderr)
        return 1
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
