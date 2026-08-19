from __future__ import annotations

import argparse
import json
from pathlib import Path

from harness_swe_bench.config import load_suite
from harness_swe_bench.runner import (
    load_report,
    run_check,
    run_gold_smoke,
    run_suite,
    run_stage1,
    utc_run_id,
)

BENCHMARK_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BENCHMARK_ROOT.parents[1]
DEFAULT_SUITE = BENCHMARK_ROOT / "config" / "stage1.yaml"


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="harness-swe")
    root.add_argument("--suite", type=Path, default=DEFAULT_SUITE)
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("check")
    gold = commands.add_parser("gold-smoke")
    gold.add_argument("--run-id", default=None)
    stage1 = commands.add_parser("stage1")
    stage1.add_argument("--run-id", default=None)
    stage1.add_argument("--resume", action="store_true")
    run = commands.add_parser("run")
    run.add_argument("--run-id", default=None)
    run.add_argument("--resume", action="store_true")
    report = commands.add_parser("report")
    report.add_argument("--run-id", required=True)
    return root


def main(argv: list[str] | None = None) -> None:
    args = parser().parse_args(argv)
    suite = load_suite(args.suite)
    if args.command == "check":
        print(json.dumps(run_check(REPO_ROOT, BENCHMARK_ROOT, suite), indent=2))
        raise SystemExit(0)
    if args.command == "gold-smoke":
        run_id = args.run_id or utc_run_id("gold")
        raise SystemExit(0 if run_gold_smoke(REPO_ROOT, BENCHMARK_ROOT, suite, run_id) else 1)
    if args.command == "stage1":
        run_id = args.run_id or utc_run_id("stage1")
        report = run_stage1(
            REPO_ROOT, BENCHMARK_ROOT, suite, run_id, resume=args.resume
        )
        print(json.dumps({"run_id": run_id, "suite_pass": report["suite_pass"]}, indent=2))
        raise SystemExit(0 if report["suite_pass"] else 1)
    if args.command == "run":
        run_id = args.run_id or utc_run_id("suite")
        report = run_suite(
            REPO_ROOT, BENCHMARK_ROOT, suite, run_id, resume=args.resume
        )
        print(json.dumps({"run_id": run_id, "suite_pass": report["suite_pass"]}, indent=2))
        raise SystemExit(0 if report["suite_pass"] else 1)
    if args.command == "report":
        report = load_report(BENCHMARK_ROOT, args.run_id)
        print(json.dumps(report, indent=2))
        raise SystemExit(
            0
            if report.get("suite_pass") is True or report.get("stage_pass") is True
            else 1
        )
    raise SystemExit(2)
