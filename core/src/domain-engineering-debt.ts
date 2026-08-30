import { readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { isRecord } from "./hook-event.js";
import { atomicWriteJson, digestKey, withPathLock } from "./state-file.js";

export type DomainDebt = {
  plugin: string;
  check: string;
  kind: "scan" | "validator";
  path: string;
  message: string;
};

export function formatDomainDebtGuard(displayName: string, debts: readonly DomainDebt[]): string {
  return [
    `[Domain Completion Guard] ${displayName} has unresolved deterministic check debt.`,
    ...debts.map((debt) => `- ${debt.check}: ${debt.path} — ${debt.message}`),
    "Fix or remove the affected file, rerun the relevant write/check, then finish again.",
  ].join("\n");
}

type DomainDebtState = {
  schema: "harness-start/domain-engineering-debt/v1";
  rootDigest: string;
  sessionDigest: string;
  debts: DomainDebt[];
};

function pluginDataRoot(): string {
  return process.env.HARNESS_HOST === "codex"
    ? process.env.PLUGIN_DATA || ""
    : process.env.CLAUDE_PLUGIN_DATA || process.env.PLUGIN_DATA || "";
}

function stateLocation(root: string, session: string): {
  path: string;
  rootDigest: string;
  sessionDigest: string;
} | null {
  const dataRoot = pluginDataRoot();
  if (!dataRoot || !session || session === "hook" || session === "unknown") return null;
  const rootDigest = digestKey(resolve(root));
  const sessionDigest = digestKey(session);
  return {
    path: join(dataRoot, "domain-engineering-debt", `${digestKey(`${rootDigest}\0${sessionDigest}`)}.json`),
    rootDigest,
    sessionDigest,
  };
}

function readState(location: NonNullable<ReturnType<typeof stateLocation>>): DomainDebtState {
  try {
    const parsed: unknown = JSON.parse(readFileSync(location.path, "utf8"));
    if (!isRecord(parsed)
      || parsed.schema !== "harness-start/domain-engineering-debt/v1"
      || parsed.rootDigest !== location.rootDigest
      || parsed.sessionDigest !== location.sessionDigest
      || !Array.isArray(parsed.debts)) throw new Error("invalid debt state");
    const debts = parsed.debts.flatMap((value): DomainDebt[] => {
      if (!isRecord(value)
        || typeof value.plugin !== "string"
        || typeof value.check !== "string"
        || (value.kind !== "scan" && value.kind !== "validator")
        || typeof value.path !== "string"
        || typeof value.message !== "string") return [];
      return [{ plugin: value.plugin, check: value.check, kind: value.kind, path: value.path, message: value.message }];
    });
    return { schema: "harness-start/domain-engineering-debt/v1", rootDigest: location.rootDigest, sessionDigest: location.sessionDigest, debts };
  } catch {
    return { schema: "harness-start/domain-engineering-debt/v1", rootDigest: location.rootDigest, sessionDigest: location.sessionDigest, debts: [] };
  }
}

function mutate(root: string, session: string, operation: (debts: DomainDebt[]) => DomainDebt[]): boolean {
  const location = stateLocation(root, session);
  if (!location) return false;
  try {
    return withPathLock(location.path, () => {
      const state = readState(location);
      const debts = operation(state.debts);
      if (debts.length === 0) {
        rmSync(location.path, { force: true });
        return true;
      }
      return atomicWriteJson(location.path, { ...state, debts });
    });
  } catch {
    return false;
  }
}

function debtKey(debt: Pick<DomainDebt, "plugin" | "check" | "kind" | "path">): string {
  return `${debt.plugin}\0${debt.check}\0${debt.kind}\0${debt.path}`;
}

export function readPolicyDebts(root: string, session: string, plugin: string): DomainDebt[] {
  const location = stateLocation(root, session);
  if (!location) return [];
  return readState(location).debts.filter((debt) => debt.plugin === plugin);
}

export function synchronizePolicyDebts(options: {
  root: string;
  session: string;
  plugin: string;
  evaluated: readonly DomainDebt[];
  failed: readonly DomainDebt[];
  deletedPaths?: ReadonlySet<string>;
}): void {
  if (!options.session) return;
  const evaluated = new Set(options.evaluated.map(debtKey));
  const failed = new Map(options.failed.map((debt) => [debtKey(debt), debt]));
  mutate(options.root, options.session, (debts) => {
    const retained = debts.filter((debt) => debt.plugin !== options.plugin
      || (!evaluated.has(debtKey(debt)) && !options.deletedPaths?.has(debt.path)));
    return [...retained, ...failed.values()].toSorted((left, right) => debtKey(left).localeCompare(debtKey(right)));
  });
}
