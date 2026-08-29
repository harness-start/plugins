export type BudgetAction = "allow" | "warn" | "block";

export type BudgetDecision =
  | { action: "warn"; kind: "report-over" }
  | { action: "allow"; kind: "within-budget" }
  | { action: "allow"; kind: "not-enforced" }
  | { action: "warn"; kind: "near-budget" }
  | { action: "block"; kind: "new-over" }
  | { action: "block"; kind: "crossed-budget" }
  | { action: "allow"; kind: "historical-soft-growth"; growth: number }
  | { action: "block"; kind: "historical-hard-growth"; growth: number }
  | { action: "warn"; kind: "historical-shrink"; shrink: number }
  | { action: "allow"; kind: "historical-unchanged" };

export type BudgetPolicySettings = {
  nearBudgetWarnRatio: number;
  oversizeSoftGrowthLimit: number;
};

export function classifyBudgetState({
  mode,
  currentLines,
  budget,
  headLines,
  settings,
}: {
  mode: string;
  currentLines: number;
  budget: number;
  headLines: number | null;
  settings: BudgetPolicySettings;
}): BudgetDecision {
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
      ? { action: "allow", kind: "historical-soft-growth", growth }
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
