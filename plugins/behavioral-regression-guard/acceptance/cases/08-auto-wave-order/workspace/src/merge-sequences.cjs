function mergeSequences(sequences) {
  const outgoing = new Map();
  const indegree = new Map();
  for (const sequence of sequences) {
    for (const item of sequence) {
      if (!outgoing.has(item)) outgoing.set(item, new Set());
      if (!indegree.has(item)) indegree.set(item, 0);
    }
    for (let index = 1; index < sequence.length; index += 1) {
      const before = sequence[index - 1];
      const after = sequence[index];
      if (!outgoing.get(before).has(after)) {
        outgoing.get(before).add(after);
        indegree.set(after, indegree.get(after) + 1);
      }
    }
  }

  const ready = [...indegree].filter(([, count]) => count === 0).map(([item]) => item).sort();
  const result = [];
  while (ready.length > 0) {
    const item = ready.shift();
    result.push(item);
    for (const next of outgoing.get(item)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  if (result.length !== indegree.size) throw new Error("cycle");
  return result;
}

module.exports = { mergeSequences };
