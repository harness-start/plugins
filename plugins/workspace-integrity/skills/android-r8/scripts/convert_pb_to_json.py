#!/usr/bin/env python3
"""Convert an R8 keep-radius protobuf report to JSON."""

import glob
import sys
from pathlib import Path

from google.protobuf import json_format

import keep_radius_pb2


def convert(input_path: Path, output_path: Path) -> None:
    report = keep_radius_pb2.BlastRadiusContainer()
    report.ParseFromString(input_path.read_bytes())
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json_format.MessageToJson(
            report,
            always_print_fields_with_no_presence=True,
            preserving_proto_field_name=True,
            indent=4,
        ),
        encoding="utf-8",
    )


def main() -> int:
    candidates = sorted(glob.glob("tmp/r8analysis/*.pb"))
    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else (Path(candidates[-1]) if candidates else None)
    if input_path is None or not input_path.is_file():
        print("No R8 keep-radius protobuf report found.", file=sys.stderr)
        return 1
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("tmp/r8analysis/keepruleradius.json")
    try:
        convert(input_path, output_path)
    except (OSError, ValueError) as error:
        print(f"Failed to convert {input_path}: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
