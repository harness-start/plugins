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
const COMPARISON_OPERATORS = new Set(["eq", "ne", "gt", "gte", "lt", "lte"]);
const MAX_REPLAY_RESPONSES = 1000000;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function texts(value) {
  return Array.isArray(value) && value.every(text);
}

function statesActionTimeObservability(statement) {
  const clauses = String(statement ?? "").split(
    /[.;:\u3002\uff1b\uff1a]|\b(?:but|however|while|although)\b|(?:\u4f46\u662f|\u4e0d\u8fc7|\u7136\u800c|\u867d\u7136|\u4f46)/giu,
  );
  const positive = [
    /\b(?:is|are)\s+(?:directly\s+)?(?:distinguishable|observable|detectable|identifiable)\b/iu,
    /\b(?:can|may|able to)\s+(?:choose|distinguish|sense|feel|observe|detect|identify|select)\b/iu,
    /(?:\u9760|\u51ed|\u901a\u8fc7)[^\u3002\uff1b\uff1a]{0,12}(?:\u624b\u611f|\u89e6\u6478|\u89c2\u5bdf)[^\u3002\uff1b\uff1a]{0,12}(?:\u5206\u8fa8|\u533a\u5206|\u8fa8\u522b|\u8bc6\u522b|\u9009\u62e9)/u,
    /(?:\u53ef\u4ee5|\u53ef|\u80fd\u591f|\u80fd)[^\u3002\uff1b\uff1a]{0,10}(?:\u5206\u8fa8|\u533a\u5206|\u611f\u77e5|\u89c2\u5bdf|\u8bc6\u522b|\u9009\u62e9)/u,
  ];
  const negative = [
    /\b(?:cannot|can't|may not|unable to|not)\b.{0,30}\b(?:choose|distinguish|sense|feel|observe|detect|identify|select)\b/iu,
    /(?:\u4e0d\u80fd|\u65e0\u6cd5|\u4e0d\u53ef|\u4e0d\u5141\u8bb8)[^\u3002\uff1b\uff1a]{0,20}(?:\u5206\u8fa8|\u533a\u5206|\u611f\u77e5|\u89c2\u5bdf|\u8bc6\u522b|\u9009\u62e9)/u,
  ];
  return clauses.some((clause) => (
    positive.some((pattern) => pattern.test(clause))
    && !negative.some((pattern) => pattern.test(clause))
  ));
}

function statesExplicitSignalUseBlock(statement) {
  const value = String(statement ?? "");
  return [
    /\b(?:cannot|can't|must not|may not|is not allowed to|is prohibited from|is forbidden from)\b.{0,80}\b(?:use|choose|select|pick|sort|allocate|reject|return|keep)\b.{0,80}\b(?:touch|feel|shape|signal|observation|observable|distinguish)/iu,
    /\b(?:cannot|can't|must not|may not|is not allowed to|is prohibited from|is forbidden from)\b.{0,80}\b(?:touch|feel|shape|signal|observation|observable|distinguish)\b.{0,80}\b(?:choose|select|pick|sort|allocate|reject|return|keep)/iu,
    /\b(?:fully|entirely|strictly)\s+blind\s+(?:draw|selection)\b/iu,
    /(?:\u4e0d\u80fd|\u65e0\u6cd5|\u4e0d\u5f97|\u4e0d\u5141\u8bb8|\u7981\u6b62)[^\u3002\uff01\uff1f\n]{0,40}(?:\u5229\u7528|\u6839\u636e|\u901a\u8fc7|\u51ed|\u6309)?[^\u3002\uff01\uff1f\n]{0,20}(?:\u624b\u611f|\u89e6\u6478|\u5f62\u72b6|\u4fe1\u53f7|\u89c2\u5bdf|\u5206\u8fa8|\u533a\u5206)[^\u3002\uff01\uff1f\n]{0,30}(?:\u9009\u62e9|\u6311\u9009|\u5206\u914d|\u62d2\u7edd|\u653e\u56de|\u4fdd\u7559)/u,
    /(?:\u4e0d\u80fd|\u65e0\u6cd5|\u4e0d\u5f97|\u4e0d\u5141\u8bb8|\u7981\u6b62)[^\u3002\uff01\uff1f\n]{0,30}(?:\u9009\u62e9|\u6311\u9009|\u5206\u914d|\u62d2\u7edd|\u653e\u56de|\u4fdd\u7559)[^\u3002\uff01\uff1f\n]{0,30}(?:\u624b\u611f|\u89e6\u6478|\u5f62\u72b6|\u4fe1\u53f7|\u89c2\u5bdf|\u5206\u8fa8|\u533a\u5206)/u,
    /(?:\u5b8c\u5168|\u5168\u7a0b|\u4e25\u683c)?\u76f2\u62bd/u,
  ].some((pattern) => pattern.test(value));
}

function sameKeys(left, right) {
  return [...left].sort().join("\u0000") === [...right].sort().join("\u0000");
}

function validateCondition(node, variables, label, findings) {
  if (!object(node) || !text(node.op)) {
    findings.push(`${label} must be a condition object`);
    return;
  }
  if (["and", "or"].includes(node.op)) {
    exactKeys(node, ["op", "args"], label, findings);
    const args = entries(node.args, `${label}.args`, true, findings);
    if (args.length < 2) findings.push(`${label}.args must contain at least two conditions`);
    for (const [index, item] of args.entries()) {
      validateCondition(item, variables, `${label}.args[${index}]`, findings);
    }
    return;
  }
  if (node.op === "not") {
    exactKeys(node, ["op", "arg"], label, findings);
    validateCondition(node.arg, variables, `${label}.arg`, findings);
    return;
  }
  exactKeys(node, ["op", "variable", "value"], label, findings);
  if (!COMPARISON_OPERATORS.has(node.op)) findings.push(`${label}.op is invalid`);
  if (!text(node.variable) || !variables.has(node.variable)) findings.push(`${label}.variable is unknown`);
  if (!Number.isInteger(node.value)) findings.push(`${label}.value must be an integer`);
}

function evaluateCondition(node, assignment) {
  if (node.op === "and") return node.args.every((item) => evaluateCondition(item, assignment));
  if (node.op === "or") return node.args.some((item) => evaluateCondition(item, assignment));
  if (node.op === "not") return !evaluateCondition(node.arg, assignment);
  const actual = assignment[node.variable];
  if (node.op === "eq") return actual === node.value;
  if (node.op === "ne") return actual !== node.value;
  if (node.op === "gt") return actual > node.value;
  if (node.op === "gte") return actual >= node.value;
  if (node.op === "lt") return actual < node.value;
  if (node.op === "lte") return actual <= node.value;
  return false;
}

function assignmentsForGroup(group, total) {
  const results = [];
  const visit = (index, remaining, assignment) => {
    const member = group.members[index];
    if (index === group.members.length - 1) {
      if (remaining >= 0 && remaining <= member.capacity) {
        results.push({ ...assignment, [member.variable]: remaining });
      }
      return;
    }
    const remainingCapacity = group.members
      .slice(index + 1)
      .reduce((sum, item) => sum + item.capacity, 0);
    const lower = Math.max(0, remaining - remainingCapacity);
    const upper = Math.min(member.capacity, remaining);
    for (let value = lower; value <= upper; value += 1) {
      visit(index + 1, remaining - value, { ...assignment, [member.variable]: value });
    }
  };
  visit(0, total, {});
  return results;
}

function everyJointResponseSucceeds(groups, strategyAssignment, condition) {
  const responses = groups.map((group) => assignmentsForGroup(
    group,
    strategyAssignment[group.component],
  ));
  if (responses.some((items) => items.length === 0)) return false;
  const visit = (index, environment) => {
    if (index === responses.length) return evaluateCondition(condition, environment);
    return responses[index].every((response) => visit(index + 1, { ...environment, ...response }));
  };
  return visit(0, {});
}

function replayFiniteAllocation(model) {
  let bestValue = Number.POSITIVE_INFINITY;
  const bestAssignments = [];
  let visitedStrategies = 0;
  const visit = (index, assignment) => {
    if (index < model.domains.length) {
      const domain = model.domains[index];
      for (let value = domain.min; value <= domain.max; value += 1) {
        visit(index + 1, { ...assignment, [domain.component]: value });
      }
      return;
    }
    visitedStrategies += 1;
    if (!everyJointResponseSucceeds(model.responseGroups, assignment, model.successCondition)) return;
    const objectiveValue = model.objective.terms.reduce(
      (sum, component) => sum + assignment[component],
      0,
    );
    if (objectiveValue < bestValue) {
      bestValue = objectiveValue;
      bestAssignments.length = 0;
      bestAssignments.push(assignment);
    } else if (objectiveValue === bestValue) {
      bestAssignments.push(assignment);
    }
  };
  visit(0, {});
  return { bestValue, bestAssignments, visitedStrategies };
}

function validateReplayModel(model, searchedComponents, label, findings) {
  if (!exactKeys(model, ["kind", "domains", "responseGroups", "successCondition", "objective", "sourceRefs"], label, findings)) return null;
  if (model.kind !== "finite-partition-allocation") findings.push(`${label}.kind must be finite-partition-allocation`);
  if (!texts(model.sourceRefs) || model.sourceRefs.length === 0) findings.push(`${label}.sourceRefs must be non-empty strings`);

  const domains = entries(model.domains, `${label}.domains`, true, findings);
  const domainComponents = [];
  let strategyCount = 1;
  for (const [index, domain] of domains.entries()) {
    exactKeys(domain, ["component", "min", "max"], `${label}.domains[${index}]`, findings);
    if (!text(domain?.component)) findings.push(`${label}.domains[${index}].component must be non-empty`);
    if (!Number.isInteger(domain?.min) || !Number.isInteger(domain?.max) || domain.min < 0 || domain.max < domain.min) {
      findings.push(`${label}.domains[${index}] must use integer bounds with 0 <= min <= max`);
    } else {
      strategyCount *= domain.max - domain.min + 1;
    }
    domainComponents.push(domain?.component);
  }
  if (new Set(domainComponents).size !== domainComponents.length) findings.push(`${label}.domains components must be unique`);
  if (!sameKeys(domainComponents, searchedComponents ?? [])) findings.push(`${label}.domains must cover exactly searchedComponents`);
  if (strategyCount > 100000) findings.push(`${label}.domains exceed the 100000-strategy replay limit`);

  const groups = entries(model.responseGroups, `${label}.responseGroups`, true, findings);
  const groupComponents = [];
  const responseVariables = new Set();
  let responseSpace = 1;
  for (const [groupIndex, group] of groups.entries()) {
    exactKeys(group, ["component", "members"], `${label}.responseGroups[${groupIndex}]`, findings);
    if (!text(group?.component)) findings.push(`${label}.responseGroups[${groupIndex}].component must be non-empty`);
    groupComponents.push(group?.component);
    const members = entries(group?.members, `${label}.responseGroups[${groupIndex}].members`, true, findings);
    if (members.length < 2) findings.push(`${label}.responseGroups[${groupIndex}].members must contain at least two categories`);
    let capacity = 0;
    for (const [memberIndex, member] of members.entries()) {
      exactKeys(member, ["variable", "capacity"], `${label}.responseGroups[${groupIndex}].members[${memberIndex}]`, findings);
      if (!text(member?.variable)) findings.push(`${label}.responseGroups[${groupIndex}].members[${memberIndex}].variable must be non-empty`);
      if (!Number.isInteger(member?.capacity) || member.capacity < 0 || member.capacity > 10000) {
        findings.push(`${label}.responseGroups[${groupIndex}].members[${memberIndex}].capacity must be an integer from 0 to 10000`);
      } else {
        capacity += member.capacity;
        if (responseSpace <= MAX_REPLAY_RESPONSES) responseSpace *= member.capacity + 1;
      }
      if (responseVariables.has(member?.variable)) findings.push(`${label} response variable ${member?.variable} is duplicated`);
      responseVariables.add(member?.variable);
    }
    const domain = domains.find((item) => item.component === group?.component);
    if (domain && Number.isInteger(domain.max) && domain.max > capacity) {
      findings.push(`${label} domain ${group.component}.max exceeds its response capacity ${capacity}`);
    }
  }
  if (!sameKeys(groupComponents, domainComponents)) findings.push(`${label}.responseGroups must cover every domain component exactly once`);
  if (responseSpace > MAX_REPLAY_RESPONSES) {
    findings.push(`${label} response space exceeds the ${MAX_REPLAY_RESPONSES}-combination replay limit`);
  }

  exactKeys(model.objective, ["sense", "terms"], `${label}.objective`, findings);
  if (model.objective?.sense !== "minimize") findings.push(`${label}.objective.sense must be minimize`);
  if (!texts(model.objective?.terms) || !sameKeys(model.objective.terms, domainComponents)) {
    findings.push(`${label}.objective.terms must cover every domain component exactly once`);
  }
  validateCondition(model.successCondition, responseVariables, `${label}.successCondition`, findings);
  return findings.length === 0 ? replayFiniteAllocation(model) : null;
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

function validateFrame(payload, branch, findings) {
  const keys = ["givens", "assumptions", "ambiguities", "strategyVariables"];
  if (branch === "exact") keys.push("controlAssignments", "observabilityAudit");
  exactKeys(payload, keys, "frame.payload", findings);
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
  for (const [index, item] of variables.entries()) {
    const fields = branch === "exact" ? ["id", "kind", "statement", "components", "alternatives"] : ["id", "statement", "alternatives"];
    exactKeys(item, fields, `frame.payload.strategyVariables[${index}]`, findings);
    if (!text(item?.id) || !text(item?.statement)) findings.push(`frame.payload.strategyVariables[${index}] needs id and statement`);
    if (!texts(item?.alternatives) || item.alternatives.length < 2) findings.push(`frame.payload.strategyVariables[${index}].alternatives needs at least two strings`);
    if (branch === "exact" && !["scalar", "allocation", "selection", "policy"].includes(item?.kind)) {
      findings.push(`frame.payload.strategyVariables[${index}].kind is invalid`);
    }
    if (branch === "exact") {
      if (!texts(item?.components) || item.components.length === 0) {
        findings.push(`frame.payload.strategyVariables[${index}].components must be non-empty strings`);
      } else if (new Set(item.components).size !== item.components.length) {
        findings.push(`frame.payload.strategyVariables[${index}].components must be unique`);
      }
      if (item?.kind === "allocation" && (!Array.isArray(item?.components) || item.components.length < 2)) {
        findings.push(`frame.payload.strategyVariables[${index}] allocation requires at least two independently fixed components`);
      }
    }
  }

  if (branch === "exact") {
    const assignments = entries(payload?.controlAssignments, "frame.payload.controlAssignments", true, findings);
    const strategyIds = new Set(variables.map((item) => item.id));
    const assignedStrategyIds = new Set();
    for (const [index, item] of assignments.entries()) {
      exactKeys(item, ["id", "strategyRef", "dimension", "controller", "timing", "basis", "alternative", "impact"], `frame.payload.controlAssignments[${index}]`, findings);
      if (![item?.id, item?.dimension, item?.controller, item?.timing, item?.basis, item?.alternative, item?.impact].every(text)) {
        findings.push(`frame.payload.controlAssignments[${index}] fields must be non-empty`);
      }
      if (!["solver", "participant", "environment", "adversary", "fixed"].includes(item?.controller)) {
        findings.push(`frame.payload.controlAssignments[${index}].controller is invalid`);
      }
      if (item?.strategyRef !== null && !text(item?.strategyRef)) {
        findings.push(`frame.payload.controlAssignments[${index}].strategyRef must be a strategy id or null`);
      } else if (text(item?.strategyRef)) {
        if (!strategyIds.has(item.strategyRef)) {
          findings.push(`frame.payload.controlAssignments[${index}].strategyRef is unknown`);
        } else {
          assignedStrategyIds.add(item.strategyRef);
          if (!["solver", "participant"].includes(item?.controller)) {
            findings.push(`frame.payload.controlAssignments[${index}] maps a strategy variable to a non-participant controller`);
          }
        }
      }
    }
    for (const strategyId of strategyIds) {
      if (!assignedStrategyIds.has(strategyId)) findings.push(`frame.payload.strategyVariables ${strategyId} lacks a control assignment`);
    }

    const sourceIds = new Set([...givens, ...assumptions].map((item) => item.id));
    const givenIds = new Set(givens.map((item) => item.id));
    const givenById = new Map(givens.map((item) => [item.id, item]));
    const strategyById = new Map(variables.map((item) => [item.id, item]));
    const audits = entries(payload?.observabilityAudit, "frame.payload.observabilityAudit", true, findings);
    for (const [index, item] of audits.entries()) {
      exactKeys(item, ["id", "dimension", "sourceRef", "observable", "controlEffect", "timing", "strategyRef", "overrideSourceRef", "implication"], `frame.payload.observabilityAudit[${index}]`, findings);
      if (![item?.id, item?.dimension, item?.sourceRef, item?.timing, item?.implication].every(text)) {
        findings.push(`frame.payload.observabilityAudit[${index}] text fields must be non-empty`);
      }
      if (!sourceIds.has(item?.sourceRef)) findings.push(`frame.payload.observabilityAudit[${index}].sourceRef is unknown`);
      if (typeof item?.observable !== "boolean") findings.push(`frame.payload.observabilityAudit[${index}].observable must be boolean`);
      if (item?.observable === true) {
        if (item?.controlEffect === "allocation") {
          if (!text(item?.strategyRef) || !strategyIds.has(item.strategyRef)) {
            findings.push(`frame.payload.observabilityAudit[${index}] allocation requires a strategyRef`);
          } else if (strategyById.get(item.strategyRef)?.kind !== "allocation") {
            findings.push(`frame.payload.observabilityAudit[${index}] allocation requires an allocation strategy`);
          } else if (!assignedStrategyIds.has(item.strategyRef)) {
            findings.push(`frame.payload.observabilityAudit[${index}].strategyRef lacks participant control`);
          }
          if (item?.overrideSourceRef !== null) findings.push(`frame.payload.observabilityAudit[${index}] allocation must use overrideSourceRef null`);
        } else if (item?.controlEffect === "blocked") {
          if (item?.strategyRef !== null) findings.push(`frame.payload.observabilityAudit[${index}] blocked selection must use strategyRef null`);
          if (!text(item?.overrideSourceRef) || !givenIds.has(item.overrideSourceRef)) {
            findings.push(`frame.payload.observabilityAudit[${index}] blocked selection requires overrideSourceRef to a given`);
          } else {
            const override = givenById.get(item.overrideSourceRef);
            if (override.source !== "user-verbatim" || !statesExplicitSignalUseBlock(override.statement)) {
              findings.push(`frame.payload.observabilityAudit[${index}] override must explicitly forbid using the observable signal and use source user-verbatim`);
            }
          }
        } else {
          findings.push(`frame.payload.observabilityAudit[${index}] observable dimension must use controlEffect allocation or blocked`);
        }
      } else {
        if (item?.controlEffect !== "none") findings.push(`frame.payload.observabilityAudit[${index}] hidden dimension must use controlEffect none`);
        if (item?.strategyRef !== null) findings.push(`frame.payload.observabilityAudit[${index}] hidden dimension must use strategyRef null`);
        if (item?.overrideSourceRef !== null) findings.push(`frame.payload.observabilityAudit[${index}] hidden dimension must use overrideSourceRef null`);
      }
    }
    for (const given of givens.filter((item) => statesActionTimeObservability(item.statement))) {
      if (!audits.some((item) => item.sourceRef === given.id && item.observable === true)) {
        findings.push(`given ${given.id} states action-time observability but lacks an observable audit`);
      }
    }
  }
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
  exactKeys(payload, ["model", "strategyEvaluations", "derivations", "candidateAnswer"], "analysis.payload", findings);
  exactKeys(payload?.model, ["variables", "constraints", "quantifiers"], "analysis.payload.model", findings);
  if (!texts(payload?.model?.variables) || payload.model.variables.length === 0) findings.push("exact analysis requires model.variables");
  if (!texts(payload?.model?.constraints) || payload.model.constraints.length === 0) findings.push("exact analysis requires model.constraints");
  const quantifiers = entries(payload?.model?.quantifiers, "analysis.payload.model.quantifiers", true, findings);
  for (const [index, item] of quantifiers.entries()) {
    exactKeys(item, ["order", "kind", "variables", "strategyRefs", "statement"], `analysis.payload.model.quantifiers[${index}]`, findings);
    if (item?.order !== index + 1) findings.push(`analysis.payload.model.quantifiers[${index}].order must be ${index + 1}`);
    if (!["exists", "forall", "fixed"].includes(item?.kind)) findings.push(`analysis.payload.model.quantifiers[${index}].kind is invalid`);
    if (!texts(item?.variables) || item.variables.length === 0) findings.push(`analysis.payload.model.quantifiers[${index}].variables must be non-empty strings`);
    if (!texts(item?.strategyRefs)) findings.push(`analysis.payload.model.quantifiers[${index}].strategyRefs must be strings`);
    if (item?.kind !== "exists" && Array.isArray(item?.strategyRefs) && item.strategyRefs.length > 0) {
      findings.push(`analysis.payload.model.quantifiers[${index}] may reference strategies only from an exists quantifier`);
    }
    if (!text(item?.statement)) findings.push(`analysis.payload.model.quantifiers[${index}].statement must be non-empty`);
  }
  const evaluations = entries(payload?.strategyEvaluations, "analysis.payload.strategyEvaluations", true, findings);
  for (const [index, item] of evaluations.entries()) {
    exactKeys(item, ["id", "strategyRef", "fixedAssignment", "variedEnvironment", "result", "evidenceRefs"], `analysis.payload.strategyEvaluations[${index}]`, findings);
    if (![item?.id, item?.strategyRef, item?.result].every(text)) {
      findings.push(`analysis.payload.strategyEvaluations[${index}] needs id, strategyRef, and result`);
    }
    if (!object(item?.fixedAssignment) || Object.keys(item.fixedAssignment).length === 0) {
      findings.push(`analysis.payload.strategyEvaluations[${index}].fixedAssignment must be a non-empty object`);
    } else if (Object.values(item.fixedAssignment).some((value) => value === null || !["string", "number", "boolean"].includes(typeof value))) {
      findings.push(`analysis.payload.strategyEvaluations[${index}].fixedAssignment values must be scalar`);
    }
    if (!texts(item?.variedEnvironment) || item.variedEnvironment.length === 0) {
      findings.push(`analysis.payload.strategyEvaluations[${index}].variedEnvironment must be non-empty strings`);
    }
    if (!texts(item?.evidenceRefs) || item.evidenceRefs.length === 0) {
      findings.push(`analysis.payload.strategyEvaluations[${index}].evidenceRefs must be non-empty strings`);
    }
  }
  validateDerivations(payload?.derivations, "analysis.payload.derivations", findings);
  if (!text(payload?.candidateAnswer)) findings.push("candidateAnswer must contain the current provisional answer; do not defer it");
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
    exact: new Set(["counterexample", "boundary", "quantifier-order", "control-assignment"]),
    causal: new Set(["alternate-hypothesis", "counterfactual"]),
    decision: new Set(["failure-mode", "sensitivity"]),
  };
  let branchAttack = false;
  let quantifierAudit = false;
  let controlAudit = false;
  for (const [index, item] of attacks.entries()) {
    const fields = branch === "exact" && item?.kind === "control-assignment"
      ? ["id", "targetRef", "kind", "test", "outcome", "evidence", "strategyRef", "fixedAssignment", "variedEnvironment"]
      : ["id", "targetRef", "kind", "test", "outcome", "evidence"];
    exactKeys(item, fields, `challenge.payload.attacks[${index}]`, findings);
    if (![item?.id, item?.targetRef, item?.kind, item?.test, item?.outcome, item?.evidence].every(text)) findings.push(`challenge.payload.attacks[${index}] fields must be non-empty`);
    if (requiredKinds[branch]?.has(item?.kind)) branchAttack = true;
    if (item?.kind === "quantifier-order") quantifierAudit = true;
    if (item?.kind === "control-assignment") {
      controlAudit = true;
      if (!text(item?.strategyRef)) findings.push(`challenge.payload.attacks[${index}].strategyRef must be non-empty`);
      if (!object(item?.fixedAssignment) || Object.keys(item.fixedAssignment).length === 0) {
        findings.push(`challenge.payload.attacks[${index}].fixedAssignment must be a non-empty object`);
      }
      if (!texts(item?.variedEnvironment) || item.variedEnvironment.length === 0) {
        findings.push(`challenge.payload.attacks[${index}].variedEnvironment must be non-empty strings`);
      }
    }
  }
  if (!branchAttack) findings.push(`challenge requires a ${branch}-appropriate attack`);
  if (branch === "exact" && !quantifierAudit) findings.push("exact challenge requires a quantifier-order attack");
  if (branch === "exact" && !controlAudit) findings.push("exact challenge requires a control-assignment attack");
  if (!Array.isArray(payload?.revisions)) findings.push("challenge.payload.revisions must be an array");
}

function validateCrossCheck(payload, branch, findings) {
  const fields = branch === "exact" ? ["checks", "strategySearches"] : ["checks"];
  exactKeys(payload, fields, "cross-check.payload", findings);
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
  if (branch === "exact") {
    const searches = entries(payload?.strategySearches, "cross-check.payload.strategySearches", true, findings);
    for (const [index, item] of searches.entries()) {
      exactKeys(item, ["id", "strategyRef", "method", "searchedComponents", "variedEnvironment", "bestAssignment", "objectiveValue", "replayModel", "result", "evidence"], `cross-check.payload.strategySearches[${index}]`, findings);
      if (![item?.id, item?.strategyRef, item?.method, item?.result, item?.evidence].every(text)) {
        findings.push(`cross-check.payload.strategySearches[${index}] text fields must be non-empty`);
      }
      if (!["deterministic-tool", "symbolic-solver", "exhaustive-proof"].includes(item?.method)) {
        findings.push(`cross-check.payload.strategySearches[${index}].method is invalid`);
      }
      if (!texts(item?.searchedComponents) || item.searchedComponents.length === 0) {
        findings.push(`cross-check.payload.strategySearches[${index}].searchedComponents must be non-empty strings`);
      }
      if (!texts(item?.variedEnvironment) || item.variedEnvironment.length === 0) {
        findings.push(`cross-check.payload.strategySearches[${index}].variedEnvironment must be non-empty strings`);
      }
      if (!object(item?.bestAssignment) || Object.keys(item.bestAssignment).length === 0) {
        findings.push(`cross-check.payload.strategySearches[${index}].bestAssignment must be a non-empty object`);
      } else if (Object.values(item.bestAssignment).some((value) => value === null || !["string", "number", "boolean"].includes(typeof value))) {
        findings.push(`cross-check.payload.strategySearches[${index}].bestAssignment values must be scalar`);
      }
      if (!Number.isInteger(item?.objectiveValue)) {
        findings.push(`cross-check.payload.strategySearches[${index}].objectiveValue must be an integer`);
      }
      const replay = validateReplayModel(
        item?.replayModel,
        item?.searchedComponents,
        `cross-check.payload.strategySearches[${index}].replayModel`,
        findings,
      );
      if (replay) {
        if (!Number.isFinite(replay.bestValue)) {
          findings.push(`cross-check.payload.strategySearches[${index}] replay found no guaranteeing assignment`);
        } else {
          if (item.objectiveValue !== replay.bestValue) {
            findings.push(`cross-check.payload.strategySearches[${index}].objectiveValue must equal replayed minimum ${replay.bestValue}`);
          }
          const fingerprint = JSON.stringify(Object.entries(item.bestAssignment ?? {}).sort(([left], [right]) => left.localeCompare(right)));
          const optimal = replay.bestAssignments.some((assignment) => (
            JSON.stringify(Object.entries(assignment).sort(([left], [right]) => left.localeCompare(right))) === fingerprint
          ));
          if (!optimal) {
            findings.push(`cross-check.payload.strategySearches[${index}].bestAssignment is not replay-optimal at ${replay.bestValue}`);
          }
        }
      }
    }
  }
}

function validateConclusion(payload, findings) {
  exactKeys(payload, ["conclusion", "confidence", "basisRefs", "conditions", "residualUncertainties", "outputContract"], "conclusion.payload", findings);
  if (!text(payload?.conclusion)) findings.push("conclusion.payload.conclusion must be non-empty");
  if (!CONFIDENCE.has(payload?.confidence)) findings.push("conclusion.payload.confidence must be low, medium, or high");
  if (!texts(payload?.basisRefs) || payload.basisRefs.length < 3) findings.push("conclusion.payload.basisRefs must contain at least three references");
  if (!texts(payload?.conditions)) findings.push("conclusion.payload.conditions must be strings");
  if (!texts(payload?.residualUncertainties)) findings.push("conclusion.payload.residualUncertainties must be strings");
  exactKeys(payload?.outputContract, ["mode"], "conclusion.payload.outputContract", findings);
  if (!["free-form", "exact-payload"].includes(payload?.outputContract?.mode)) {
    findings.push("conclusion.payload.outputContract.mode must be free-form or exact-payload");
  }
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

  if (value?.stage === "frame") validateFrame(value.payload, manifest?.branch, findings);
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
    "givens", "assumptions", "ambiguities", "strategyVariables", "controlAssignments", "observabilityAudit", "derivations",
    "observations", "hypotheses", "discriminatingTests", "objectives", "constraints",
    "options", "criteria", "evaluations", "attacks", "revisions", "checks", "strategySearches",
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
  for (const item of payload.strategySearches ?? []) refs.push(...(item.replayModel?.sourceRefs ?? []));
  for (const item of payload.model?.quantifiers ?? []) refs.push(...(item.strategyRefs ?? []));
  refs.push(...(payload.basisRefs ?? []));
  return refs.filter(text);
}
