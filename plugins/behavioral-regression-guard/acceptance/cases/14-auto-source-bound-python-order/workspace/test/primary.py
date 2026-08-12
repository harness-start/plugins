import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.order_plan import OrderConflictWarning, OrderPlan


with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always", OrderConflictWarning)
    actual = (
        OrderPlan(["C"])
        .plus(OrderPlan(["A"]))
        .plus(OrderPlan(["A", "B", "C"]))
        .resolved
    )

if actual != ["A", "B", "C"] or caught:
    print("PRIMARY_COMPOSITION_REPRO pairwise intermediate invented precedence")
    print("actual:", actual)
    print("warnings:", [str(item.message) for item in caught])
    raise SystemExit(1)

print("PRIMARY_COMPOSITION_FIXED")
