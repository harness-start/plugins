export function classifyBudgetState({
  mode,
  currentLines,
  budget,
  headLines,
  settings,
}) {
  if (mode === "report") {
    return currentLines > budget
      ? { action: "warn", kind: "report-over" }
      : { action: "allow", kind: "within-budget" };
  }
  if (mode !== "block") return { action: "allow", kind: "not-enforced" };

  if (currentLines <= budget) {
    const warnLines = Math.ceil(budget * settings.nearBudgetWarnRatio);
    return currentLines >= warnLines
      ? { action: "warn", kind: "near-budget" }
      : { action: "allow", kind: "within-budget" };
  }
  if (headLines === null) return { action: "block", kind: "new-over" };
  if (headLines <= budget) {
    return { action: "block", kind: "crossed-budget" };
  }
  if (currentLines > headLines) {
    const growth = currentLines - headLines;
    return growth <= settings.oversizeSoftGrowthLimit
      ? { action: "warn", kind: "historical-soft-growth", growth }
      : { action: "block", kind: "historical-hard-growth", growth };
  }
  if (currentLines < headLines) {
    return {
      action: "warn",
      kind: "historical-shrink",
      shrink: headLines - currentLines,
    };
  }
  return { action: "allow", kind: "historical-unchanged" };
}
