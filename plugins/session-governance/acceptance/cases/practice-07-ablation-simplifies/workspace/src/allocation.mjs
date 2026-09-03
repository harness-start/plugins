class LimitComparison {
  allows(requested, remaining) {
    return requested <= remaining;
  }
}

class AllocationPolicy {
  constructor(comparison) {
    this.comparison = comparison;
  }

  canAllocate(requested, remaining) {
    return this.comparison.allows(requested, remaining);
  }
}

function createAllocationPolicy() {
  return new AllocationPolicy(new LimitComparison());
}

export function canAllocate(requested, remaining) {
  return createAllocationPolicy().canAllocate(requested, remaining);
}
