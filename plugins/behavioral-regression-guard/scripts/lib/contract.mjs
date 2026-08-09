import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

const TOP_FIELDS = ["schema", "id", "epoch", "status", "recovery", "problem", "scope", "cases"];
const DIMENSIONS = ["boundary", "representation", "composition", "ordering", "error-contract", "state-transition", "concurrency", "compatibility"];
const ROLES = ["primary", "challenge", "invariant"];
const OUTCOMES = ["success", "failure"];
const STATUSES = ["open", "paused", "closed", "aborted"];

function unknownFields(value, allowed, prefix, findings) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (!allowed.includes(key)) findings.push(`${prefix}unknown field: ${key}`);
}

function nonempty(value) { return typeof value === "string" && value.trim().length > 0; }

export function isSafeRelativePath(value) {
  if (!nonempty(value) || isAbsolute(value) || value.includes("\\")) return false;
  const parts = value.split("/");
  return !parts.some((part) => !part || part === "." || part === "..");
}

export function isDirectCommand(value) {
  return nonempty(value)
    && !/[\0\r\n|><`;]/u.test(value)
    && !/&&|\$\(/u.test(value);
}

export function normalizeCommand(value) { return String(value ?? "").trim(); }

function validateExpectation(value, path, findings) {
  unknownFields(value, ["outcome", "includes"], `${path}.`, findings);
  if (!OUTCOMES.includes(value?.outcome)) findings.push(`${path}.outcome must be one of: ${OUTCOMES.join(", ")}`);
  if (!Array.isArray(value?.includes) || value.includes.length === 0 || value.includes.some((item) => !nonempty(item))) findings.push(`${path}.includes must contain at least one non-empty literal`);
  if (value?.includes?.some((item) => String(item).length > 200)) findings.push(`${path}.includes literals must be at most 200 characters`);
}

export function validateContract(value) {
  const findings = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, findings: ["contract must be a JSON object"] };
  unknownFields(value, TOP_FIELDS, "", findings);
  if (value.schema !== "behavioral-regression/v1") findings.push("schema must equal behavioral-regression/v1");
  if (!/^BR-[A-Za-z0-9][A-Za-z0-9-]{2,80}$/u.test(String(value.id ?? ""))) findings.push("id must be a stable BR-* identifier");
  if (!Number.isSafeInteger(value.epoch) || value.epoch < 1) findings.push("epoch must be a positive integer");
  if (!STATUSES.includes(value.status)) findings.push(`status must be one of: ${STATUSES.join(", ")}`);

  unknownFields(value.recovery, ["nextAction", "commands"], "recovery.", findings);
  if (!nonempty(value.recovery?.nextAction)) findings.push("recovery.nextAction must be non-empty");
  if (!Array.isArray(value.recovery?.commands) || value.recovery.commands.some((item) => !isDirectCommand(item))) findings.push("recovery.commands must contain only direct commands");

  unknownFields(value.problem, ["expected", "actual", "successCriteria"], "problem.", findings);
  if (!nonempty(value.problem?.expected)) findings.push("problem.expected must be non-empty");
  if (!nonempty(value.problem?.actual)) findings.push("problem.actual must be non-empty");
  if (!Array.isArray(value.problem?.successCriteria) || value.problem.successCriteria.length === 0 || value.problem.successCriteria.some((item) => !nonempty(item))) findings.push("problem.successCriteria must contain non-empty criteria");

  unknownFields(value.scope, ["productionPaths", "verificationPaths"], "scope.", findings);
  for (const key of ["productionPaths", "verificationPaths"]) {
    const paths = value.scope?.[key];
    if (!Array.isArray(paths) || paths.length === 0) findings.push(`scope.${key} must contain at least one path`);
    else {
      if (paths.length > 20) findings.push(`scope.${key} may contain at most 20 paths`);
      if (paths.some((item) => !isSafeRelativePath(item))) findings.push(`scope.${key} entries must be workspace-relative POSIX paths without traversal`);
      if (new Set(paths).size !== paths.length) findings.push(`scope.${key} contains a duplicate path`);
    }
  }

  if (!Array.isArray(value.cases) || value.cases.length < 4 || value.cases.length > 20) findings.push("cases must contain between 4 and 20 cases");
  if (Array.isArray(value.cases)) {
    const ids = new Set();
    for (const [index, item] of value.cases.entries()) {
      const path = `cases[${index}]`;
      unknownFields(item, ["id", "role", "dimension", "cwd", "command", "before", "after", "receipts"], `${path}.`, findings);
      if (!/^BR-C[1-9][0-9]*$/u.test(String(item?.id ?? ""))) findings.push(`${path}.id must match BR-CN`);
      if (ids.has(item?.id)) findings.push(`${path}.id is duplicate`);
      ids.add(item?.id);
      if (!ROLES.includes(item?.role)) findings.push(`${path}.role must be one of: ${ROLES.join(", ")}`);
      if (!DIMENSIONS.includes(item?.dimension)) findings.push(`${path}.dimension must be one of: ${DIMENSIONS.join(", ")}`);
      if (item?.cwd !== "." && !isSafeRelativePath(item?.cwd)) findings.push(`${path}.cwd must be . or a workspace-relative POSIX path`);
      if (!isDirectCommand(item?.command)) findings.push(`${path}.command must be a direct command without newlines, pipes, redirects, connectors, backticks, or command substitution`);
      validateExpectation(item?.before, `${path}.before`, findings);
      validateExpectation(item?.after, `${path}.after`, findings);
      unknownFields(item?.receipts, ["before", "after"], `${path}.receipts.`, findings);
      for (const phase of ["before", "after"]) if (item?.receipts?.[phase] !== null && !/^BR-R[1-9][0-9]*$/u.test(String(item?.receipts?.[phase] ?? ""))) findings.push(`${path}.receipts.${phase} must be null or BR-RN`);
    }
    const counts = Object.fromEntries(ROLES.map((role) => [role, value.cases.filter((item) => item.role === role).length]));
    if (counts.primary < 1) findings.push("cases require at least one primary case");
    if (counts.challenge < 2) findings.push("cases require at least two challenge cases");
    if (counts.invariant < 1) findings.push("cases require at least one invariant case");
    const challengeDimensions = new Set(value.cases.filter((item) => item.role === "challenge").map((item) => item.dimension));
    if (challengeDimensions.size < 2) findings.push("challenge cases must use at least two distinct dimensions");
    if (!value.cases.some((item) => item.role === "primary" && item.before?.outcome === "failure" && item.after?.outcome === "success")) findings.push("at least one primary case must transition from failure BEFORE to success AFTER");
    for (const [index, item] of value.cases.entries()) {
      if (item.before?.outcome === item.after?.outcome) continue;
      const before = [...(item.before?.includes ?? [])].sort();
      const after = [...(item.after?.includes ?? [])].sort();
      if (JSON.stringify(before) === JSON.stringify(after)) findings.push(`cases[${index}] must use distinct literal signatures when its outcome changes`);
    }
  }
  return { valid: findings.length === 0, findings };
}

export function planDigest(contract) {
  const stable = {
    schema: contract?.schema,
    id: contract?.id,
    problem: contract?.problem,
    scope: contract?.scope,
    cases: Array.isArray(contract?.cases) ? contract.cases.map(({ receipts: _receipts, ...item }) => item) : contract?.cases,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function isContractPath(path, repoRoot) {
  const rel = relative(resolve(repoRoot), resolve(path)).split(sep).join("/");
  return /^\.behavioral-regression\/BR-[A-Za-z0-9][A-Za-z0-9-]{2,80}\.json$/u.test(rel);
}

export function loadContract(path) {
  if (!existsSync(path)) return { valid: false, findings: ["bound contract is missing"] };
  let value;
  try { value = JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { return { valid: false, findings: [`contract is not valid JSON: ${error?.message ?? error}`] }; }
  const checked = validateContract(value);
  if (checked.valid && basename(path) !== `${value.id}.json`) checked.findings.push(`contract filename must be ${value.id}.json`);
  return { valid: checked.findings.length === 0, findings: checked.findings, contract: value };
}
