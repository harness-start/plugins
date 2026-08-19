export class DependencyCycleError extends Error {}

export function stableOrder(items, prerequisites) {
  const order = [...new Set(items)];
  const remaining = new Map(order.map((item) => [item, new Set(prerequisites.get(item) ?? [])]));
  const result = [];

  while (remaining.size > 0) {
    const ready = order.filter((item) => remaining.has(item) &&
      [...remaining.get(item)].every((dependency) => !remaining.has(dependency)));
    if (ready.length === 0) throw new DependencyCycleError("dependency cycle");
    result.push(...ready);
    for (const item of ready) remaining.delete(item);
  }
  return result;
}
