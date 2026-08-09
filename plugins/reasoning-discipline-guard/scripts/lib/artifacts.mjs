import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const STAGES = Object.freeze([
  "frame",
  "analysis",
  "challenge",
  "cross-check",
  "conclusion",
]);

export const STAGE_FILES = Object.freeze({
  frame: "01-frame.md",
  analysis: "02-analysis.md",
  challenge: "03-challenge.md",
  "cross-check": "04-cross-check.md",
  conclusion: "05-conclusion.md",
});

const BRANCHES = new Set(["exact", "causal", "decision"]);
const STATUSES = new Set(["open", "paused", "closed", "aborted"]);
const CONFIDENCE = new Set(["low", "medium", "high"]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function texts(value) {
  return Array.isArray(value) && value.every(text);
}

function exactKeys(value, expected, label, findings) {
  if (!object(value)) {
    findings.push(`${label} must be an object`);
    return false;
  }
  const allowed = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) findings.push(`${label} contains unknown field ${key}`);
  }
  for (const key of expected) {
    if (!(key in value)) findings.push(`${label}.${key} is required`);
  }
  return true;
}

function entries(value, label, required, findings) {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    findings.push(`${label} must be ${required ? "a non-empty" : "an"} array`);
    return [];
  }
  return value;
}

function validateIdStatement(items, label, fields, findings) {
  for (const [index, item] of items.entries()) {
    exactKeys(item, fields, `${label}[${index}]`, findings);
    if (!text(item?.id)) findings.push(`${label}[${index}].id must be non-empty`);
    if (!text(item?.statement)) findings.push(`${label}[${index}].statement must be non-empty`);
  }
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function extractMachineBlock(body, schema) {
  const escaped = schema.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(
    "(?:^|\\n)\\s*```json[ \\t]+"
      + escaped
      + "[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n\\s*```(?=\\r?\\n|$)",
    "gu",
  );
  const matches = [...String(body ?? "").matchAll(pattern)];
  if (matches.length !== 1) {
    return {
      ok: false,
      findings: [`expected exactly one fenced json ${schema} block; found ${matches.length}`],
    };
  }
  try {
    return { ok: true, value: JSON.parse(matches[0][1]), findings: [] };
  } catch (error) {
    return { ok: false, findings: [`invalid JSON in ${schema} block: ${error.message}`] };
  }
}

export function validateManifest(value) {
  const findings = [];
  exactKeys(value, [
    "schema",
    "id",
    "status",
    "branch",
    "question",
    "successCriteria",
    "run",
    "currentStage",
    "completionReceipt",
    "resume",
  ], "workflow", findings);

  if (value?.schema !== "reasoning-workflow/v1") findings.push("workflow.schema must be reasoning-workflow/v1");
  if (!/^RW-[A-Za-z0-9][A-Za-z0-9-]{2,79}$/u.test(String(value?.id ?? ""))) findings.push("workflow.id must use RW-<stable-slug>");
  if (!STATUSES.has(value?.status)) findings.push("workflow.status must be open, paused, closed, or aborted");
  if (!BRANCHES.has(value?.branch)) findings.push("workflow.branch must be exact, causal, or decision");
  if (!text(value?.question)) findings.push("workflow.question must be non-empty");
  if (!texts(value?.successCriteria) || value.successCriteria.length === 0) findings.push("workflow.successCriteria must be non-empty strings");

  exactKeys(value?.run, ["epoch"], "workflow.run", findings);
  if (!Number.isInteger(value?.run?.epoch) || value.run.epoch < 1) findings.push("workflow.run.epoch must be a positive integer");
  if (!STAGES.includes(value?.currentStage)) findings.push(`workflow.currentStage must be one of ${STAGES.join(", ")}`);
  if (value?.completionReceipt !== null && !/^RD-R[1-9][0-9]*$/u.test(String(value.completionReceipt))) findings.push("workflow.completionReceipt must be null or RD-R<n>");

  exactKeys(value?.resume, ["nextStage", "nextAction"], "workflow.resume", findings);
  if (value?.status === "paused") {
    if (!STAGES.includes(value?.resume?.nextStage)) findings.push("paused workflow requires resume.nextStage");
    if (!text(value?.resume?.nextAction)) findings.push("paused workflow requires resume.nextAction");
  }
  if (value?.status === "closed") {
    if (value?.currentStage !== "conclusion") findings.push("closed workflow.currentStage must be conclusion");
    if (!/^RD-R[1-9][0-9]*$/u.test(String(value?.completionReceipt ?? ""))) findings.push("closed workflow requires completionReceipt");
    if (value?.resume?.nextStage !== null || value?.resume?.nextAction !== null) findings.push("closed workflow resume fields must be null");
  }
  if (value?.status === "aborted" && value?.completionReceipt !== null) findings.push("aborted workflow must not claim a completionReceipt");
  return { valid: findings.length === 0, findings };
}

function validateFrame(payload, findings) {
  exactKeys(payload, ["givens", "assumptions", "ambiguities", "strategyVariables"], "frame.payload", findings);
  const givens = entries(payload?.givens, "frame.payload.givens", true, findings);
  validateIdStatement(givens, "frame.payload.givens", ["id", "statement", "source"], findings);
  for (const [index, item] of givens.entries()) if (!text(item?.source)) findings.push(`frame.payload.givens[${index}].source must be non-empty`);

  const assumptions = entries(payload?.assumptions, "frame.payload.assumptions", true, findings);
  validateIdStatement(assumptions, "frame.payload.assumptions", ["id", "statement", "source", "falsifier"], findings);
  for (const [index, item] of assumptions.entries()) {
    if (!text(item?.source)) findings.push(`frame.payload.assumptions[${index}].source must be non-empty`);
    if (!text(item?.falsifier)) findings.push(`frame.payload.assumptions[${index}].falsifier must be non-empty`);
  }

  const ambiguities = entries(payload?.ambiguities, "frame.payload.ambiguities", false, findings);
  validateIdStatement(ambiguities, "frame.payload.ambiguities", ["id", "statement", "impact", "resolution"], findings);
  for (const [index, item] of ambiguities.entries()) {
    if (!text(item?.impact) || !text(item?.resolution)) findings.push(`frame.payload.ambiguities[${index}] needs impact and resolution`);
  }

  const variables = entries(payload?.strategyVariables, "frame.payload.strategyVariables", false, findings);
  validateIdStatement(variables, "frame.payload.strategyVariables", ["id", "statement", "alternatives"], findings);
  for (const [index, item] of variables.entries()) if (!texts(item?.alternatives) || item.alternatives.length < 2) findings.push(`frame.payload.strategyVariables[${index}].alternatives needs at least two strings`);
}

function validateDerivations(value, label, findings) {
  const derivations = entries(value, label, true, findings);
  for (const [index, item] of derivations.entries()) {
    exactKeys(item, ["id", "claim", "dependsOn"], `${label}[${index}]`, findings);
    if (!text(item?.id) || !text(item?.claim)) findings.push(`${label}[${index}] needs id and claim`);
    if (!texts(item?.dependsOn) || item.dependsOn.length === 0) findings.push(`${label}[${index}].dependsOn must be non-empty strings`);
  }
}

function validateExactAnalysis(payload, findings) {
  exactKeys(payload, ["model", "derivations", "candidateAnswer"], "analysis.payload", findings);
  exactKeys(payload?.model, ["variables", "constraints", "quantifiers"], "analysis.payload.model", findings);
  if (!texts(payload?.model?.variables) || payload.model.variables.length === 0) findings.push("exact analysis requires model.variables");
  if (!texts(payload?.model?.constraints) || payload.model.constraints.length === 0) findings.push("exact analysis requires model.constraints");
  const quantifiers = entries(payload?.model?.quantifiers, "analysis.payload.model.quantifiers", true, findings);
  for (const [index, item] of quantifiers.entries()) {
    exactKeys(item, ["order", "kind", "variables", "statement"], `analysis.payload.model.quantifiers[${index}]`, findings);
    if (item?.order !== index + 1) findings.push(`analysis.payload.model.quantifiers[${index}].order must be ${index + 1}`);
    if (!["exists", "forall", "fixed"].includes(item?.kind)) findings.push(`analysis.payload.model.quantifiers[${index}].kind is invalid`);
    if (!texts(item?.variables) || item.variables.length === 0) findings.push(`analysis.payload.model.quantifiers[${index}].variables must be non-empty strings`);
    if (!text(item?.statement)) findings.push(`analysis.payload.model.quantifiers[${index}].statement must be non-empty`);
  }
  validateDerivations(payload?.derivations, "analysis.payload.derivations", findings);
  if (!text(payload?.candidateAnswer)) findings.push("exact analysis requires candidateAnswer");
}

function validateCausalAnalysis(payload, findings) {
  exactKeys(payload, ["observations", "hypotheses", "discriminatingTests", "candidateCause", "derivations"], "analysis.payload", findings);
  const observations = entries(payload?.observations, "analysis.payload.observations", true, findings);
  validateIdStatement(observations, "analysis.payload.observations", ["id", "statement", "source"], findings);
  const hypotheses = entries(payload?.hypotheses, "analysis.payload.hypotheses", true, findings);
  if (hypotheses.length < 2) findings.push("causal analysis requires at least two hypotheses");
  for (const [index, item] of hypotheses.entries()) {
    exactKeys(item, ["id", "claim", "falsifier", "status", "evidenceRefs"], `analysis.payload.hypotheses[${index}]`, findings);
    if (!text(item?.id) || !text(item?.claim) || !text(item?.falsifier)) findings.push(`analysis.payload.hypotheses[${index}] needs id, claim, and falsifier`);
    if (!["open", "supported", "falsified"].includes(item?.status)) findings.push(`analysis.payload.hypotheses[${index}].status is invalid`);
    if (!texts(item?.evidenceRefs)) findings.push(`analysis.payload.hypotheses[${index}].evidenceRefs must be strings`);
  }
  const tests = entries(payload?.discriminatingTests, "analysis.payload.discriminatingTests", true, findings);
  validateIdStatement(tests, "analysis.payload.discriminatingTests", ["id", "statement", "outcome"], findings);
  if (!text(payload?.candidateCause)) findings.push("causal analysis requires candidateCause");
  validateDerivations(payload?.derivations, "analysis.payload.derivations", findings);
}

function validateDecisionAnalysis(payload, findings) {
  exactKeys(payload, ["objectives", "constraints", "options", "criteria", "evaluations", "candidateDecision", "derivations"], "analysis.payload", findings);
  for (const [key, minimum] of [["objectives", 1], ["constraints", 1], ["options", 2]]) {
    const items = entries(payload?.[key], `analysis.payload.${key}`, true, findings);
    validateIdStatement(items, `analysis.payload.${key}`, ["id", "statement"], findings);
    if (items.length < minimum) findings.push(`decision analysis requires at least ${minimum} ${key}`);
  }
  const criteria = entries(payload?.criteria, "analysis.payload.criteria", true, findings);
  validateIdStatement(criteria, "analysis.payload.criteria", ["id", "statement", "weight"], findings);
  for (const [index, item] of criteria.entries()) if (typeof item?.weight !== "number" || item.weight < 0) findings.push(`analysis.payload.criteria[${index}].weight must be non-negative`);
  const evaluations = entries(payload?.evaluations, "analysis.payload.evaluations", true, findings);
  for (const [index, item] of evaluations.entries()) {
    exactKeys(item, ["id", "optionRef", "criterionRef", "assessment"], `analysis.payload.evaluations[${index}]`, findings);
    if (![item?.id, item?.optionRef, item?.criterionRef, item?.assessment].every(text)) findings.push(`analysis.payload.evaluations[${index}] fields must be non-empty`);
  }
  if (!text(payload?.candidateDecision)) findings.push("decision analysis requires candidateDecision");
  validateDerivations(payload?.derivations, "analysis.payload.derivations", findings);
}

function validateChallenge(payload, branch, findings) {
  exactKeys(payload, ["attacks", "revisions"], "challenge.payload", findings);
  const attacks = entries(payload?.attacks, "challenge.payload.attacks", true, findings);
  const requiredKinds = {
    exact: new Set(["counterexample", "boundary", "quantifier-order"]),
    causal: new Set(["alternate-hypothesis", "counterfactual"]),
    decision: new Set(["failure-mode", "sensitivity"]),
  };
  let branchAttack = false;
  let quantifierAudit = false;
  for (const [index, item] of attacks.entries()) {
    exactKeys(item, ["id", "targetRef", "kind", "test", "outcome", "evidence"], `challenge.payload.attacks[${index}]`, findings);
    if (![item?.id, item?.targetRef, item?.kind, item?.test, item?.outcome, item?.evidence].every(text)) findings.push(`challenge.payload.attacks[${index}] fields must be non-empty`);
    if (requiredKinds[branch]?.has(item?.kind)) branchAttack = true;
    if (item?.kind === "quantifier-order") quantifierAudit = true;
  }
  if (!branchAttack) findings.push(`challenge requires a ${branch}-appropriate attack`);
  if (branch === "exact" && !quantifierAudit) findings.push("exact challenge requires a quantifier-order attack");
  if (!Array.isArray(payload?.revisions)) findings.push("challenge.payload.revisions must be an array");
}

function validateCrossCheck(payload, branch, findings) {
  exactKeys(payload, ["checks"], "cross-check.payload", findings);
  const checks = entries(payload?.checks, "cross-check.payload.checks", true, findings);
  const methods = {
    exact: new Set(["independent-derivation", "deterministic-tool", "symbolic-solver"]),
    causal: new Set(["controlled-probe", "counterfactual", "source-triangulation"]),
    decision: new Set(["sensitivity-analysis", "alternative-weighting", "scenario-analysis"]),
  };
  let accepted = false;
  for (const [index, item] of checks.entries()) {
    exactKeys(item, ["id", "method", "independenceNote", "inputRefs", "outcome", "evidence"], `cross-check.payload.checks[${index}]`, findings);
    if (![item?.id, item?.method, item?.independenceNote, item?.outcome, item?.evidence].every(text)) findings.push(`cross-check.payload.checks[${index}] fields must be non-empty`);
    if (!texts(item?.inputRefs) || item.inputRefs.length === 0) findings.push(`cross-check.payload.checks[${index}].inputRefs must be non-empty strings`);
    if (methods[branch]?.has(item?.method)) accepted = true;
  }
  if (!accepted) findings.push(`cross-check requires a ${branch}-appropriate independent method`);
}

function validateConclusion(payload, findings) {
  exactKeys(payload, ["conclusion", "confidence", "basisRefs", "conditions", "residualUncertainties"], "conclusion.payload", findings);
  if (!text(payload?.conclusion)) findings.push("conclusion.payload.conclusion must be non-empty");
  if (!CONFIDENCE.has(payload?.confidence)) findings.push("conclusion.payload.confidence must be low, medium, or high");
  if (!texts(payload?.basisRefs) || payload.basisRefs.length < 3) findings.push("conclusion.payload.basisRefs must contain at least three references");
  if (!texts(payload?.conditions)) findings.push("conclusion.payload.conditions must be strings");
  if (!texts(payload?.residualUncertainties)) findings.push("conclusion.payload.residualUncertainties must be strings");
}

export function validateStage(value, manifest) {
  const findings = [];
  exactKeys(value, ["schema", "workflowId", "branch", "stage", "previousReceipt", "payload"], "stage", findings);
  if (value?.schema !== "reasoning-stage/v1") findings.push("stage.schema must be reasoning-stage/v1");
  if (!text(value?.workflowId) || value?.workflowId !== manifest?.id) findings.push("stage.workflowId must match workflow.id");
  if (value?.branch !== manifest?.branch) findings.push("stage.branch must match workflow.branch");
  if (!STAGES.includes(value?.stage)) findings.push(`stage.stage must be one of ${STAGES.join(", ")}`);
  if (value?.stage === "frame") {
    if (value?.previousReceipt !== null) findings.push("frame.previousReceipt must be null");
  } else if (!/^RD-R[1-9][0-9]*$/u.test(String(value?.previousReceipt ?? ""))) {
    findings.push("non-frame stage.previousReceipt must be RD-R<n>");
  }
  if (!object(value?.payload)) findings.push("stage.payload must be an object");

  if (value?.stage === "frame") validateFrame(value.payload, findings);
  if (value?.stage === "analysis") {
    if (manifest?.branch === "exact") validateExactAnalysis(value.payload, findings);
    if (manifest?.branch === "causal") validateCausalAnalysis(value.payload, findings);
    if (manifest?.branch === "decision") validateDecisionAnalysis(value.payload, findings);
  }
  if (value?.stage === "challenge") validateChallenge(value.payload, manifest?.branch, findings);
  if (value?.stage === "cross-check") validateCrossCheck(value.payload, manifest?.branch, findings);
  if (value?.stage === "conclusion") validateConclusion(value.payload, findings);
  return { valid: findings.length === 0, findings };
}

export function loadManifest(path) {
  try {
    const body = readFileSync(path, "utf8");
    const parsed = extractMachineBlock(body, "reasoning-workflow/v1");
    if (!parsed.ok) return { present: true, valid: false, path, findings: parsed.findings };
    const checked = validateManifest(parsed.value);
    return { present: true, valid: checked.valid, path, body, value: parsed.value, findings: checked.findings, sha256: sha256(body) };
  } catch (error) {
    return { present: false, valid: false, path, findings: [`cannot read workflow: ${error.message}`] };
  }
}

export function loadStage(path, manifest) {
  try {
    const body = readFileSync(path, "utf8");
    const parsed = extractMachineBlock(body, "reasoning-stage/v1");
    if (!parsed.ok) return { present: true, valid: false, path, findings: parsed.findings };
    const checked = validateStage(parsed.value, manifest);
    return { present: true, valid: checked.valid, path, body, value: parsed.value, findings: checked.findings, sha256: sha256(body) };
  } catch (error) {
    return { present: false, valid: false, path, findings: [`cannot read stage: ${error.message}`] };
  }
}

export function claimIds(stageValue) {
  const payload = stageValue?.payload ?? {};
  const ids = [];
  for (const key of [
    "givens", "assumptions", "ambiguities", "strategyVariables", "derivations",
    "observations", "hypotheses", "discriminatingTests", "objectives", "constraints",
    "options", "criteria", "evaluations", "attacks", "revisions", "checks",
  ]) {
    if (Array.isArray(payload[key])) {
      for (const item of payload[key]) if (text(item?.id)) ids.push(item.id);
    }
  }
  return ids;
}

export function referencedIds(stageValue) {
  const payload = stageValue?.payload ?? {};
  const refs = [];
  for (const item of payload.derivations ?? []) refs.push(...(item.dependsOn ?? []));
  for (const item of payload.hypotheses ?? []) refs.push(...(item.evidenceRefs ?? []));
  for (const item of payload.evaluations ?? []) refs.push(item.optionRef, item.criterionRef);
  for (const item of payload.attacks ?? []) refs.push(item.targetRef);
  for (const item of payload.checks ?? []) refs.push(...(item.inputRefs ?? []));
  refs.push(...(payload.basisRefs ?? []));
  return refs.filter(text);
}
