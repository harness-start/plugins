import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";

const TOP_FIELDS = ["schema", "id", "epoch", "status", "recovery", "problem", "surface", "scope", "cases"];
const DIMENSIONS = ["boundary", "representation", "composition", "ordering", "error-contract", "state-transition", "concurrency", "compatibility"];
const ROLES = ["primary", "challenge", "invariant"];
const OUTCOMES = ["success", "failure"];
const STATUSES = ["open", "paused", "closed", "aborted"];
const INPUT_SHAPES = ["single", "multi-component", "variadic"];
const COMPOSITION_DEPTHS = ["single", "pairwise", "three-or-more"];
const REPAIR_MODES = ["preserve-existing-seam", "extend-existing-seam"];
const SEMANTICS = ["composition", "ordering", "representation", "error-contract", "state-transition", "concurrency"];
const ORACLE_KINDS = ["exact", "relational", "error", "compatibility"];
const ORDERING_SCENARIOS = ["independent-chains", "shared-prefix", "shared-suffix", "duplicates", "genuine-cycle"];
const V10_ORDERING_SCENARIOS = ["independent-pair", ...ORDERING_SCENARIOS];
const ORDERING_POLICIES = ["stable-topological-layers"];
const INTERACTION_MODELS = ["component-matrix", "homogeneous-neutrality", "coupled-boundary"];
const COVERAGE = [
  "primary", "public-seam", "constraint-seam", "compatibility", "boundary",
  "all-populated", "all-degenerate", "each-one-degenerate",
  "arity-zero", "arity-one", "arity-two", "arity-many",
  "ordering", "representation", "composition",
  "independent-order", "shared-order", "conflict-order",
  "alternate-representation", "error-contract", "repeated-transition",
  "composed-operation", "concurrent-interleaving",
  "homogeneous-neutrality",
  "coupled-boundary",
];

const SHAPE_COVERAGE = {
  "multi-component": ["all-populated", "all-degenerate", "each-one-degenerate"],
  variadic: ["arity-zero", "arity-one", "arity-two", "arity-many"],
};

const SEMANTIC_COVERAGE = {
  composition: ["composed-operation"],
  ordering: ["independent-order", "shared-order", "conflict-order"],
  representation: ["alternate-representation"],
  "error-contract": ["error-contract"],
  "state-transition": ["repeated-transition"],
  concurrency: ["concurrent-interleaving"],
};

function unknownFields(value, allowed, prefix, findings) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (!allowed.includes(key)) findings.push(`${prefix}unknown field: ${key}`);
}

function nonempty(value) { return typeof value === "string" && value.trim().length > 0; }

function escapePattern(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }

function sourceLines(source) {
  const lines = String(source ?? "").split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function removedBaselineLines(baselineSource, currentSource) {
  const currentCounts = new Map();
  for (const line of sourceLines(currentSource)) currentCounts.set(line, (currentCounts.get(line) ?? 0) + 1);
  const removed = [];
  for (const line of sourceLines(baselineSource)) {
    const remaining = currentCounts.get(line) ?? 0;
    if (remaining > 0) currentCounts.set(line, remaining - 1);
    else removed.push(line);
  }
  return removed;
}

function assertionOperands(assertion, form) {
  let expression = String(assertion ?? "").trim();
  if (form === "call") {
    expression = expression.replace(/;$/u, "").trim();
    const open = expression.indexOf("(");
    if (open <= 0 || !expression.endsWith(")")) return null;
    const callee = expression.slice(0, open).trim();
    const operands = splitTopLevelArguments(expression.slice(open + 1, -1));
    return operands ? { callee, operands } : null;
  }
  if (form === "sequence") {
    expression = expression.replace(/,$/u, "").trim();
    if (!expression.startsWith("(") || !expression.endsWith(")")) return null;
    const operands = splitTopLevelArguments(expression.slice(1, -1));
    return operands ? { callee: null, operands } : null;
  }
  return null;
}

function splitTopLevelArguments(value) {
  const result = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (["\"", "'", "`"].includes(character)) { quote = character; continue; }
    if (["(", "[", "{"].includes(character)) depth += 1;
    else if ([")", "]", "}"].includes(character)) depth -= 1;
    else if (character === "," && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
    if (depth < 0) return null;
  }
  if (quote || depth !== 0) return null;
  const tail = value.slice(start).trim();
  if (tail || result.length > 0) result.push(tail);
  return result;
}

function directAssignedCall(locator, binding) {
  const prefix = new RegExp(`^(?:\\s*(?:const|let|var)\\s+)?${escapePattern(binding)}\\s*=\\s*`, "u");
  const expression = String(locator ?? "").replace(prefix, "").replace(/;\s*$/u, "").trim();
  if (expression === String(locator ?? "").trim()) return null;
  const open = expression.indexOf("(");
  if (open <= 0 || !expression.endsWith(")")) return null;
  const callee = expression.slice(0, open).trim();
  if (!/^[A-Za-z_$][A-Za-z0-9_$.]*$/u.test(callee)) return null;
  const args = splitTopLevelArguments(expression.slice(open + 1, -1));
  return args ? { callee, args } : null;
}

function directCallArguments(locator) {
  const expression = String(locator ?? "").replace(/;\s*$/u, "").trim();
  const open = expression.indexOf("(");
  if (open <= 0 || !expression.endsWith(")")) return null;
  return splitTopLevelArguments(expression.slice(open + 1, -1));
}

function nonDegenerateValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" || Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return ["number", "boolean"].includes(typeof value);
}

function isStructurallyEmptyValue(value) {
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.every((item) => isStructurallyEmptyValue(item));
  return Boolean(value) && typeof value === "object" && Object.keys(value).length === 0;
}

function isCanonicalEmptyContributor(value) {
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return Boolean(value) && typeof value === "object" && Object.keys(value).length === 0;
}

function hasScalarLeaf(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.some((item) => hasScalarLeaf(item));
  if (typeof value === "object") return Object.values(value).some((item) => hasScalarLeaf(item));
  return ["number", "boolean"].includes(typeof value);
}

function validateRelationSample(value, path, findings) {
  unknownFields(value, ["value", "representation"], `${path}.`, findings);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    findings.push(`${path} must contain a JSON value and representation`);
    return;
  }
  if (!nonDegenerateValue(value.value)) findings.push(`${path}.value must be non-degenerate for a preserved peer`);
  if (!nonempty(value.representation)) findings.push(`${path}.representation must be non-empty`);
  try {
    if (JSON.stringify(value).length > 2000) findings.push(`${path} must serialize to at most 2000 characters`);
  } catch { findings.push(`${path} must be JSON-serializable`); }
}

function validateComponentSample(value, path, findings) {
  unknownFields(value, ["value", "representation"], `${path}.`, findings);
  if (!value || typeof value !== "object" || Array.isArray(value) || !("value" in value)) {
    findings.push(`${path} must contain a JSON value and representation`);
    return;
  }
  if (!nonempty(value.representation)) findings.push(`${path}.representation must be non-empty`);
  try {
    if (JSON.stringify(value).length > 2000) findings.push(`${path} must serialize to at most 2000 characters`);
  } catch { findings.push(`${path} must be JSON-serializable`); }
}

function validateNeutralityProof(value, path, afterIncludes, constraintLocator, findings) {
  const fields = [
    "kind", "marker", "populatedArgument", "degenerateArgument",
    "populatedSample", "degenerateSample", "expectedSample",
    "singleResultBinding", "leftResultBinding", "rightResultBinding",
    "singleInvocationLocator", "leftInvocationLocator", "rightInvocationLocator", "witnessLocator",
  ];
  unknownFields(value, fields, `${path}.`, findings);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    findings.push(`${path} must be a homogeneous-neutrality proof object`);
    return;
  }
  if (value.kind !== "homogeneous-neutrality") findings.push(`${path}.kind must equal homogeneous-neutrality`);
  if (!/^[A-Z][A-Z0-9_:-]{5,100}$/u.test(String(value.marker ?? ""))) findings.push(`${path}.marker must be a stable uppercase behavioral marker`);
  if (!afterIncludes?.includes(value.marker)) findings.push(`${path} marker must appear in the case AFTER includes`);

  const populated = String(value.populatedArgument ?? "");
  const degenerate = String(value.degenerateArgument ?? "");
  if (![populated, degenerate].every((argument) => /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(argument)) || populated === degenerate) {
    findings.push(`${path} populatedArgument and degenerateArgument must be distinct identifiers`);
  }
  validateRelationSample(value.populatedSample, `${path}.populatedSample`, findings);
  validateComponentSample(value.degenerateSample, `${path}.degenerateSample`, findings);
  validateRelationSample(value.expectedSample, `${path}.expectedSample`, findings);
  if (!isCanonicalEmptyContributor(value.degenerateSample?.value)) findings.push(`${path}.degenerateSample.value must be one canonical empty contributor value`);
  if (!hasScalarLeaf(value.populatedSample?.value)) findings.push(`${path}.populatedSample.value must contain at least one scalar leaf`);
  if (!hasScalarLeaf(value.expectedSample?.value)) findings.push(`${path}.expectedSample.value must contain at least one scalar leaf`);
  if (isDeepStrictEqual(value.expectedSample, value.degenerateSample)) findings.push(`${path}.expectedSample must differ from degenerateSample`);

  const bindings = [value.singleResultBinding, value.leftResultBinding, value.rightResultBinding].map(String);
  if (bindings.some((binding) => !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(binding)) || new Set(bindings).size !== 3) {
    findings.push(`${path} result bindings must be three distinct identifiers`);
  }
  const calls = [
    ["singleInvocationLocator", bindings[0], [populated]],
    ["leftInvocationLocator", bindings[1], [degenerate, populated]],
    ["rightInvocationLocator", bindings[2], [populated, degenerate]],
  ];
  const seamName = callableNameFromLocator(constraintLocator);
  for (const [field, binding, expectedArguments] of calls) {
    const call = directAssignedCall(value[field], binding);
    if (!call) findings.push(`${path}.${field} must be one direct seam call assigned to its result binding`);
    else {
      if (seamName && call.callee.split(".").at(-1) !== seamName) findings.push(`${path}.${field} must invoke the declared constraint seam`);
      if (!isDeepStrictEqual(call.args, expectedArguments)) {
        const shape = field === "singleInvocationLocator" ? "populated" : field === "leftInvocationLocator" ? "degenerate, populated" : "populated, degenerate";
        findings.push(`${path}.${field} must pass ${shape} in that exact top-level argument order`);
      }
    }
  }
  const witnessArguments = directCallArguments(value.witnessLocator);
  const markerArguments = [`"${value.marker}"`, `'${value.marker}'`];
  if (!witnessArguments || !markerArguments.includes(witnessArguments[0])
    || !isDeepStrictEqual(witnessArguments.slice(1), [populated, degenerate, ...bindings])) {
    findings.push(`${path}.witnessLocator must pass marker, populated and degenerate arguments, and the three bound results directly`);
  }
}

function validateCoupledBoundaryProof(value, path, afterIncludes, constraintLocator, components, findings) {
  const fields = [
    "kind", "marker", "componentArguments", "expectedSample", "rejectedAlternative",
    "resultBinding", "invocationLocator", "witnessLocator",
  ];
  unknownFields(value, fields, `${path}.`, findings);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    findings.push(`${path} must be a coupled-boundary proof object`);
    return;
  }
  if (value.kind !== "coupled-boundary") findings.push(`${path}.kind must equal coupled-boundary`);
  if (!/^[A-Z][A-Z0-9_:-]{5,100}$/u.test(String(value.marker ?? ""))) findings.push(`${path}.marker must be a stable uppercase behavioral marker`);
  if (!afterIncludes?.includes(value.marker)) findings.push(`${path} marker must appear in the case AFTER includes`);

  const argumentsByComponent = value.componentArguments;
  if (!argumentsByComponent || typeof argumentsByComponent !== "object" || Array.isArray(argumentsByComponent)) {
    findings.push(`${path}.componentArguments must bind every surface component`);
  } else {
    unknownFields(argumentsByComponent, components ?? [], `${path}.componentArguments.`, findings);
    for (const component of components ?? []) if (!(component in argumentsByComponent)) findings.push(`${path}.componentArguments must include ${component}`);
    const expressions = (components ?? []).map((component) => argumentsByComponent[component]);
    if (expressions.some((expression) => !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(String(expression ?? ""))) || new Set(expressions).size !== expressions.length) {
      findings.push(`${path}.componentArguments must use distinct identifiers`);
    }
  }

  validateComponentSample(value.expectedSample, `${path}.expectedSample`, findings);
  validateComponentSample(value.rejectedAlternative, `${path}.rejectedAlternative`, findings);
  if (isDeepStrictEqual(value.expectedSample, value.rejectedAlternative)) findings.push(`${path}.rejectedAlternative must differ from expectedSample`);

  const binding = String(value.resultBinding ?? "");
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(binding)) findings.push(`${path}.resultBinding must be one identifier`);
  const invocation = binding ? directAssignedCall(value.invocationLocator, binding) : null;
  if (!invocation) findings.push(`${path}.invocationLocator must be one direct seam call assigned to resultBinding`);
  else {
    const seamName = callableNameFromLocator(constraintLocator);
    if (seamName && invocation.callee.split(".").at(-1) !== seamName) findings.push(`${path}.invocationLocator must invoke the declared constraint seam`);
    for (const component of components ?? []) {
      const expression = argumentsByComponent?.[component];
      const occurrences = invocation.args.filter((argument) => argument === expression).length;
      if (!nonempty(expression) || occurrences !== 1) findings.push(`${path}.componentArguments.${component} must be one exact top-level invocation argument`);
    }
  }

  const witnessArguments = directCallArguments(value.witnessLocator);
  const markerArguments = [`"${value.marker}"`, `'${value.marker}'`];
  const expectedWitnessArguments = [...(components ?? []).map((component) => argumentsByComponent?.[component]), binding];
  if (!witnessArguments || !markerArguments.includes(witnessArguments[0])
    || !isDeepStrictEqual(witnessArguments.slice(1), expectedWitnessArguments)) {
    findings.push(`${path}.witnessLocator must pass marker, every original component argument, and resultBinding directly`);
  }
}

function hasDirectedCycle(contributors) {
  const graph = new Map();
  for (const contributor of contributors) for (let index = 0; index + 1 < contributor.length; index += 1) {
    const from = JSON.stringify(contributor[index]);
    const to = JSON.stringify(contributor[index + 1]);
    if (from === to) continue;
    if (!graph.has(from)) graph.set(from, new Set());
    graph.get(from).add(to);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) if (visit(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  }
  return [...graph.keys()].some(visit);
}

function stableTopologicalLayers(contributors) {
  const values = new Map();
  const dependencies = new Map();
  const firstSeen = [];
  const remember = (value) => {
    const key = JSON.stringify(value);
    if (!values.has(key)) {
      values.set(key, value);
      dependencies.set(key, new Set());
      firstSeen.push(key);
    }
    return key;
  };
  for (const contributor of contributors) {
    let prior = null;
    for (const value of contributor) {
      const key = remember(value);
      if (prior !== null && prior !== key) dependencies.get(key).add(prior);
      prior = key;
    }
  }
  const remaining = new Map([...dependencies].map(([key, deps]) => [key, new Set(deps)]));
  const order = [];
  while (remaining.size > 0) {
    const layer = firstSeen.filter((key) => remaining.has(key) && remaining.get(key).size === 0);
    if (layer.length === 0) return { cycle: true, order: firstSeen.map((key) => values.get(key)) };
    for (const key of layer) order.push(values.get(key));
    for (const key of layer) remaining.delete(key);
    for (const deps of remaining.values()) for (const key of layer) deps.delete(key);
  }
  return { cycle: false, order };
}

function signatureDeclaresVariadicData(signature) {
  return /(?:\.\.\.\s*[A-Za-z_$]*|(^|[^*])\*(?!\*)\s*[A-Za-z_])/u.test(String(signature ?? ""));
}

function callableNameFromLocator(locator) {
  const matches = [...String(locator ?? "").matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gu)];
  return matches.at(-1)?.[1] ?? null;
}

function isCodePosition(source, target) {
  let state = "code";
  let escaped = false;
  for (let index = 0; index < target; index += 1) {
    const character = source[index];
    const pair = source.slice(index, index + 2);
    const triple = source.slice(index, index + 3);
    if (state === "line-comment") {
      if (character === "\n") state = "code";
      continue;
    }
    if (state === "block-comment") {
      if (pair === "*/") { state = "code"; index += 1; }
      continue;
    }
    if (["single", "double", "template"].includes(state)) {
      const delimiter = state === "single" ? "'" : state === "double" ? "\"" : "`";
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === delimiter) state = "code";
      continue;
    }
    if (["triple-single", "triple-double"].includes(state)) {
      const delimiter = state === "triple-single" ? "'''" : "\"\"\"";
      if (triple === delimiter) { state = "code"; index += 2; }
      continue;
    }
    if (pair === "//") { state = "line-comment"; index += 1; continue; }
    if (pair === "/*") { state = "block-comment"; index += 1; continue; }
    if (character === "#") { state = "line-comment"; continue; }
    if (triple === "'''" || triple === "\"\"\"") {
      state = triple === "'''" ? "triple-single" : "triple-double";
      index += 2;
      continue;
    }
    if (character === "'" || character === "\"" || character === "`") {
      state = character === "'" ? "single" : character === "\"" ? "double" : "template";
    }
  }
  return state === "code";
}

function completeSignatureAt(source, openAt) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openAt; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (["\"", "'", "`"].includes(character)) { quote = character; continue; }
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openAt, index + 1);
    }
  }
  return null;
}

function sourceDeclarationsForCallable(source, callableName) {
  if (!nonempty(callableName)) return [];
  const name = escapePattern(callableName);
  const patterns = [
    new RegExp(`^[\\t ]*(?:(?:export\\s+default|export|default|async|public|private|protected|static|final|abstract|override|virtual|inline|pub)\\s+)*(?:def|function|func|fn)\\s+(?:\\([^\\n]*\\)\\s*)?${name}\\s*\\(`, "gmu"),
    new RegExp(`^[\\t ]*(?:(?:export)\\s+)?(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`, "gmu"),
  ];
  const declarations = [];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
    if (!isCodePosition(source, match.index)) continue;
    const openAt = match.index + match[0].lastIndexOf("(");
    const parameters = completeSignatureAt(source, openAt);
    if (parameters) declarations.push({
      text: `${match[0].slice(0, match[0].lastIndexOf("("))}${parameters}`,
      variadic: signatureDeclaresVariadicData(parameters),
      indent: match[0].match(/^[\t ]*/u)?.[0] ?? "",
    });
  }
  return declarations;
}

function gitBaselineBytes(repoRoot, sourcePath) {
  try {
    return execFileSync("git", ["show", `HEAD:${sourcePath}`], {
      cwd: repoRoot,
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch { return null; }
}

function gitBaselineSource(repoRoot, sourcePath) {
  const bytes = gitBaselineBytes(repoRoot, sourcePath);
  return bytes === null ? null : bytes.toString("utf8");
}

function strictUtf8(bytes) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function exactExecutableLinePositions(source, line) {
  const positions = [];
  const assertion = String(line ?? "").trimStart();
  let offset = 0;
  for (const match of String(source ?? "").matchAll(/([^\r\n]*)(\r?\n|$)/gu)) {
    if (match[1].trimStart() === assertion) {
      const codeAt = offset + (match[1].match(/^\s*/u)?.[0].length ?? 0);
      if (isCodePosition(source, codeAt)) positions.push(codeAt);
    }
    offset += match[0].length;
    if (match[0] === "") break;
  }
  return positions;
}

function executableSubstringPositions(source, locator) {
  if (!nonempty(locator)) return [];
  const positions = [];
  let cursor = 0;
  while (cursor <= source.length - locator.length) {
    const position = source.indexOf(locator, cursor);
    if (position < 0) break;
    if (isCodePosition(source, position)) positions.push(position);
    cursor = position + Math.max(locator.length, 1);
  }
  return positions;
}

function diagnosticsContainContributors(diagnostics, contributors) {
  const normalized = diagnostics.join(" ").replace(/\s+/gu, "");
  return contributors.every((contributor) => normalized.includes(JSON.stringify(contributor).replace(/\s+/gu, "")));
}

function proofDefinesWitnessCallable(proof, locator) {
  const callee = String(locator ?? "").match(/^([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*\(/u)?.[1];
  const builtins = new Set(["print", "printf", "puts", "console.log", "console.error", "process.stdout.write", "process.stderr.write", "sys.stdout.write", "sys.stderr.write"]);
  if (!callee) return false;
  if (builtins.has(callee)) return true;
  if (callee.includes(".")) return false;
  const escaped = escapePattern(callee);
  return new RegExp(`(?:^|\\n)\\s*(?:(?:export\\s+)?(?:async\\s+)?function\\s+${escaped}\\s*\\(|(?:async\\s+)?def\\s+${escaped}\\s*\\(|(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:(?:async\\s+)?function\\b|(?:async\\s*)?(?:\\([^\\n)]*\\)|[A-Za-z_$][A-Za-z0-9_$]*)\\s*=>))`, "u").test(proof);
}

function isZeroArgumentSeamThunk(expression, constraintLocator, contributorsBinding) {
  const value = String(expression ?? "").trim();
  const zeroArgument = /^(?:\(\s*\)\s*=>|lambda\s*:|->\s*(?:\(\s*\))?\s*\{)/u.test(value);
  return zeroArgument
    && value.includes(String(constraintLocator ?? ""))
    && includesToken(value, contributorsBinding);
}

function observationCallableDefinitions(source, callable) {
  if (!nonempty(callable)) return [];
  const escaped = escapePattern(callable);
  const definitions = [];
  const python = new RegExp(`^(?<indent>[ \\t]*)(?:async\\s+)?def\\s+${escaped}\\s*\\((?<parameters>[^\\n)]*)\\)\\s*:[^\\n]*$`, "gmu");
  for (const match of source.matchAll(python)) {
    if (!isCodePosition(source, match.index)) continue;
    const indent = match.groups?.indent ?? "";
    const bodyStart = match.index + match[0].length;
    let bodyEnd = source.length;
    const tail = source.slice(bodyStart);
    let offset = bodyStart;
    for (const line of tail.split(/(?<=\n)/u)) {
      const text = line.replace(/\r?\n$/u, "");
      if (text.trim() && (text.match(/^[ \\t]*/u)?.[0].length ?? 0) <= indent.length) {
        bodyEnd = offset;
        break;
      }
      offset += line.length;
    }
    definitions.push({ language: "python", parameters: match.groups?.parameters ?? "", source: source.slice(match.index, bodyEnd) });
  }
  const javascript = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${escaped}\\s*\\((?<parameters>[^\\n)]*)\\)\\s*\\{`, "gu");
  for (const match of source.matchAll(javascript)) {
    const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
    if (!isCodePosition(source, start)) continue;
    const openAt = match.index + match[0].lastIndexOf("{");
    let depth = 0;
    let quote = null;
    let escapedCharacter = false;
    let bodyEnd = -1;
    for (let index = openAt; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escapedCharacter) escapedCharacter = false;
        else if (character === "\\") escapedCharacter = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (["\"", "'", "`"].includes(character)) { quote = character; continue; }
      if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) { bodyEnd = index + 1; break; }
    }
    if (bodyEnd > openAt) definitions.push({ language: "javascript", parameters: match.groups?.parameters ?? "", source: source.slice(start, bodyEnd) });
  }
  return definitions;
}

function diagnosticProjectionFinding(definition, projection) {
  if (!definition) return "observation helper must have exactly one supported definition";
  const parameters = splitTopLevelArguments(definition.parameters) ?? [];
  if (parameters.length !== 1 || !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(parameters[0])) {
    return "observation helper must accept exactly one opaque zero-argument seam thunk";
  }
  const callback = parameters[0];
  const callbackCalls = definition.source.match(new RegExp(`${escapePattern(callback)}\\s*\\(\\s*\\)`, "gu")) ?? [];
  if (callbackCalls.length !== 1) return "observation helper must invoke its seam thunk exactly once";
  const sourceBinding = String(projection?.sourceBinding ?? "");
  if (projection?.sourceKind === "python-warning-record") {
    if (definition.language !== "python") return "python-warning-record requires a Python observation helper";
    const capture = new RegExp(`with\\s+warnings\\.catch_warnings\\(\\s*record\\s*=\\s*True\\s*\\)\\s+as\\s+${escapePattern(sourceBinding)}\\s*:`, "u");
    const captureMatch = capture.exec(definition.source);
    const resultMatch = new RegExp(`(?<result>[A-Za-z_$][A-Za-z0-9_$]*)\\s*=\\s*${escapePattern(callback)}\\s*\\(\\s*\\)`, "u").exec(definition.source);
    const result = resultMatch?.groups?.result;
    const indentationAt = (index) => {
      const lineStart = definition.source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
      return definition.source.slice(lineStart, index).match(/^[ \\t]*/u)?.[0].length ?? 0;
    };
    const callbackIsCaptured = captureMatch && resultMatch
      && resultMatch.index > captureMatch.index
      && indentationAt(resultMatch.index) > indentationAt(captureMatch.index);
    const projectionPattern = new RegExp(`["']diagnostics["']\\s*:\\s*\\[\\s*str\\(\\s*(?<item>[A-Za-z_$][A-Za-z0-9_$]*)\\.message\\s*\\)\\s+for\\s+\\k<item>\\s+in\\s+${escapePattern(sourceBinding)}\\s*\\]`, "u");
    const returnPattern = result && new RegExp(`return\\s*\\{[^\\n}]*["']order["']\\s*:\\s*${escapePattern(result)}\\s*,[^\\n}]*${projectionPattern.source}[^\\n}]*\\}`, "u");
    if (!callbackIsCaptured || !returnPattern?.test(definition.source)) {
      const resultName = result ?? "result";
      const sourceName = sourceBinding || "caught";
      return `diagnostics must be an unconditional identity projection of captured warning.message values; use exactly: return {"order": ${resultName}, "diagnostics": [str(item.message) for item in ${sourceName}]}`;
    }
    if ((definition.source.match(/\breturn\b/gu) ?? []).length !== 1
      || new RegExp(`(?:^|\\n)\\s*(?:str\\s*=|${escapePattern(sourceBinding)}\\s*=|${escapePattern(sourceBinding)}\\s*[.\\[])`, "u").test(definition.source)) {
      return "captured diagnostics source and str must not be rebound, mutated, filtered, or conditionally returned";
    }
    return null;
  }
  if (projection?.sourceKind === "seam-result-field") {
    if (definition.language !== "javascript") return "seam-result-field requires a JavaScript observation helper";
    const assigned = new RegExp(`(?:const|let|var)\\s+${escapePattern(sourceBinding)}\\s*=\\s*${escapePattern(callback)}\\s*\\(\\s*\\)\\s*;?`, "u");
    const projectionPattern = new RegExp(`${escapePattern(sourceBinding)}\\.diagnostics\\.map\\(\\s*\\(?\\s*(?<item>[A-Za-z_$][A-Za-z0-9_$]*)\\s*\\)?\\s*=>\\s*String\\(\\s*\\k<item>\\s*\\)\\s*\\)`, "u");
    const returnPattern = new RegExp(`return\\s*\\{[^}]*order\\s*:\\s*${escapePattern(sourceBinding)}\\.order\\s*,[^}]*diagnostics\\s*:\\s*${projectionPattern.source}[^}]*\\}\\s*;?`, "u");
    if (!assigned.test(definition.source) || !returnPattern.test(definition.source)) {
      return "diagnostics must be an unconditional identity projection of the same seam result diagnostics field";
    }
    const bindingAssignments = definition.source.match(new RegExp(`\\b${escapePattern(sourceBinding)}\\s*=`, "gu")) ?? [];
    const bindingMutation = new RegExp(`${escapePattern(sourceBinding)}(?:\\.[A-Za-z_$][A-Za-z0-9_$]*|\\[[^\\]]+\\])\\s*=|${escapePattern(sourceBinding)}\\.(?:push|pop|shift|unshift|splice|sort|reverse)\\s*\\(`, "u");
    if ((definition.source.match(/\breturn\b/gu) ?? []).length !== 1
      || bindingAssignments.length !== 1
      || /(?:^|\n)\s*String\s*=/u.test(definition.source)
      || bindingMutation.test(definition.source)) {
      return "seam diagnostics source and String must not be rebound, mutated, filtered, or conditionally returned";
    }
    return null;
  }
  return "diagnosticProjection.sourceKind must be python-warning-record or seam-result-field";
}

function validateOrderingScenario(scenario, path, afterIncludes, orderingPolicy, constraintLocator, requireInvocation, requireLayerDiscriminator, requireObservationBinding, findings) {
  const observationFields = requireObservationBinding ? ["contributorsBinding", "observationBinding", "diagnosticProjection"] : [];
  unknownFields(scenario, ["kind", "contributors", "expected", "marker", "witnessLocator", ...(requireInvocation ? ["invocationLocator"] : []), ...observationFields], `${path}.`, findings);
  const allowedScenarios = requireLayerDiscriminator ? V10_ORDERING_SCENARIOS : ORDERING_SCENARIOS;
  if (!allowedScenarios.includes(scenario?.kind)) findings.push(`${path}.kind must be one of: ${allowedScenarios.join(", ")}`);
  const contributors = scenario?.contributors;
  if (!Array.isArray(contributors) || contributors.length < 2 || contributors.length > 8
    || contributors.some((item) => !Array.isArray(item) || item.length === 0 || item.length > 12)) {
    findings.push(`${path}.contributors must contain between 2 and 8 non-empty sequences`);
  }
  unknownFields(scenario?.expected, ["order", "diagnostics"], `${path}.expected.`, findings);
  if (!Array.isArray(scenario?.expected?.order)) findings.push(`${path}.expected.order must be an array`);
  if (!Array.isArray(scenario?.expected?.diagnostics) || scenario.expected.diagnostics.some((item) => !nonempty(item))) findings.push(`${path}.expected.diagnostics must be an array of non-empty strings`);
  if (!/^[A-Z][A-Z0-9_:-]{5,100}$/u.test(String(scenario?.marker ?? ""))) findings.push(`${path}.marker must be a stable uppercase behavioral marker`);
  if (!afterIncludes?.includes(scenario?.marker)) findings.push(`${path} scenario marker must appear in the case AFTER includes`);
  if (!nonempty(scenario?.witnessLocator) || scenario.witnessLocator.length > 240 || !scenario.witnessLocator.includes(String(scenario?.marker ?? ""))) findings.push(`${path}.witnessLocator must contain the scenario marker`);
  if (requireInvocation && (!nonempty(scenario?.invocationLocator) || scenario.invocationLocator.length > 240
    || !scenario.invocationLocator.includes(String(constraintLocator ?? "")))) {
    findings.push(`${path}.invocationLocator must call the real constraint seam through surface.constraintLocator`);
  }
  if (requireObservationBinding) {
    const contributorsBinding = String(scenario?.contributorsBinding ?? "");
    const observationBinding = String(scenario?.observationBinding ?? "");
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(contributorsBinding)) findings.push(`${path}.contributorsBinding must be one identifier`);
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(observationBinding)) findings.push(`${path}.observationBinding must be one identifier`);
    const invocation = observationBinding ? directAssignedCall(scenario?.invocationLocator, observationBinding) : null;
    if (!invocation || !/(?:observ|captur|warn|diagnostic)/iu.test(invocation.callee)
      || !String(scenario?.invocationLocator ?? "").includes(String(constraintLocator ?? ""))
      || !String(scenario?.invocationLocator ?? "").includes(contributorsBinding)) {
      findings.push(`${path}.invocationLocator must assign one warning/diagnostic observation of the real constraint seam and contributorsBinding to observationBinding`);
    }
    if (invocation && (invocation.args.length !== 1 || !isZeroArgumentSeamThunk(invocation.args[0], constraintLocator, contributorsBinding))) {
      findings.push(`${path}.invocationLocator must pass one opaque zero-argument seam thunk to the observation helper; the helper must not receive contributors directly`);
    }
    const witnessArguments = directCallArguments(scenario?.witnessLocator);
    const orderAccesses = new Set([
      `${observationBinding}.order`,
      `${observationBinding}["order"]`,
      `${observationBinding}['order']`,
    ]);
    const diagnosticAccesses = new Set([
      `${observationBinding}.diagnostics`,
      `${observationBinding}["diagnostics"]`,
      `${observationBinding}['diagnostics']`,
    ]);
    if (witnessArguments?.length !== 4
      || !witnessArguments[0].includes(String(scenario?.marker ?? ""))
      || witnessArguments[1] !== contributorsBinding
      || !orderAccesses.has(witnessArguments[2])
      || !diagnosticAccesses.has(witnessArguments[3])) {
      findings.push(`${path}.witnessLocator must pass marker, contributorsBinding, and direct order/diagnostics fields from observationBinding; use .order/.diagnostics for objects or ["order"]/["diagnostics"] for mappings`);
    }
    const projection = scenario?.diagnosticProjection;
    if (scenario?.kind === "genuine-cycle") {
      unknownFields(projection, ["sourceKind", "sourceBinding", "valueSelector"], `${path}.diagnosticProjection.`, findings);
      if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
        findings.push(`${path}.diagnosticProjection must bind genuine-cycle diagnostics to a captured warning or seam-result field`);
      } else {
        if (!["python-warning-record", "seam-result-field"].includes(projection.sourceKind)) findings.push(`${path}.diagnosticProjection.sourceKind must be python-warning-record or seam-result-field`);
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(String(projection.sourceBinding ?? ""))) findings.push(`${path}.diagnosticProjection.sourceBinding must be one identifier`);
        const expectedSelector = projection.sourceKind === "python-warning-record" ? "message" : "self";
        if (projection.valueSelector !== expectedSelector) findings.push(`${path}.diagnosticProjection.valueSelector must equal ${expectedSelector} for ${projection.sourceKind ?? "the selected sourceKind"}`);
      }
    } else if (projection !== undefined) {
      findings.push(`${path}.diagnosticProjection is allowed only for genuine-cycle`);
    }
  }
  if (!Array.isArray(contributors) || contributors.some((item) => !Array.isArray(item) || item.length === 0)) return;
  if (scenario.kind === "independent-chains") {
    const sets = contributors.map((item) => new Set(item.map((value) => JSON.stringify(value))));
    if (sets.some((set, index) => sets.some((other, otherIndex) => index !== otherIndex && [...set].some((value) => other.has(value))))) findings.push(`${path} independent-chains requires pairwise-disjoint contributors`);
    if (requireLayerDiscriminator && contributors.some((item, index) => sets[index].size !== item.length)) findings.push(`${path} independent-chains contributors must be duplicate-free so each position is a distinct node`);
    if (requireLayerDiscriminator && (contributors.length < 3 || contributors.some((item) => item.length < 2) || !contributors.some((item) => item.length >= 3))) {
      findings.push(`${path} independent-chains requires at least three pairwise-disjoint contributors, each containing at least two items, with one containing at least three items to distinguish atomic layers from eager release`);
    }
  }
  if (scenario.kind === "independent-pair") {
    const sets = contributors.map((item) => new Set(item.map((value) => JSON.stringify(value))));
    if (contributors.length !== 2 || contributors.some((item) => item.length < 2)
      || [...sets[0]].some((value) => sets[1].has(value))) {
      findings.push(`${path} independent-pair requires exactly two pairwise-disjoint contributors with at least two items each`);
    }
    if (requireLayerDiscriminator && contributors.some((item, index) => sets[index]?.size !== item.length)) findings.push(`${path} independent-pair contributors must be duplicate-free so each position is a distinct node`);
  }
  if (scenario.kind === "shared-prefix" && !contributors.every((item) => isDeepStrictEqual(item[0], contributors[0][0]))) findings.push(`${path} shared-prefix contributors must have a common first item`);
  if (scenario.kind === "shared-suffix" && !contributors.every((item) => isDeepStrictEqual(item.at(-1), contributors[0].at(-1)))) findings.push(`${path} shared-suffix contributors must have a common last item`);
  if (scenario.kind === "duplicates") {
    const entries = contributors.flatMap((item) => item.map((value) => JSON.stringify(value)));
    if (new Set(entries).size === entries.length) findings.push(`${path} duplicates requires an item repeated within or across contributors`);
  }
  if (scenario.kind === "genuine-cycle") {
    if (!hasDirectedCycle(contributors)) findings.push(`${path} genuine-cycle contributors must contain an actual directed cycle`);
    if ((scenario?.expected?.diagnostics?.length ?? 0) === 0) findings.push(`${path} genuine-cycle requires at least one expected diagnostic`);
  } else if ((scenario?.expected?.diagnostics?.length ?? 0) > 0) findings.push(`${path} non-cycle scenarios must not expect diagnostics`);
  if (orderingPolicy === "stable-topological-layers" && Array.isArray(scenario?.expected?.order)) {
    const derived = stableTopologicalLayers(contributors);
    if (!isDeepStrictEqual(scenario.expected.order, derived.order)) {
      findings.push(`${path}.expected.order must equal the stable-topological-layers oracle: ${JSON.stringify(derived.order)}`);
    }
    if (scenario.kind === "genuine-cycle" && !diagnosticsContainContributors(scenario.expected.diagnostics ?? [], contributors)) {
      findings.push(`${path} cycle diagnostic must contain JSON.stringify output for every original contributor sequence`);
    }
  }
}

function includesToken(haystack, token) {
  if (!nonempty(haystack) || !nonempty(token)) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`, "u").test(haystack);
}

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

function validateStringSet(value, path, allowed, findings, allowedLabel = "surface.components") {
  if (!Array.isArray(value) || value.some((item) => !nonempty(item))) {
    findings.push(`${path} must be an array of non-empty strings`);
    return;
  }
  if (new Set(value).size !== value.length) findings.push(`${path} contains a duplicate value`);
  if (allowed && value.some((item) => !allowed.includes(item))) findings.push(`${path} must contain only declared ${allowedLabel}`);
}

function validateSupersededAssertions(value, findings) {
  const entries = value.scope?.supersededAssertions;
  if (!Array.isArray(entries) || entries.length > 20) {
    findings.push("scope.supersededAssertions must be an array with at most 20 exact assertion-replacement declarations");
    return;
  }
  if (entries.length === 0) {
    if (value.surface?.semantics?.includes("ordering")) {
      findings.push("v11 ordering semantics require at least one oracle-bound scope.supersededAssertions declaration; keep the project regression file unchanged and exclude that replaced expectation from surface.preserves and the compatibility invariant");
    }
    return;
  }
  const identities = new Set();
  for (const [index, entry] of entries.entries()) {
    const path = `scope.supersededAssertions[${index}]`;
    unknownFields(entry, [
      "path", "beforeAssertion", "afterAssertion", "beforeExpectedLiteral", "afterExpectedLiteral",
      "inputLiterals", "assertionForm", "expectedOperandIndex", "consumerLocator", "valueCodec", "reason", "targetCaseId", "scenarioMarker",
    ], `${path}.`, findings);
    if (!isSafeRelativePath(entry?.path) || !value.scope?.regressionPaths?.includes(entry.path)) findings.push(`${path}.path must name one scope.regressionPaths entry`);
    for (const field of ["beforeAssertion", "afterAssertion", "beforeExpectedLiteral", "afterExpectedLiteral", "reason", "targetCaseId", "scenarioMarker"]) {
      if (!nonempty(entry?.[field]) || /[\r\n]/u.test(String(entry?.[field] ?? ""))) findings.push(`${path}.${field} must be one non-empty line`);
    }
    if (entry?.valueCodec !== "json") findings.push(`${path}.valueCodec must equal json`);
    if (!["call", "sequence"].includes(entry?.assertionForm)) findings.push(`${path}.assertionForm must be one of: call, sequence`);
    if (!Number.isInteger(entry?.expectedOperandIndex) || entry.expectedOperandIndex < 0 || entry.expectedOperandIndex > 20) findings.push(`${path}.expectedOperandIndex must be an integer between 0 and 20`);
    if (entry?.assertionForm === "sequence" && (!nonempty(entry?.consumerLocator) || /[\r\n]/u.test(entry.consumerLocator))) findings.push(`${path}.consumerLocator must be one non-empty line for a sequence assertion`);
    if (entry?.assertionForm === "call" && entry?.consumerLocator !== undefined) findings.push(`${path}.consumerLocator is only valid for a sequence assertion`);
    if (String(entry?.reason ?? "").trim().length < 12 || String(entry?.reason ?? "").length > 500) findings.push(`${path}.reason must contain 12..500 characters`);
    const beforeAssertion = String(entry?.beforeAssertion ?? "");
    const afterAssertion = String(entry?.afterAssertion ?? "");
    const beforeLiteral = String(entry?.beforeExpectedLiteral ?? "");
    const afterLiteral = String(entry?.afterExpectedLiteral ?? "");
    const occurrences = beforeLiteral ? beforeAssertion.split(beforeLiteral).length - 1 : 0;
    const afterOccurrences = afterLiteral ? afterAssertion.split(afterLiteral).length - 1 : 0;
    if (occurrences !== 1 || afterOccurrences !== 1 || afterAssertion !== beforeAssertion.replace(beforeLiteral, afterLiteral)) {
      findings.push(`${path}.afterAssertion must equal beforeAssertion with a single expected literal replacement`);
    }
    let beforeValue;
    let afterValue;
    let beforeParsed = false;
    let afterParsed = false;
    try { afterValue = JSON.parse(afterLiteral); afterParsed = true; }
    catch { findings.push(`${path}.afterExpectedLiteral must be valid JSON`); }
    try { beforeValue = JSON.parse(beforeLiteral); beforeParsed = true; }
    catch { findings.push(`${path}.beforeExpectedLiteral must be valid JSON`); }
    if (beforeParsed && afterParsed && isDeepStrictEqual(beforeValue, afterValue)) {
      findings.push(`${path}.beforeExpectedLiteral must semantically differ from afterExpectedLiteral`);
    }
    const targetCase = value.cases?.find((item) => item.id === entry?.targetCaseId);
    const scenario = targetCase?.oracle?.scenarios?.find((item) => item.marker === entry?.scenarioMarker);
    if (!targetCase || !scenario) findings.push(`${path} must reference one targetCaseId/scenarioMarker ordering oracle`);
    else {
      if (!isDeepStrictEqual(afterValue, scenario.expected?.order)) findings.push(`${path}.afterExpectedLiteral must equal the referenced scenario expected.order`);
      const inputLiterals = entry?.inputLiterals;
      let inputs = null;
      if (!Array.isArray(inputLiterals) || inputLiterals.length !== scenario.contributors.length || inputLiterals.some((literal) => !nonempty(literal) || /[\r\n]/u.test(literal))) {
        findings.push(`${path}.inputLiterals must contain one JSON literal per referenced scenario contributor`);
      } else {
        try { inputs = inputLiterals.map((literal) => JSON.parse(literal)); }
        catch { findings.push(`${path}.inputLiterals must contain valid JSON`); }
      }
      if (inputs && !isDeepStrictEqual(inputs, scenario.contributors)) findings.push(`${path}.inputLiterals must equal the referenced scenario contributors`);
      let previousBefore = -1;
      let previousAfter = -1;
      let previousBeforeEnd = -1;
      let previousAfterEnd = -1;
      for (const literal of inputLiterals ?? []) {
        const beforeAt = beforeAssertion.indexOf(literal);
        const afterAt = afterAssertion.indexOf(literal);
        if (beforeAt < 0 || afterAt < 0
          || beforeAssertion.indexOf(literal, beforeAt + literal.length) >= 0
          || afterAssertion.indexOf(literal, afterAt + literal.length) >= 0
          || beforeAt <= previousBefore || afterAt <= previousAfter) {
          findings.push(`${path}.inputLiterals must each occur exactly once and in order in both assertions`);
          break;
        }
        previousBefore = beforeAt;
        previousAfter = afterAt;
        previousBeforeEnd = beforeAt + literal.length;
        previousAfterEnd = afterAt + literal.length;
      }
      const beforeExpectedAt = beforeAssertion.indexOf(beforeLiteral);
      const afterExpectedAt = afterAssertion.indexOf(afterLiteral);
      if (beforeExpectedAt < previousBeforeEnd || afterExpectedAt < previousAfterEnd) {
        findings.push(`${path} expected literal must occur after all inputLiterals in both assertions`);
      }
      const beforeOperands = assertionOperands(beforeAssertion, entry?.assertionForm);
      const afterOperands = assertionOperands(afterAssertion, entry?.assertionForm);
      const expectedIndex = entry?.expectedOperandIndex;
      if (!beforeOperands || !afterOperands || !Number.isInteger(expectedIndex)
        || expectedIndex >= beforeOperands.operands.length || expectedIndex >= afterOperands.operands.length) {
        findings.push(`${path} assertionForm and expectedOperandIndex must resolve one top-level expected operand in both assertions`);
      } else if (beforeOperands.operands[expectedIndex] !== beforeLiteral || afterOperands.operands[expectedIndex] !== afterLiteral) {
        findings.push(`${path} expected literal must equal the declared top-level expected operand in both assertions`);
      } else {
        const beforeInputs = beforeOperands.operands.filter((_, operandIndex) => operandIndex !== expectedIndex).join("\0");
        const afterInputs = afterOperands.operands.filter((_, operandIndex) => operandIndex !== expectedIndex).join("\0");
        if ((inputLiterals ?? []).some((literal) => !beforeInputs.includes(literal) || !afterInputs.includes(literal))) {
          findings.push(`${path}.inputLiterals must occur outside the expected operand in both assertions`);
        }
        const seamLocators = [value.surface?.publicLocator, value.surface?.constraintLocator].filter(nonempty);
        if (entry?.assertionForm === "call") {
          if (!/(?:^|[.$_])(?:assert|expect|equal|match|verify|check)/iu.test(beforeOperands.callee)
            || beforeOperands.callee !== afterOperands.callee) findings.push(`${path} outer assertion call must be stable and assertion-like`);
          if (!seamLocators.some((locator) => beforeInputs.includes(locator) && afterInputs.includes(locator))) {
            findings.push(`${path} one non-expected operand must invoke the declared seam locator`);
          }
          if (seamLocators.some((locator) => beforeOperands.operands[expectedIndex].includes(locator) || afterOperands.operands[expectedIndex].includes(locator))) {
            findings.push(`${path} expected operand must not invoke the declared seam locator`);
          }
        } else if (!seamLocators.some((locator) => String(entry?.consumerLocator ?? "").includes(locator))) {
          findings.push(`${path}.consumerLocator must invoke the declared public or constraint seam`);
        }
      }
    }
    const identity = `${entry?.path ?? ""}\0${beforeAssertion.trimStart()}`;
    if (identities.has(identity)) findings.push(`${path} duplicates another superseded baseline assertion`);
    identities.add(identity);
    const targetIdentity = `${entry?.path ?? ""}\0${afterAssertion.trimStart()}`;
    if (entries.slice(0, index).some((candidate) => `${candidate?.path ?? ""}\0${String(candidate?.afterAssertion ?? "").trimStart()}` === targetIdentity)) {
      findings.push(`${path} has a duplicate supersession target`);
    }
  }
}

function behavioralClaimText(value) {
  return [
    value.problem?.expected,
    value.problem?.actual,
    ...(value.problem?.successCriteria ?? []),
    ...(value.surface?.preserves ?? []),
    ...(value.cases ?? []).flatMap((item) => [
      item?.dimension,
      ...(item?.coverage ?? []),
      ...(item?.oracle?.assertions ?? []),
    ]),
  ].filter(nonempty).join("\n");
}

function hasEmptyContainerInputBoundary(value) {
  const clauses = behavioralClaimText(value).split(/\n|[.;]/u).map((clause) => clause.trim()).filter(nonempty);
  const boundaryPattern = /\b(?:empty|zero[ -]?(?:size|sized|length))\b/giu;
  const explicitInputPattern = /\b(?:input|argument|component|slot)s?\b/giu;
  const containerPattern = /\b(?:array|list|container|sequence)s?\b/giu;
  const outputContextPattern = /\b(?:return(?:s|ed|ing)?|output|result|produce(?:s|d|ing)?|yield(?:s|ed|ing)?)\b/iu;
  for (const clause of clauses) {
    const boundaries = [...clause.matchAll(boundaryPattern)];
    const explicitInputs = [...clause.matchAll(explicitInputPattern)];
    const containers = [...clause.matchAll(containerPattern)];
    for (const boundary of boundaries) {
      const boundaryPrefix = clause.slice(Math.max(0, boundary.index - 8), boundary.index);
      if (/(?:\bnon[ -]?|\bnot\s+)$/iu.test(boundaryPrefix)) continue;
      for (const role of explicitInputs) {
        const start = Math.min(boundary.index, role.index);
        const end = Math.max(boundary.index + boundary[0].length, role.index + role[0].length);
        if (end - start <= 80 && !outputContextPattern.test(clause.slice(start, end))) return true;
      }
      for (const container of containers) {
        const start = Math.min(boundary.index, container.index);
        const end = Math.max(boundary.index + boundary[0].length, container.index + container[0].length);
        const leadingContext = clause.slice(Math.max(0, boundary.index - 48), boundary.index);
        if (end - start <= 64 && !outputContextPattern.test(clause.slice(start, end))
          && !outputContextPattern.test(leadingContext)) return true;
      }
    }
  }
  return false;
}

function requiredClaimSemantics(value) {
  const claims = behavioralClaimText(value);
  const required = [];
  if (/\b(?:order|ordered|ordering|sequence|dependency|dependencies|topological|precedence)\b/iu.test(claims)) required.push("ordering");
  if (/\b(?:representation|container|tuple|deduplicate|deduplication)\b|\b(?:array|list)\s+shape\b|\bshape\s+matches\b|\b(?:return(?:s|ed|ing)?|produce(?:s|d|ing)?|yield(?:s|ed|ing)?)\b[^\n]{0,40}\b(?:array|list|tuple|container)\b/iu.test(claims)) required.push("representation");
  return required;
}

function hasSplitDataForm(value) {
  return Array.isArray(value.surface?.callForms)
    && value.surface.callForms.some((form) => (form?.dataComponents?.length ?? 0) >= 2);
}

export function validateContract(value) {
  const findings = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, findings: ["contract must be a JSON object"] };
  unknownFields(value, TOP_FIELDS, "", findings);
  const v11 = value.schema === "behavioral-regression/v11";
  const v10 = v11 || value.schema === "behavioral-regression/v10";
  const v9 = v10 || value.schema === "behavioral-regression/v9";
  const v8 = v9 || value.schema === "behavioral-regression/v8";
  const v7 = v8 || value.schema === "behavioral-regression/v7";
  const v6 = v7 || value.schema === "behavioral-regression/v6";
  const callFormBound = v6 || value.schema === "behavioral-regression/v5";
  const evidenceBound = callFormBound || value.schema === "behavioral-regression/v4";
  if (!evidenceBound && value.schema !== "behavioral-regression/v3") findings.push("schema must equal behavioral-regression/v3 through behavioral-regression/v11");
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

  unknownFields(value.surface, ["publicSeam", "publicLocator", "constraintSeam", "constraintLocator", "callForms", "inputShape", "components", "compositionDepth", "repairMode", "semantics", "preserves", ...(v7 ? ["constraintSourcePath"] : []), ...(v9 ? ["orderingPolicy"] : []), ...(v10 ? ["interactionModel"] : [])], "surface.", findings);
  if (!nonempty(value.surface?.publicSeam)) findings.push("surface.publicSeam must identify the externally observable entry point under repair");
  if (!nonempty(value.surface?.constraintSeam)) findings.push("surface.constraintSeam must identify the pre-existing operation that turns inputs into output constraints");
  if (!INPUT_SHAPES.includes(value.surface?.inputShape)) findings.push(`surface.inputShape must be one of: ${INPUT_SHAPES.join(", ")}`);
  if (!COMPOSITION_DEPTHS.includes(value.surface?.compositionDepth)) findings.push(`surface.compositionDepth must be one of: ${COMPOSITION_DEPTHS.join(", ")}`);
  if (!Array.isArray(value.surface?.semantics) || value.surface.semantics.some((item) => !SEMANTICS.includes(item))) findings.push(`surface.semantics must contain only: ${SEMANTICS.join(", ")}`);
  else if (new Set(value.surface.semantics).size !== value.surface.semantics.length) findings.push("surface.semantics contains a duplicate trait");
  if (v10 && Array.isArray(value.surface?.semantics)) {
    for (const semantic of requiredClaimSemantics(value)) {
      if (!value.surface.semantics.includes(semantic)) findings.push(`behavioral claims require surface.semantics to include ${semantic}`);
    }
  }
  if (!Array.isArray(value.surface?.preserves) || value.surface.preserves.length === 0 || value.surface.preserves.length > 12 || value.surface.preserves.some((item) => !nonempty(item))) findings.push("surface.preserves must contain between 1 and 12 non-empty compatibility obligations");
  if (v9 && value.surface?.semantics?.includes("ordering")) {
    if (!ORDERING_POLICIES.includes(value.surface?.orderingPolicy)) findings.push(`surface.orderingPolicy must be one of: ${ORDERING_POLICIES.join(", ")}`);
  } else if (v9 && value.surface?.orderingPolicy !== undefined) findings.push("surface.orderingPolicy is only valid for ordering semantics");
  const homogeneousNeutrality = v10 && value.surface?.interactionModel === "homogeneous-neutrality";
  const coupledBoundary = v10 && value.surface?.interactionModel === "coupled-boundary";
  if (v10 && value.surface?.interactionModel !== undefined && !INTERACTION_MODELS.includes(value.surface.interactionModel)) {
    findings.push(`surface.interactionModel must be one of: ${INTERACTION_MODELS.join(", ")}`);
  }
  if (homogeneousNeutrality && (value.surface?.inputShape !== "variadic" || !value.surface?.semantics?.includes("representation"))) {
    findings.push("surface.interactionModel homogeneous-neutrality is only valid for a variadic representation seam");
  }
  if (coupledBoundary && (!["multi-component", "variadic"].includes(value.surface?.inputShape)
    || !value.surface?.semantics?.includes("representation"))) {
    findings.push("surface.interactionModel coupled-boundary is only valid for a multi-component or variadic representation seam");
  }
  if (evidenceBound) {
    if (!nonempty(value.surface?.publicLocator) || value.surface.publicLocator.length > 120) findings.push("surface.publicLocator must be a non-empty source-level invocation fragment of at most 120 characters");
    if (!nonempty(value.surface?.constraintLocator) || value.surface.constraintLocator.length > 120) findings.push("surface.constraintLocator must be a non-empty source-level invocation fragment of at most 120 characters");
    validateStringSet(value.surface?.components, "surface.components", null, findings);
    const variadicInteraction = v9 && value.surface?.inputShape === "variadic"
      && value.surface?.semantics?.includes("representation") && (v10 || hasSplitDataForm(value)) && !homogeneousNeutrality;
    if (value.surface?.inputShape === "multi-component" || variadicInteraction) {
      if (!Array.isArray(value.surface?.components) || value.surface.components.length < 2 || value.surface.components.length > 8) findings.push("surface.components must name between 2 and 8 components for multi-component input");
    } else if (Array.isArray(value.surface?.components) && value.surface.components.length !== 0) findings.push("surface.components must be empty unless inputShape is multi-component or a v9 variadic representation seam");
    if (!REPAIR_MODES.includes(value.surface?.repairMode)) findings.push(`surface.repairMode must be one of: ${REPAIR_MODES.join(", ")}`);
    if (value.surface?.compositionDepth === "three-or-more" && value.surface?.repairMode !== "extend-existing-seam") findings.push("three-or-more composition requires surface.repairMode extend-existing-seam");
  }
  if (callFormBound) {
    if (!Array.isArray(value.surface?.callForms) || value.surface.callForms.length === 0 || value.surface.callForms.length > 12) findings.push("surface.callForms must contain between 1 and 12 supported invocation forms");
    else {
      for (const [index, form] of value.surface.callForms.entries()) {
        const path = `surface.callForms[${index}]`;
        unknownFields(form, ["seam", "name", "locator", "dataComponents", "controlInputs", "variadic", ...(v9 ? ["sourcePath", "signatureLocator"] : [])], `${path}.`, findings);
        if (!["public", "constraint"].includes(form?.seam)) findings.push(`${path}.seam must be public or constraint`);
        if (!nonempty(form?.name)) findings.push(`${path}.name must identify the supported call form`);
        if (!nonempty(form?.locator) || form.locator.length > 120) findings.push(`${path}.locator must be a non-empty source invocation fragment of at most 120 characters`);
        validateStringSet(form?.dataComponents, `${path}.dataComponents`, null, findings);
        if (!Array.isArray(form?.dataComponents) || form.dataComponents.length === 0 || form.dataComponents.length > 8) findings.push(`${path}.dataComponents must name between 1 and 8 independently mutable data inputs`);
        validateStringSet(form?.controlInputs, `${path}.controlInputs`, null, findings);
        if (Array.isArray(form?.dataComponents) && Array.isArray(form?.controlInputs) && form.dataComponents.some((name) => form.controlInputs.includes(name))) findings.push(`${path} dataComponents and controlInputs must be disjoint`);
        if (typeof form?.variadic !== "boolean") findings.push(`${path}.variadic must be boolean`);
        if (v9) {
          if (!isSafeRelativePath(form?.sourcePath) || !value.scope?.productionPaths?.includes(form.sourcePath)) findings.push(`${path}.sourcePath must name a declared production path`);
          if (!nonempty(form?.signatureLocator) || form.signatureLocator.length > 240) findings.push(`${path}.signatureLocator must bind the production source signature`);
          const callableName = callableNameFromLocator(form?.locator);
          if (callableName && nonempty(form?.signatureLocator) && !includesToken(form.signatureLocator, callableName)) findings.push(`${path}.signatureLocator must name ${callableName}, the same callable as locator`);
          if (signatureDeclaresVariadicData(form?.signatureLocator) && form?.variadic !== true) findings.push(`${path}.signatureLocator declares a variadic source signature, so variadic must be true`);
        }
        const expectedLocator = form?.seam === "public" ? value.surface?.publicLocator : value.surface?.constraintLocator;
        if (nonempty(form?.locator) && nonempty(expectedLocator) && form.locator !== expectedLocator) findings.push(`${path}.locator must equal the declared ${form.seam}Locator`);
      }
      for (const seam of ["public", "constraint"]) if (!value.surface.callForms.some((form) => form.seam === seam)) findings.push(`surface.callForms must enumerate at least one ${seam} invocation`);
      if (v10 && value.surface?.repairMode === "extend-existing-seam") {
        const formsByCallable = new Map();
        for (const form of value.surface.callForms) {
          const key = `${form.sourcePath ?? ""}:${callableNameFromLocator(form.locator) ?? form.locator ?? ""}`;
          if (!formsByCallable.has(key)) formsByCallable.set(key, []);
          formsByCallable.get(key).push(form);
        }
        for (const forms of formsByCallable.values()) {
          if (forms.some((form) => form.variadic === true) && forms.some((form) => form.variadic !== true)) {
            findings.push("all call forms for the same callable must declare variadic true when extend-existing-seam targets a variadic signature");
          }
        }
      }
      const derivedShape = value.surface.callForms.some((form) => form.variadic)
        ? "variadic"
        : value.surface.callForms.some((form) => (form.dataComponents?.length ?? 0) >= 2) ? "multi-component" : "single";
      if (value.surface?.inputShape !== derivedShape) findings.push(`surface.inputShape must be ${derivedShape} as derived from surface.callForms`);
      if (derivedShape === "multi-component" || (v9 && derivedShape === "variadic"
        && value.surface?.semantics?.includes("representation") && (v10 || hasSplitDataForm(value)) && !homogeneousNeutrality)) {
        const matchesComponents = value.surface.callForms.some((form) => form.dataComponents?.length === value.surface?.components?.length
          && form.dataComponents.every((name) => value.surface.components.includes(name)));
        if (!matchesComponents) findings.push("surface.components must equal the dataComponents of at least one multi-component call form");
      }
    }
    if (v7) {
      if (!isSafeRelativePath(value.surface?.constraintSourcePath)
        || !value.scope?.productionPaths?.includes(value.surface.constraintSourcePath)) {
        findings.push("surface.constraintSourcePath must name one declared production path containing the pre-existing constraint operation");
      }
      if (value.surface?.compositionDepth === "three-or-more" && !String(value.surface?.constraintLocator ?? "").includes("(")) {
        findings.push("three-or-more composition requires constraintLocator to be callable and end at the pre-existing constraint-forming operation");
      }
    }
  }

  unknownFields(value.scope, ["productionPaths", "verificationPaths", ...(v9 ? ["regressionPaths"] : []), ...(v11 ? ["supersededAssertions"] : [])], "scope.", findings);
  for (const key of ["productionPaths", "verificationPaths"]) {
    const paths = value.scope?.[key];
    if (!Array.isArray(paths) || paths.length === 0) findings.push(`scope.${key} must contain at least one path`);
    else {
      if (paths.length > 20) findings.push(`scope.${key} may contain at most 20 paths`);
      if (paths.some((item) => !isSafeRelativePath(item))) findings.push(`scope.${key} entries must be workspace-relative POSIX paths without traversal`);
      if (new Set(paths).size !== paths.length) findings.push(`scope.${key} contains a duplicate path`);
    }
  }
  if (v9) {
    const paths = value.scope?.regressionPaths;
    if (!Array.isArray(paths) || paths.length === 0) findings.push("scope.regressionPaths must contain at least one tracked project test");
    else {
      if (paths.length > 20) findings.push("scope.regressionPaths may contain at most 20 paths");
      if (paths.some((item) => !isSafeRelativePath(item) || item.startsWith(".behavioral-regression/"))) findings.push("scope.regressionPaths entries must be project test paths outside isolated probes");
      if (new Set(paths).size !== paths.length) findings.push("scope.regressionPaths contains a duplicate path");
    }
  }
  if (v11) validateSupersededAssertions(value, findings);

  if (!Array.isArray(value.cases) || value.cases.length < 4 || value.cases.length > 20) findings.push("cases must contain between 4 and 20 cases");
  if (v9 && Array.isArray(value.cases) && value.cases.length !== 4) findings.push("v9 requires exactly four cases");
  if (Array.isArray(value.cases)) {
    const ids = new Set();
    for (const [index, item] of value.cases.entries()) {
      const path = `cases[${index}]`;
      unknownFields(item, ["id", "role", "dimension", "coverage", "proofPath", "oracle", "degenerateComponents", "preservedComponents", ...(v8 ? ["componentSamples"] : []), ...(v9 ? ["protectedPaths"] : []), "cwd", "command", "before", "after", "receipts"], `${path}.`, findings);
      if (!/^BR-C[1-9][0-9]*$/u.test(String(item?.id ?? ""))) findings.push(`${path}.id must match BR-CN`);
      if (ids.has(item?.id)) findings.push(`${path}.id is duplicate`);
      ids.add(item?.id);
      if (!ROLES.includes(item?.role)) findings.push(`${path}.role must be one of: ${ROLES.join(", ")}`);
      if (!DIMENSIONS.includes(item?.dimension)) findings.push(`${path}.dimension must be one of: ${DIMENSIONS.join(", ")}`);
      if (!Array.isArray(item?.coverage) || item.coverage.length === 0 || item.coverage.some((token) => !COVERAGE.includes(token))) findings.push(`${path}.coverage must contain only known behavioral coverage tokens`);
      else if (new Set(item.coverage).size !== item.coverage.length) findings.push(`${path}.coverage contains a duplicate token`);
      if (item?.cwd !== "." && !isSafeRelativePath(item?.cwd)) findings.push(`${path}.cwd must be . or a workspace-relative POSIX path`);
      if (!isDirectCommand(item?.command)) findings.push(`${path}.command must be a direct command without newlines, pipes, redirects, connectors, backticks, or command substitution`);
      if (evidenceBound) {
        if (!isSafeRelativePath(item?.proofPath) || !value.scope?.verificationPaths?.includes(item.proofPath)) findings.push(`${path}.proofPath must name one declared scope.verificationPaths file`);
        unknownFields(item?.oracle, ["kind", "assertions", "relations", ...(v8 ? ["scenarios"] : []), ...(v10 ? ["neutrality", "coupledBoundary"] : [])], `${path}.oracle.`, findings);
        if (!ORACLE_KINDS.includes(item?.oracle?.kind)) findings.push(`${path}.oracle.kind must be one of: ${ORACLE_KINDS.join(", ")}`);
        if (!Array.isArray(item?.oracle?.assertions) || item.oracle.assertions.length === 0 || item.oracle.assertions.length > 8 || item.oracle.assertions.some((assertion) => !nonempty(assertion))) findings.push(`${path}.oracle.assertions must contain between 1 and 8 observable assertions`);
        if (item?.role === "invariant" && item?.oracle?.assertions?.every((assertion) => /\b(?:test|tests|suite)\b.*\b(?:green|pass(?:es|ed)?|ok)\b/iu.test(assertion))) {
          findings.push(`${path} invariant must state preserved observable behavior, not only test status`);
        }
        const interactionBound = value.surface?.inputShape === "multi-component"
          || (v9 && value.surface?.inputShape === "variadic"
            && value.surface?.semantics?.includes("representation") && (v10 || hasSplitDataForm(value)) && !homogeneousNeutrality);
        if (!v9 || interactionBound || item?.degenerateComponents !== undefined) {
          validateStringSet(item?.degenerateComponents, `${path}.degenerateComponents`, value.surface?.components ?? [], findings);
        }
        if (!v9 || interactionBound || item?.preservedComponents !== undefined) {
          validateStringSet(item?.preservedComponents, `${path}.preservedComponents`, value.surface?.components ?? [], findings);
        }
        if (v8 && interactionBound) {
          const samples = item?.componentSamples;
          if (!samples || typeof samples !== "object" || Array.isArray(samples)) findings.push(`${path}.componentSamples must bind every surface component`);
          else {
            unknownFields(samples, value.surface.components, `${path}.componentSamples.`, findings);
            for (const component of value.surface.components) {
              if (!(component in samples)) findings.push(`${path}.componentSamples must include ${component}`);
              else validateComponentSample(samples[component], `${path}.componentSamples.${component}`, findings);
            }
          }
        }
        if (!interactionBound && ((item?.degenerateComponents?.length ?? 0) > 0 || (item?.preservedComponents?.length ?? 0) > 0)) findings.push(`${path} component relations require a multi-component interaction surface`);
        if (v9 && (item?.protectedPaths !== undefined || item?.role === "invariant")) {
          validateStringSet(item?.protectedPaths, `${path}.protectedPaths`, value.scope?.regressionPaths ?? [], findings, "scope.regressionPaths");
        }
        if (callFormBound && !String(item?.proofPath ?? "").startsWith(`.behavioral-regression/${value.id}/`)) findings.push(`${path}.proofPath must be isolated under .behavioral-regression/<contract id>/`);
        if (v6) {
          if (v10 && item?.oracle?.neutrality !== undefined) validateNeutralityProof(
            item.oracle.neutrality,
            `${path}.oracle.neutrality`,
            item?.after?.includes,
            value.surface?.constraintLocator,
            findings,
          );
          if (v10 && item?.oracle?.coupledBoundary !== undefined) validateCoupledBoundaryProof(
            item.oracle.coupledBoundary,
            `${path}.oracle.coupledBoundary`,
            item?.after?.includes,
            value.surface?.constraintLocator,
            value.surface?.components,
            findings,
          );
          const relations = item?.oracle?.relations;
          if (item?.oracle?.kind === "relational" && !Array.isArray(relations)) findings.push(`${path}.oracle.relations must be an array for a relational oracle`);
          else if (relations !== undefined && !Array.isArray(relations)) findings.push(`${path}.oracle.relations must be an array when present`);
          else for (const [relationIndex, relation] of (relations ?? []).entries()) {
            const relationPath = `${path}.oracle.relations[${relationIndex}]`;
            unknownFields(relation, ["sourceComponent", "targetObservation", "kind", "marker", ...(v7 ? ["sourceSample", "targetSample", "witnessLocator"] : []), ...(v10 ? ["resultBinding", "componentArguments", "invocationLocator"] : [])], `${relationPath}.`, findings);
            if (!value.surface?.components?.includes(relation?.sourceComponent)) findings.push(`${relationPath}.sourceComponent must name a declared surface component`);
            if (!item?.preservedComponents?.includes(relation?.sourceComponent)) findings.push(`${relationPath}.sourceComponent must name a preserved peer for this case`);
            if (!nonempty(relation?.targetObservation)) findings.push(`${relationPath}.targetObservation must identify the observed output component`);
            if (relation?.kind !== "value-and-representation") findings.push(`${relationPath}.kind must equal value-and-representation`);
            if (!/^[A-Z][A-Z0-9_:-]{5,100}$/u.test(String(relation?.marker ?? ""))) findings.push(`${relationPath}.marker must be a stable uppercase behavioral marker`);
            if (!item?.after?.includes?.includes(relation?.marker)) findings.push(`${relationPath} relation marker must appear in the case AFTER includes`);
            if (v7) {
              validateRelationSample(relation?.sourceSample, `${relationPath}.sourceSample`, findings);
              validateRelationSample(relation?.targetSample, `${relationPath}.targetSample`, findings);
              if (!nonempty(relation?.witnessLocator) || relation.witnessLocator.length > 240
                || !relation.witnessLocator.includes(String(relation?.marker ?? ""))
                || (!v10 && !includesToken(relation.witnessLocator, relation?.sourceComponent))
                || !relation.witnessLocator.includes(String(relation?.targetObservation ?? ""))) {
                findings.push(`${relationPath}.witnessLocator must directly contain the marker, sourceComponent token, and targetObservation`);
              }
            }
            if (v10) {
              if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(String(relation?.resultBinding ?? ""))) findings.push(`${relationPath}.resultBinding must be one identifier`);
              if (!nonempty(relation?.invocationLocator) || relation.invocationLocator.length > 240
                || (!relation.invocationLocator.includes(String(value.surface?.publicLocator ?? ""))
                  && !relation.invocationLocator.includes(String(value.surface?.constraintLocator ?? "")))) {
                findings.push(`${relationPath}.invocationLocator must assign the direct public or constraint seam invocation`);
              }
              const binding = String(relation?.resultBinding ?? "");
              const invocation = binding ? directAssignedCall(relation?.invocationLocator, binding) : null;
              if (binding && !invocation) findings.push(`${relationPath}.invocationLocator must be one direct call assigned to resultBinding`);
              const targetPattern = binding
                ? new RegExp(`^${escapePattern(binding)}(?:\\.[A-Za-z_$][A-Za-z0-9_$]*|\\[(?:[0-9]+|["'][^"']+["'])\\])$`, "u")
                : null;
              if (targetPattern && !targetPattern.test(String(relation?.targetObservation ?? ""))) findings.push(`${relationPath}.targetObservation for a preserved peer must select one complete output component with one direct property or index selector on resultBinding, not nested metadata`);
              const argumentsByComponent = relation?.componentArguments;
              if (!argumentsByComponent || typeof argumentsByComponent !== "object" || Array.isArray(argumentsByComponent)) findings.push(`${relationPath}.componentArguments must bind every surface component to its invocation expression`);
              else {
                unknownFields(argumentsByComponent, value.surface?.components ?? [], `${relationPath}.componentArguments.`, findings);
                const expressions = (value.surface?.components ?? []).map((component) => argumentsByComponent[component]);
                if (expressions.some((expression) => !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(String(expression ?? ""))) || new Set(expressions).size !== expressions.length) {
                  findings.push(`${relationPath}.componentArguments must use distinct identifiers`);
                }
                for (const component of value.surface?.components ?? []) {
                  const expression = argumentsByComponent[component];
                  const occurrences = invocation?.args.filter((argument) => argument === expression).length ?? 0;
                  if (!nonempty(expression) || expression.length > 120 || occurrences !== 1) findings.push(`${relationPath}.componentArguments.${component} must be one exact top-level invocation argument`);
                }
                const sourceExpression = argumentsByComponent[relation?.sourceComponent];
                const witnessArguments = directCallArguments(relation?.witnessLocator);
                if (!sourceExpression || witnessArguments?.[1] !== sourceExpression) findings.push(`${relationPath}.witnessLocator must pass the original invocation argument for sourceComponent`);
              }
            }
          }
          if (v8 && item?.oracle?.scenarios !== undefined) {
            if (!Array.isArray(item.oracle.scenarios)) findings.push(`${path}.oracle.scenarios must be an array when present`);
            else for (const [scenarioIndex, scenario] of item.oracle.scenarios.entries()) validateOrderingScenario(
              scenario,
              `${path}.oracle.scenarios[${scenarioIndex}]`,
              item?.after?.includes,
              value.surface?.orderingPolicy,
              value.surface?.constraintLocator,
              v9,
              v10,
              v11,
              findings,
            );
          }
        }
      }
      validateExpectation(item?.before, `${path}.before`, findings);
      validateExpectation(item?.after, `${path}.after`, findings);
      unknownFields(item?.receipts, ["before", "after"], `${path}.receipts.`, findings);
      if (!v9 || item?.receipts !== undefined) {
        for (const phase of ["before", "after"]) if (item?.receipts?.[phase] !== null && !(typeof item?.receipts?.[phase] === "string" && /^BR-R[1-9][0-9]*$/u.test(item.receipts[phase]))) findings.push(`${path}.receipts.${phase} must be null or one scalar BR-RN string`);
      }
    }
    const counts = Object.fromEntries(ROLES.map((role) => [role, value.cases.filter((item) => item.role === role).length]));
    if (counts.primary < 1) findings.push("cases require at least one primary case");
    if (counts.challenge < 2) findings.push("cases require at least two challenge cases");
    if (counts.invariant < 1) findings.push("cases require at least one invariant case");
    const challengeDimensions = new Set(value.cases.filter((item) => item.role === "challenge").map((item) => item.dimension));
    if (challengeDimensions.size < 2) findings.push("challenge cases must use at least two distinct dimensions");
    if (!value.cases.some((item) => item.role === "primary" && item.before?.outcome === "failure" && item.after?.outcome === "success")) findings.push("at least one primary case must transition from failure BEFORE to success AFTER");
    const declaredCoverage = new Set(value.cases.flatMap((item) => Array.isArray(item?.coverage) ? item.coverage : []));
    const requiredCoverage = ["primary", "public-seam", "constraint-seam", "compatibility"];
    const shapeCoverage = SHAPE_COVERAGE[value.surface?.inputShape] ?? [];
    requiredCoverage.push(...(coupledBoundary ? shapeCoverage.filter((token) => token !== "each-one-degenerate") : shapeCoverage));
    if (value.surface?.compositionDepth === "three-or-more") requiredCoverage.push(...SHAPE_COVERAGE.variadic);
    for (const semantic of value.surface?.semantics ?? []) requiredCoverage.push(...SEMANTIC_COVERAGE[semantic]);
    for (const token of new Set(requiredCoverage)) if (!declaredCoverage.has(token)) findings.push(`cases coverage must include ${token}`);
    if (v8 && value.surface?.semantics?.includes("ordering")) {
      const kinds = new Set(value.cases.flatMap((item) => item.oracle?.scenarios ?? []).map((scenario) => scenario.kind));
      const requiredScenarios = v10 ? V10_ORDERING_SCENARIOS : ORDERING_SCENARIOS;
      const missing = requiredScenarios.filter((kind) => !kinds.has(kind));
      if (missing.length > 0) findings.push(`ordering scenarios must include ${missing.join(", ")}`);
    }
    if (v9) {
      const invariants = value.cases.filter((item) => item.role === "invariant" && item.coverage?.includes("compatibility")
        && item.before?.outcome === "success" && item.after?.outcome === "success" && item.protectedPaths?.length > 0);
      if (invariants.length === 0) findings.push("v9 requires a compatibility invariant with protectedPaths and success before/after");
      for (const path of value.scope?.regressionPaths ?? []) if (!invariants.some((item) => item.protectedPaths.includes(path))) findings.push(`regressionPath ${path} must be exercised by a compatibility invariant protectedPaths`);
      const isolatedCases = value.cases.filter((item) => (item.protectedPaths?.length ?? 0) === 0);
      const isolatedProofPaths = new Set(isolatedCases.map((item) => item.proofPath));
      const isolatedCommands = new Set(isolatedCases.map((item) => normalizeCommand(item.command)));
      if (isolatedProofPaths.size !== 1 || isolatedCommands.size !== 1 || value.scope?.verificationPaths?.length !== 1
        || !value.scope.verificationPaths.includes(isolatedCases[0]?.proofPath)) {
        findings.push("v9 primary and challenge cases must use one shared isolated proof bundle and direct command");
      }
    }
    if (evidenceBound && value.surface?.compositionDepth === "three-or-more") {
      const directManyTransition = value.cases.some((item) => item.coverage?.includes("constraint-seam")
        && item.coverage.includes("arity-many")
        && item.before?.outcome === "failure"
        && item.after?.outcome === "success");
      if (!directManyTransition) findings.push("three-or-more composition requires a constraint-seam arity-many case that transitions from failure BEFORE to success AFTER");
    }
    if (homogeneousNeutrality) {
      const proofs = value.cases.filter((item) => item.oracle?.neutrality !== undefined);
      if (proofs.length !== 1 || !proofs[0]?.coverage?.includes("homogeneous-neutrality")) {
        findings.push("surface.interactionModel homogeneous-neutrality requires exactly one case with homogeneous-neutrality coverage and a neutrality proof");
      }
      if (value.surface?.components?.length !== 0) findings.push("surface.components must be empty for homogeneous-neutrality");
    }
    if (coupledBoundary) {
      const proofs = value.cases.filter((item) => item.oracle?.coupledBoundary !== undefined);
      if (proofs.length !== 1 || !proofs[0]?.coverage?.includes("coupled-boundary")) {
        findings.push("surface.interactionModel coupled-boundary requires exactly one case with coupled-boundary coverage and a coupledBoundary proof");
      }
      if (proofs.length === 1 && !proofs[0].coverage?.includes("boundary")) findings.push("surface.interactionModel coupled-boundary proof requires boundary coverage");
      if (value.cases.some((item) => item.coverage?.includes("each-one-degenerate"))) findings.push("surface.interactionModel coupled-boundary cannot claim each-one-degenerate peer preservation");
    }
    const interactionBound = value.surface?.inputShape === "multi-component"
      || (v9 && value.surface?.inputShape === "variadic"
        && value.surface?.semantics?.includes("representation") && (v10 || hasSplitDataForm(value)) && !homogeneousNeutrality);
    if (evidenceBound && interactionBound && Array.isArray(value.surface?.components)) {
      const components = value.surface.components;
      const emptyContainerBoundary = v10 && value.surface?.semantics?.includes("representation")
        && hasEmptyContainerInputBoundary(value);
      const allPopulated = value.cases.some((item) => item.coverage?.includes("all-populated") && item.degenerateComponents?.length === 0);
      if (!allPopulated) findings.push("all-populated coverage must bind a case with no degenerateComponents");
      const allDegenerate = value.cases.some((item) => item.coverage?.includes("all-degenerate")
        && components.every((component) => item.degenerateComponents?.includes(component))
        && item.degenerateComponents?.length === components.length
        && item.preservedComponents?.length === 0);
      if (!allDegenerate) findings.push("all-degenerate coverage must bind one case with every surface component degenerate");
      const canonicalDegenerate = v8 ? value.cases.find((item) => item.coverage?.includes("all-degenerate")
        && components.every((component) => item.degenerateComponents?.includes(component))
        && item.degenerateComponents?.length === components.length) : null;
      if (emptyContainerBoundary && canonicalDegenerate) {
        for (const component of components) {
          if (!isStructurallyEmptyValue(canonicalDegenerate.componentSamples?.[component]?.value)) {
            findings.push(`canonical degenerate sample for ${component} must be structurally empty for the declared empty-container input boundary`);
          }
        }
      }
      if (!coupledBoundary) for (const component of components) {
        const peers = components.filter((candidate) => candidate !== component);
        const relation = value.cases.find((item) => item.coverage?.includes("each-one-degenerate")
          && item.oracle?.kind === "relational"
          && item.degenerateComponents?.length === 1
          && item.degenerateComponents[0] === component
          && peers.every((peer) => item.preservedComponents?.includes(peer))
          && item.preservedComponents?.length === peers.length);
        if (!relation) findings.push(`each-one-degenerate must bind a separate relational case with only ${component} degenerate and preserve peers ${peers.join(", ")}`);
        if (v6 && relation) for (const peer of peers) {
          const identity = relation.oracle?.relations?.find((item) => item.sourceComponent === peer && item.kind === "value-and-representation");
          if (!identity) findings.push(`each-one-degenerate preserved peer ${peer} requires a value-and-representation relation`);
          if (v8 && identity && !isDeepStrictEqual(identity.sourceSample, relation.componentSamples?.[peer])) findings.push(`each-one-degenerate relation sourceSample must equal componentSamples for preserved peer ${peer}`);
          if (emptyContainerBoundary && identity && isStructurallyEmptyValue(relation.componentSamples?.[peer]?.value)) {
            findings.push(`each-one-degenerate preserved peer ${peer} must contain a structurally populated value for the declared empty-container input boundary`);
          }
        }
        if (v8 && relation && canonicalDegenerate) {
          if (!isDeepStrictEqual(relation.componentSamples?.[component], canonicalDegenerate.componentSamples?.[component])) findings.push(`each-one-degenerate sample for ${component} must equal its all-degenerate sample`);
          for (const peer of peers) if (isDeepStrictEqual(relation.componentSamples?.[peer], canonicalDegenerate.componentSamples?.[peer])) findings.push(`each-one-degenerate preserved peer ${peer} must differ from its all-degenerate sample`);
        }
      }
    }
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
    surface: contract?.surface,
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
  if (["behavioral-regression/v9", "behavioral-regression/v10", "behavioral-regression/v11"].includes(value?.schema) && Array.isArray(value.cases)) {
    for (const item of value.cases) {
      if (item.degenerateComponents === undefined) item.degenerateComponents = [];
      if (item.preservedComponents === undefined) item.preservedComponents = [];
      if (item.protectedPaths === undefined) item.protectedPaths = [];
      item.receipts = { before: null, after: null, ...(item.receipts ?? {}) };
    }
  }
  const checked = validateContract(value);
  if (checked.valid && basename(path) !== `${value.id}.json`) checked.findings.push(`contract filename must be ${value.id}.json`);
  if (checked.findings.length === 0 && ["behavioral-regression/v4", "behavioral-regression/v5", "behavioral-regression/v6", "behavioral-regression/v7", "behavioral-regression/v8", "behavioral-regression/v9", "behavioral-regression/v10", "behavioral-regression/v11"].includes(value.schema)) {
    const repoRoot = dirname(dirname(resolve(path)));
    if (["behavioral-regression/v7", "behavioral-regression/v8", "behavioral-regression/v9", "behavioral-regression/v10", "behavioral-regression/v11"].includes(value.schema)) {
      let source = "";
      try { source = readFileSync(resolve(repoRoot, value.surface.constraintSourcePath), "utf8"); }
      catch (error) { checked.findings.push(`surface.constraintSourcePath cannot be read: ${error?.message ?? error}`); }
      if (source && !source.includes(value.surface.constraintLocator)) checked.findings.push("surface.constraintLocator must exist in the pre-existing constraintSourcePath");
    }
    if (["behavioral-regression/v9", "behavioral-regression/v10", "behavioral-regression/v11"].includes(value.schema)) {
      for (const [index, form] of value.surface.callForms.entries()) {
        let source = "";
        try { source = readFileSync(resolve(repoRoot, form.sourcePath), "utf8"); }
        catch (error) { checked.findings.push(`surface.callForms[${index}].sourcePath cannot be read: ${error?.message ?? error}`); }
        if (source) {
          const callableName = callableNameFromLocator(form.locator);
          const declarations = sourceDeclarationsForCallable(source, callableName);
          const locatorExists = source.includes(form.signatureLocator);
          const baselineSource = gitBaselineSource(repoRoot, form.sourcePath);
          const baselineDeclarations = baselineSource ? sourceDeclarationsForCallable(baselineSource, callableName) : [];
          const baselineMatches = baselineDeclarations.filter((declaration) => declaration.text.includes(form.signatureLocator));
          const permitsSignatureEvolution = !locatorExists
            && value.surface?.repairMode === "extend-existing-seam"
            && form.variadic === true
            && baselineMatches.length === 1
            && baselineMatches[0].variadic === false
            && declarations.length === 1
            && declarations[0].variadic === true
            && declarations[0].indent === baselineMatches[0].indent;
          if (!locatorExists && baselineMatches.length !== 1) checked.findings.push(`surface.callForms[${index}].signatureLocator must identify exactly one declaration in the Git baseline before signature evolution`);
          else if (!locatorExists && declarations.length === 1 && baselineMatches.length === 1
            && declarations[0].indent !== baselineMatches[0].indent) checked.findings.push(`surface.callForms[${index}] declaration nesting must match the Git baseline`);
          else if (!locatorExists && !permitsSignatureEvolution) checked.findings.push(`surface.callForms[${index}].signatureLocator must exist in sourcePath`);
          if (declarations.length === 0) checked.findings.push(`surface.callForms[${index}].signatureLocator must resolve to an actual source declaration for ${callableName ?? "the seam"}`);
          else {
            if (locatorExists && !declarations.some((declaration) => declaration.text.includes(form.signatureLocator))) {
              const candidates = declarations.map((declaration) => declaration.text.replace(/\s+/gu, " ").trim()).join(" | ").slice(0, 300);
              const pythonHint = String(form.signatureLocator).trimStart().startsWith("def ") ? "; omit the trailing Python colon" : "";
              checked.findings.push(`surface.callForms[${index}].signatureLocator must identify the actual source declaration for ${callableName}; canonical declaration: ${candidates}${pythonHint}`);
            }
            const variadicStates = new Set(declarations.map((declaration) => declaration.variadic));
            if (variadicStates.size > 1) checked.findings.push(`surface.callForms[${index}] has ambiguous source declarations with conflicting variadic shape`);
            else if (declarations[0].variadic && form.variadic !== true) checked.findings.push(`surface.callForms[${index}] actual source declaration is variadic, so variadic must be true`);
          }
        }
      }
      for (const regressionPath of value.scope.regressionPaths) {
        const regressionFile = resolve(repoRoot, regressionPath);
        let sourceBytes;
        try {
          const stat = lstatSync(regressionFile);
          if (stat.isSymbolicLink() || !stat.isFile()) {
            checked.findings.push(`regressionPath ${regressionPath} must be a regular file and not a symlink`);
            continue;
          }
          sourceBytes = readFileSync(regressionFile);
        } catch (error) { checked.findings.push(`regressionPath ${regressionPath} cannot be read: ${error?.message ?? error}`); continue; }
        let source;
        try { source = strictUtf8(sourceBytes); }
        catch { checked.findings.push(`regressionPath ${regressionPath} must contain valid UTF-8`); continue; }
        if (!source.includes(value.surface.publicLocator) && !source.includes(value.surface.constraintLocator)) checked.findings.push(`regressionPath ${regressionPath} must exercise the declared public or constraint locator`);
        try { execFileSync("git", ["ls-files", "--error-unmatch", "--", regressionPath], { cwd: repoRoot, stdio: "ignore", timeout: 5000 }); }
        catch { checked.findings.push(`regressionPath ${regressionPath} must be a tracked project test`); }
        const baselineBytes = gitBaselineBytes(repoRoot, regressionPath);
        if (baselineBytes === null) {
          checked.findings.push(`regressionPath ${regressionPath} Git baseline cannot be read`);
          continue;
        }
        let baselineSource;
        try { baselineSource = strictUtf8(baselineBytes); }
        catch { checked.findings.push(`regressionPath ${regressionPath} Git baseline must contain valid UTF-8`); continue; }
        const removed = removedBaselineLines(baselineSource, source);
        if (value.schema !== "behavioral-regression/v11") {
          if (removed.length > 0) checked.findings.push(`regressionPath ${regressionPath} must not remove or rewrite a baseline assertion`);
        } else {
          const superseded = (value.scope.supersededAssertions ?? []).filter((entry) => entry.path === regressionPath);
          if (!sourceBytes.equals(baselineBytes)) {
            checked.findings.push(`regressionPath ${regressionPath} must remain byte-identical to the Git baseline; scope.supersededAssertions is metadata and does not authorize candidate test edits`);
          }
          for (const entry of superseded) {
            const prefix = `scope.supersededAssertions[${value.scope.supersededAssertions.indexOf(entry)}]`;
            const baselineMatches = exactExecutableLinePositions(baselineSource, entry.beforeAssertion);
            if (baselineMatches.length !== 1) checked.findings.push(`${prefix}.beforeAssertion must identify exactly one executable Git-baseline assertion`);
            if (entry.assertionForm === "sequence") {
              const consumers = executableSubstringPositions(baselineSource, entry.consumerLocator);
              if (consumers.length !== 1) checked.findings.push(`${prefix}.consumerLocator must identify exactly one executable Git-baseline consumer`);
            }
          }
        }
      }
    }
    for (const [index, item] of value.cases.entries()) {
      const proofPath = resolve(repoRoot, item.proofPath);
      let proof = "";
      try { proof = readFileSync(proofPath, "utf8"); }
      catch (error) { checked.findings.push(`cases[${index}].proofPath cannot be read: ${error?.message ?? error}`); continue; }
      if (value.schema === "behavioral-regression/v11") {
        const witnessLocators = [
          ...(item.oracle?.relations ?? []).map((relation) => relation.witnessLocator),
          ...(item.oracle?.scenarios ?? []).map((scenario) => scenario.witnessLocator),
          item.oracle?.neutrality?.witnessLocator,
          item.oracle?.coupledBoundary?.witnessLocator,
        ].filter(nonempty);
        for (const locator of witnessLocators) {
          const callable = locator.match(/^([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*\(/u)?.[1] ?? "locator";
          if (!proofDefinesWitnessCallable(proof, locator)) checked.findings.push(`cases[${index}] witness callable ${callable} must be defined in proofPath`);
        }
      }
      if (item.coverage.includes("public-seam") && !proof.includes(value.surface.publicLocator)) checked.findings.push(`cases[${index}] publicLocator is absent from proofPath`);
      if (item.coverage.includes("constraint-seam") && !proof.includes(value.surface.constraintLocator)) checked.findings.push(`cases[${index}] constraintLocator is absent from proofPath`);
      if (value.schema === "behavioral-regression/v7") for (const relation of item.oracle?.relations ?? []) {
        if (!proof.includes(relation.witnessLocator)) checked.findings.push(`cases[${index}] relation witnessLocator is absent from proofPath`);
      }
      if (["behavioral-regression/v8", "behavioral-regression/v9", "behavioral-regression/v10", "behavioral-regression/v11"].includes(value.schema)) {
        const checkedObservationCallables = new Set();
        for (const relation of item.oracle?.relations ?? []) {
          if (!proof.includes(relation.witnessLocator)) checked.findings.push(`cases[${index}] relation witnessLocator is absent from proofPath`);
          if (["behavioral-regression/v10", "behavioral-regression/v11"].includes(value.schema)) {
            const invocation = String(relation.invocationLocator ?? "");
            const witness = String(relation.witnessLocator ?? "");
            const invocationAt = proof.indexOf(invocation);
            const witnessAt = proof.indexOf(witness, Math.max(0, invocationAt + invocation.length));
            if (invocationAt < 0) checked.findings.push(`cases[${index}] relation invocationLocator is absent from proofPath`);
            else if (proof.indexOf(invocation, invocationAt + invocation.length) >= 0) checked.findings.push(`cases[${index}] relation invocationLocator must occur exactly once in proofPath`);
            if (invocationAt >= 0 && witnessAt < 0) checked.findings.push(`cases[${index}] relation witness must occur after its invocationLocator`);
            if (invocationAt >= 0 && witnessAt >= 0) {
              const binding = escapePattern(relation.resultBinding ?? "");
              const between = proof.slice(invocationAt + invocation.length, witnessAt);
              if (binding && new RegExp(`(?:^|\\n)\\s*(?:(?:const|let|var)\\s+)?${binding}(?:\\s*=|\\s*[.\\[])`, "u").test(between)) checked.findings.push(`cases[${index}] relation resultBinding is reassigned or mutated between invocation and witness`);
              const seamLocators = [...new Set([value.surface.publicLocator, value.surface.constraintLocator].filter(nonempty))];
              if (seamLocators.some((locator) => between.includes(locator))) checked.findings.push(`cases[${index}] second public or constraint seam invocation between relation invocation and witness is forbidden`);
              for (const expression of Object.values(relation.componentArguments ?? {})) {
                const identifier = escapePattern(expression);
                if (identifier && new RegExp(`(?:^|\\n)\\s*(?:(?:const|let|var)\\s+)?${identifier}\\s*=`, "u").test(between)) {
                  checked.findings.push(`cases[${index}] relation component argument ${expression} is rebound between invocation and witness`);
                }
              }
            }
          }
        }
        for (const scenario of item.oracle?.scenarios ?? []) {
          if (!proof.includes(scenario.witnessLocator)) checked.findings.push(`cases[${index}] scenario witnessLocator is absent from proofPath`);
          if (["behavioral-regression/v9", "behavioral-regression/v10", "behavioral-regression/v11"].includes(value.schema) && !proof.includes(scenario.invocationLocator)) checked.findings.push(`cases[${index}] scenario invocationLocator is absent from proofPath`);
          if (value.schema === "behavioral-regression/v11") {
            const invocation = String(scenario.invocationLocator ?? "");
            const witness = String(scenario.witnessLocator ?? "");
            const invocationAt = executableSubstringPositions(proof, invocation)[0] ?? -1;
            const witnessAt = executableSubstringPositions(proof, witness).find((position) => position > invocationAt) ?? -1;
            const observation = directAssignedCall(invocation, scenario.observationBinding);
            if (observation && !proofDefinesWitnessCallable(proof, `${observation.callee}()`)) checked.findings.push(`cases[${index}] scenario observation callable ${observation.callee} must be defined in proofPath`);
            if (scenario.kind === "genuine-cycle" && observation && !checkedObservationCallables.has(observation.callee)) {
              checkedObservationCallables.add(observation.callee);
              const definitions = observationCallableDefinitions(proof, observation.callee);
              if (definitions.length !== 1) checked.findings.push(`cases[${index}] scenario observation helper ${observation.callee} must have exactly one supported definition`);
              else {
                const projectionFinding = diagnosticProjectionFinding(definitions[0], scenario.diagnosticProjection);
                if (projectionFinding) checked.findings.push(`cases[${index}] scenario ${projectionFinding}`);
              }
            }
            if (invocationAt < 0 || witnessAt < 0) checked.findings.push(`cases[${index}] scenario observation and witness must be executable and ordered in proofPath`);
            else {
              const between = proof.slice(invocationAt + invocation.length, witnessAt);
              const binding = escapePattern(scenario.observationBinding ?? "");
              if (binding && new RegExp(`(?:^|\\n)\\s*(?:(?:const|let|var)\\s+)?${binding}(?:\\s*=|\\s*[.\\[])`, "u").test(between)) checked.findings.push(`cases[${index}] scenario observationBinding is reassigned or mutated between invocation and witness`);
              const seamLocators = [...new Set([value.surface.publicLocator, value.surface.constraintLocator].filter(nonempty))];
              if (seamLocators.some((locator) => between.includes(locator))) checked.findings.push(`cases[${index}] second public or constraint seam invocation between scenario observation and witness is forbidden`);
            }
            for (const diagnostic of scenario.expected?.diagnostics ?? []) {
              if (nonempty(diagnostic) && proof.includes(diagnostic)) checked.findings.push(`cases[${index}] scenario proof contains a hardcoded expected diagnostic instead of sourcing observationBinding.diagnostics from the same constraint seam observation`);
            }
          }
        }
        const neutrality = item.oracle?.neutrality;
        if (["behavioral-regression/v10", "behavioral-regression/v11"].includes(value.schema) && neutrality) {
          const sequence = [
            neutrality.singleInvocationLocator,
            neutrality.leftInvocationLocator,
            neutrality.rightInvocationLocator,
            neutrality.witnessLocator,
          ];
          const positions = [];
          let cursor = 0;
          for (const locator of sequence) {
            const at = proof.indexOf(locator, cursor);
            positions.push(at);
            if (at >= 0) cursor = at + locator.length;
          }
          if (positions.some((position) => position < 0)) checked.findings.push(`cases[${index}] neutrality proof must contain the three invocation locators followed by witnessLocator`);
          else {
            for (let locatorIndex = 0; locatorIndex + 1 < sequence.length; locatorIndex += 1) {
              const between = proof.slice(positions[locatorIndex] + sequence[locatorIndex].length, positions[locatorIndex + 1]);
              if (!/^[\s;]*$/u.test(between)) checked.findings.push(`cases[${index}] neutrality invocation and witness locators must form one adjacent proof block`);
            }
            const block = proof.slice(positions[0], positions.at(-1) + sequence.at(-1).length);
            const seamCalls = block.split(value.surface.constraintLocator).length - 1;
            if (seamCalls !== 3) checked.findings.push(`cases[${index}] neutrality proof block must contain exactly three constraint seam invocations`);
            for (const binding of [neutrality.singleResultBinding, neutrality.leftResultBinding, neutrality.rightResultBinding]) {
              const identifier = escapePattern(binding);
              const invocationEnd = positions[sequence.findIndex((locator) => locator.includes(`${binding} =`))]
                + sequence.find((locator) => locator.includes(`${binding} =`)).length;
              const afterInvocation = proof.slice(invocationEnd, positions.at(-1));
              if (new RegExp(`(?:^|\n)\s*(?:(?:const|let|var)\s+)?${identifier}(?:\s*=|\s*[.\[])`, "u").test(afterInvocation)) {
                checked.findings.push(`cases[${index}] neutrality result binding ${binding} is reassigned or mutated before the witness`);
              }
            }
          }
        }
        const coupled = item.oracle?.coupledBoundary;
        if (["behavioral-regression/v10", "behavioral-regression/v11"].includes(value.schema) && coupled) {
          const invocation = String(coupled.invocationLocator ?? "");
          const witness = String(coupled.witnessLocator ?? "");
          const invocationPositions = executableSubstringPositions(proof, invocation);
          const invocationAt = invocationPositions[0] ?? -1;
          const witnessAt = executableSubstringPositions(proof, witness).find((position) => position > invocationAt) ?? -1;
          if (invocationPositions.length !== 1) checked.findings.push(`cases[${index}] coupled-boundary invocationLocator must occur exactly once as executable code in proofPath`);
          if (invocationAt < 0 || witnessAt < 0) checked.findings.push(`cases[${index}] coupled-boundary invocation and witness must be executable and ordered in proofPath`);
          else {
            const between = proof.slice(invocationAt + invocation.length, witnessAt);
            const binding = escapePattern(coupled.resultBinding ?? "");
            if (binding && new RegExp(`(?:^|\\n)\\s*(?:(?:const|let|var)\\s+)?${binding}(?:\\s*=|\\s*[.\\[])`, "u").test(between)) checked.findings.push(`cases[${index}] coupled-boundary resultBinding is reassigned or mutated between invocation and witness`);
            const seamLocators = [...new Set([value.surface.publicLocator, value.surface.constraintLocator].filter(nonempty))];
            if (seamLocators.some((locator) => between.includes(locator))) checked.findings.push(`cases[${index}] second public or constraint seam invocation between coupled-boundary invocation and witness is forbidden`);
            for (const expression of Object.values(coupled.componentArguments ?? {})) {
              const identifier = escapePattern(expression);
              if (identifier && new RegExp(`(?:^|\\n)\\s*(?:(?:const|let|var)\\s+)?${identifier}\\s*=`, "u").test(between)) checked.findings.push(`cases[${index}] coupled-boundary component argument ${expression} is rebound between invocation and witness`);
            }
          }
        }
      }
    }
  }
  return { valid: checked.findings.length === 0, findings: checked.findings, contract: value };
}
