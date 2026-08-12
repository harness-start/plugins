import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.order_plan import OrderPlan


CASES = [
    (([1, 2], [3, 4]), [1, 2, 3, 4]),
    (([1, 2], [2, 3]), [1, 2, 3]),
]


def test_parameter_rows():
    for lists, expected in CASES:
        assert OrderPlan.merge(lists[0], lists[1]) == expected


def test_overlap_compatibility():
    assert OrderPlan.merge([1, 2], [2, 3]) == [1, 2, 3]


if __name__ == "__main__":
    if sys.argv[1:] == ["overlap"]:
        test_overlap_compatibility()
    else:
        test_parameter_rows()
        test_overlap_compatibility()
