#!/usr/bin/env node
// harness-source-hash: sha256:68126ffd93fe9a74f76c5f9a409001005c3d3eaba6753e0a26eb7214acc77e4d

// plugins/engineering-practice/src/entries/hooks/engineering-practice.ts
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// core/src/hook-event.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}
async function readStdinJson(input = process.stdin) {
  let raw = "";
  for await (const chunk of input) raw += chunk.toString();
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : { __parseError: true };
  } catch {
    return { __parseError: true };
  }
}
function eventCwd(event) {
  return firstString(event.cwd, event.working_directory, event.workingDirectory) || process.cwd();
}
function eventPrompt(event) {
  return firstString(event.prompt, event.user_prompt, event.userPrompt, event.message);
}

// core/src/hook-output.ts
var TOOL_LIFECYCLE_EVENTS = /* @__PURE__ */ new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure"
]);
function additionalContext(hookEventName, context, options = {}) {
  const codexToolReport = Boolean(process.env.PLUGIN_ROOT) && TOOL_LIFECYCLE_EVENTS.has(hookEventName);
  const echoStderr = options.echoStderr ?? codexToolReport;
  const suppressJson = codexToolReport || Boolean(options.suppressJson);
  if (echoStderr) process.stderr.write(`${context}
`);
  if (suppressJson) return null;
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context
    }
  };
}
function stopBlock(reason) {
  return { decision: "block", reason };
}
function writeJson(value) {
  if (value !== null && value !== void 0) {
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// plugins/engineering-practice/src/lib/outcome-challenge.ts
var TEST_PATH = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/iu;
var CONTRACT_EVIDENCE_PATH = /(?:^|\/)(?:test|tests|__tests__|docs?)(?:\/|$)|(?:^|\/)README(?:\.[^/]*)?$|\.(?:test|spec)\.[cm]?[jt]sx?$/iu;
var GENERATED_PATH = /(?:^|\/)(?:acceptance|dist|build|docs?|examples?|fixtures?|vendor|node_modules|\.git)(?:\/|$)/u;
var LOSSY_TRANSFORM = /\b((?:broadcast|flatten|coerc|normaliz|deduplic|align|stack|reshape)\w*)\s*\(/iu;
var EMPTY_GUARD = /\bif\b[^\n]*(?:\bempty\b|\bzero\b|\.size\b|\.length\b|\.shape\b)/iu;
var MIXED_EMPTY_GUARD = /\bif\b[^\n]*(?:\bany\s*\([^)]*(?:empty|sizes?)[^)]*\)|(?:empty|sizes?)\.some\s*\()[^\n]*(?:\bnot\s+all\s*\([^)]*(?:empty|sizes?)[^)]*\)|!\s*(?:empty|sizes?)\.every\s*\()/iu;
var REJECTION = /^\s*(?:raise\b|throw\b|return\s+(?:new\s+)?\w*Error\b)/iu;
var FUNCTION_START = /^\s*(?:(?:export\s+)?(?:async\s+)?function\s+|(?:async\s+)?def\s+)/u;
var FUNCTION_SCOPE_START = /^\s*(?:(?:(?:export\s+)?(?:async\s+)?function\s+|(?:async\s+)?def\s+)|(?:(?:static|async|get|set)\s+)*[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{)/u;
var COMPONENT_EMPTY_ASSIGNMENT = /\b([A-Za-z_$][\w$]*)\s*=\s*(?:any\s*\([^\n]*(?:\.size|\.length|\bempty\b)|[^\n]*(?:\.some|\.find)\s*\([^\n]*(?:\.size|\.length|\bempty\b))/iu;
var EMPTY_AGGREGATE_ASSIGNMENT = /^\s*([A-Za-z_$][\w$]*)\s*=\s*(?:[A-Za-z_$][\w$]*\.)?(?:zeros?|empty|empty_like|full)\s*\(/iu;
var FRESH_EMPTY_RETURN = /^\s*return\b[^\n]*(?:\b(?:zeros?|empty|empty_like|full)\s*\(|\b(?:array|asarray)\s*\(\s*\[\s*\]\s*\)|\[\s*\])/iu;
function diffFiles(diff) {
  const files = [];
  for (const block of diff.split(/^diff --git /mu).slice(1)) {
    const header = block.match(/^a\/\S+ b\/(\S+)/u);
    const path = header?.[1];
    if (path) files.push({ path, lines: block.split("\n") });
  }
  return files;
}
function productionFiles(diff) {
  return diffFiles(diff).filter(({ path }) => !TEST_PATH.test(path) && !GENERATED_PATH.test(path));
}
function addedLines(file) {
  const added = [];
  let newLine = 0;
  for (const rawLine of file.lines) {
    const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u);
    const hunkLine = hunk?.[1];
    if (hunkLine) {
      newLine = Number.parseInt(hunkLine, 10);
      continue;
    }
    if (newLine === 0 || rawLine.startsWith("---") || rawLine.startsWith("+++")) continue;
    if (!rawLine.startsWith("-")) {
      if (rawLine.startsWith("+")) added.push({ line: newLine, source: rawLine.slice(1) });
      newLine += 1;
    }
  }
  return added;
}
function newSideLines(file) {
  const lines = [];
  let newLine = 0;
  let hunkNumber = 0;
  for (const rawLine of file.lines) {
    const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u);
    const hunkLine = hunk?.[1];
    if (hunkLine) {
      newLine = Number.parseInt(hunkLine, 10);
      hunkNumber += 1;
      continue;
    }
    if (newLine === 0 || rawLine.startsWith("---") || rawLine.startsWith("+++") || rawLine.startsWith("-")) continue;
    const added = rawLine.startsWith("+");
    lines.push({ line: newLine, source: rawLine.slice(1), added, hunk: hunkNumber });
    newLine += 1;
  }
  return lines;
}
function boundaryGuardFinding(diff) {
  for (const file of productionFiles(diff)) {
    let newLine = 0;
    let transform = "";
    let guardBeforeTransform = false;
    for (const rawLine of file.lines) {
      const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u);
      const hunkLine = hunk?.[1];
      if (hunkLine) {
        newLine = Number.parseInt(hunkLine, 10);
        transform = "";
        guardBeforeTransform = false;
        continue;
      }
      if (newLine === 0 || rawLine.startsWith("---") || rawLine.startsWith("+++")) continue;
      const removed = rawLine.startsWith("-");
      const added = rawLine.startsWith("+");
      const source = rawLine.slice(1);
      if (!removed) {
        if (FUNCTION_START.test(source)) {
          transform = "";
          guardBeforeTransform = false;
        }
        if (added && EMPTY_GUARD.test(source) && !transform) guardBeforeTransform = true;
        const lossy = source.match(LOSSY_TRANSFORM);
        const lossyTransform = lossy?.[1];
        if (lossyTransform && !transform) transform = lossyTransform;
        if (added && EMPTY_GUARD.test(source) && transform && !guardBeforeTransform) {
          return {
            code: "lossy-boundary-guard-order",
            path: file.path,
            line: newLine,
            transform
          };
        }
        newLine += 1;
      }
    }
  }
  return null;
}
function mixedBoundaryRejectionFinding(diff) {
  for (const file of productionFiles(diff)) {
    let newLine = 0;
    let mixedGuardBudget = 0;
    let rejectionLine = 0;
    for (const rawLine of file.lines) {
      const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u);
      const hunkLine = hunk?.[1];
      if (hunkLine) {
        newLine = Number.parseInt(hunkLine, 10);
        mixedGuardBudget = 0;
        rejectionLine = 0;
        continue;
      }
      if (newLine === 0 || rawLine.startsWith("---") || rawLine.startsWith("+++")) continue;
      const removed = rawLine.startsWith("-");
      const added = rawLine.startsWith("+");
      const source = rawLine.slice(1);
      if (!removed) {
        if (FUNCTION_START.test(source)) {
          mixedGuardBudget = 0;
          rejectionLine = 0;
        }
        if (added && MIXED_EMPTY_GUARD.test(source)) mixedGuardBudget = 4;
        else if (mixedGuardBudget > 0) mixedGuardBudget -= 1;
        if (added && mixedGuardBudget > 0 && REJECTION.test(source)) rejectionLine = newLine;
        const lossyTransform = source.match(LOSSY_TRANSFORM)?.[1];
        if (lossyTransform && rejectionLine) {
          return {
            code: "mixed-boundary-rejection",
            path: file.path,
            line: rejectionLine,
            transform: lossyTransform
          };
        }
        newLine += 1;
      }
    }
  }
  return null;
}
function mixedBoundarySynthesisFinding(diff) {
  for (const file of productionFiles(diff)) {
    let newLine = 0;
    let emptyFlag = "";
    let sawLossyTransform = false;
    let guardedBudget = 0;
    let hunkScope = "";
    for (const rawLine of file.lines) {
      const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@(?:\s*(.*))?$/u);
      const hunkLine = hunk?.[1];
      if (hunkLine) {
        const nextLine = Number.parseInt(hunkLine, 10);
        const nextScope = hunk[2]?.trim() ?? "";
        const sameScope = !hunkScope || !nextScope || hunkScope === nextScope;
        const nearbyContinuation = sameScope && newLine > 0 && nextLine >= newLine && nextLine - newLine <= 32;
        newLine = nextLine;
        if (!nearbyContinuation) {
          emptyFlag = "";
          sawLossyTransform = false;
        }
        hunkScope = nextScope;
        guardedBudget = 0;
        continue;
      }
      if (newLine === 0 || rawLine.startsWith("---") || rawLine.startsWith("+++")) continue;
      const removed = rawLine.startsWith("-");
      const added = rawLine.startsWith("+");
      const source = rawLine.slice(1);
      if (!removed) {
        if (FUNCTION_START.test(source)) {
          emptyFlag = "";
          sawLossyTransform = false;
          guardedBudget = 0;
        }
        if (added) emptyFlag ||= source.match(COMPONENT_EMPTY_ASSIGNMENT)?.[1] ?? "";
        if (emptyFlag && LOSSY_TRANSFORM.test(source)) sawLossyTransform = true;
        if (added && emptyFlag && sawLossyTransform && new RegExp(`\\bif\\b[^\\n]*\\b${escapeRegExp(emptyFlag)}\\b`, "u").test(source)) {
          guardedBudget = 4;
        } else if (guardedBudget > 0) {
          guardedBudget -= 1;
        }
        const aggregate = added && guardedBudget > 0 ? source.match(EMPTY_AGGREGATE_ASSIGNMENT)?.[1] ?? "" : "";
        if (aggregate) {
          const newSource = file.lines.filter((line) => !line.startsWith("-") || line.startsWith("---")).map((line) => line.startsWith("+") ? line.slice(1) : line).join("\n");
          const isSplitBackIntoComponents = new RegExp(
            `(?:\\b${escapeRegExp(aggregate)}\\s*\\[|\\b(?:split|unstack)\\w*\\s*\\(\\s*${escapeRegExp(aggregate)}\\b)[\\s\\S]{0,160}\\b(?:reshape|shape|split|unstack)\\b`,
            "iu"
          ).test(newSource);
          if (isSplitBackIntoComponents) {
            return {
              code: "mixed-boundary-shared-synthesis",
              path: file.path,
              line: newLine,
              aggregate
            };
          }
        }
        newLine += 1;
      }
    }
  }
  return null;
}
function mixedBoundaryFreshEmptyFinding(diff) {
  for (const file of productionFiles(diff)) {
    let transform = "";
    let postTransformGuardBudget = 0;
    let activeHunk = 0;
    for (const entry of newSideLines(file)) {
      if (entry.hunk !== activeHunk) {
        activeHunk = entry.hunk;
        transform = "";
        postTransformGuardBudget = 0;
      }
      if (FUNCTION_START.test(entry.source)) {
        transform = "";
        postTransformGuardBudget = 0;
      }
      transform ||= entry.source.match(LOSSY_TRANSFORM)?.[1] ?? "";
      if (entry.added && transform && EMPTY_GUARD.test(entry.source)) {
        postTransformGuardBudget = 5;
        continue;
      }
      if (postTransformGuardBudget > 0) postTransformGuardBudget -= 1;
      if (entry.added && transform && postTransformGuardBudget > 0 && FRESH_EMPTY_RETURN.test(entry.source)) {
        return {
          code: "mixed-boundary-fresh-empty",
          path: file.path,
          line: entry.line,
          transform
        };
      }
    }
  }
  return null;
}
function variadicParameter(source) {
  return source.match(/\bdef\s+\w+\s*\(\s*\*([A-Za-z_]\w*)/u)?.[1] ?? source.match(/(?:\bfunction\s+\w+|\b\w+)\s*\([^)]*\.\.\.([A-Za-z_$][\w$]*)/u)?.[1] ?? "";
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
function singleInputExpression(source) {
  const expression = "([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)";
  return source.match(new RegExp(`\\bif\\b[^\\n]*len\\s*\\(\\s*${expression}\\s*\\)\\s*={2,3}\\s*1`, "u"))?.[1] ?? source.match(new RegExp(`\\bif\\b[^\\n]*${expression}\\.length\\s*={2,3}\\s*1`, "u"))?.[1] ?? "";
}
function variadicFunctionScopes(file) {
  const scopes = [];
  let active = null;
  for (const entry of newSideLines(file)) {
    if (FUNCTION_SCOPE_START.test(entry.source)) {
      const parameter = entry.added ? variadicParameter(entry.source) : "";
      active = parameter ? { parameter, additions: [{ line: entry.line, source: entry.source }], hunk: entry.hunk } : null;
      if (active) scopes.push(active);
      continue;
    }
    if (active && entry.added) active.additions.push({ line: entry.line, source: entry.source });
  }
  return scopes;
}
function diagnosticCarriesCallerGroups(additions, warningIndex, block, parameter) {
  const executableBlock = executableText(block);
  if (new RegExp(`\\b${escapeRegExp(parameter)}\\b`, "u").test(executableBlock)) return true;
  for (let assignmentIndex = 0; assignmentIndex < warningIndex; assignmentIndex += 1) {
    const alias = additions[assignmentIndex]?.source.match(/^\s*([A-Za-z_$][\w$]*)\s*=/u)?.[1];
    if (!alias || !new RegExp(`\\b${escapeRegExp(alias)}\\b`, "u").test(executableBlock)) continue;
    const assignmentBlock = executableText(
      additions.slice(assignmentIndex, assignmentIndex + 6).map(({ source }) => source).join("\n")
    );
    if (new RegExp(`\\b${escapeRegExp(parameter)}\\b`, "u").test(assignmentBlock)) return true;
  }
  return false;
}
function joinSeparators(source) {
  const separators = [];
  for (const match of source.matchAll(/(["'])((?:\\.|(?!\1)[^\\\r\n])*)\1\s*\.join\s*\(/gu)) {
    if (match[2] !== void 0) separators.push(match[2]);
  }
  for (const match of source.matchAll(/\.join\s*\(\s*(["'])((?:\\.|(?!\1)[^\\\r\n])*)\1\s*\)/gu)) {
    if (match[2] !== void 0) separators.push(match[2]);
  }
  return separators;
}
function stringLiterals(source) {
  return [...source.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gu)].map(([literal]) => literal);
}
function removedDiagnosticSeparators(file, targetHunk) {
  const removed = [];
  let hunk = 0;
  for (const line of file.lines) {
    if (line.startsWith("@@ ")) {
      hunk += 1;
      continue;
    }
    if (hunk === targetHunk && line.startsWith("-") && !line.startsWith("---")) removed.push(line.slice(1));
  }
  const separators = /* @__PURE__ */ new Set();
  for (let index = 0; index < removed.length; index += 1) {
    if (!/(?:warnings?\.warn|console\.warn|throw\s+(?:new\s+)?\w*Error)\b/iu.test(removed[index] ?? "")) continue;
    for (const separator of joinSeparators(removed.slice(index, index + 12).join("\n"))) separators.add(separator);
  }
  return separators;
}
function peerOperandDelimiter(source) {
  if (!/\b(?:warn(?:ing)?|error|diagnostic|conflict|cycle)\w*\b/iu.test(source)) return null;
  const match = source.match(/([\])}])\s*([^\p{L}\p{N}\s"'`]+)\s*([[({])/u);
  const delimiter = match?.[2]?.trim();
  if (!match || !delimiter) return null;
  return {
    delimiter,
    normalized: source.replace(match[0], `${match[1]}<peer-delimiter>${match[3]}`).trim()
  };
}
function hasVariadicCallerDiagnostic(diff) {
  for (const file of productionFiles(diff)) {
    const scopes = variadicFunctionScopes(file);
    for (const scope of scopes) {
      for (let index = 0; index < scope.additions.length; index += 1) {
        const warning = scope.additions[index];
        if (!warning || !/(?:warnings?\.warn|console\.warn|throw\s+(?:new\s+)?\w*Error)\b/iu.test(warning.source)) continue;
        const block = scope.additions.slice(index, index + 12).map(({ source }) => source).join("\n");
        if (diagnosticCarriesCallerGroups(scope.additions, index, block, scope.parameter)) return true;
      }
    }
    if (scopes.length > 0 && addedLines(file).some(({ source }) => /\bwarnings?\s*\.\s*(?:warn|push)\b|\bconsole\.warn\b|\bthrow\s+(?:new\s+)?\w*Error\b/iu.test(source))) return true;
  }
  return false;
}
function variadicSeamBypassFinding(diff) {
  for (const file of productionFiles(diff)) {
    const additions = addedLines(file);
    if (!additions.some(({ source }) => variadicParameter(source))) continue;
    let input = "";
    let singleInputLine = 0;
    let guardIndent = 0;
    for (const addition of additions) {
      const candidate = singleInputExpression(addition.source);
      if (candidate && /(?:lists|chains|groups|inputs|items)$/u.test(candidate)) {
        input = candidate;
        singleInputLine = addition.line;
        guardIndent = addition.source.match(/^\s*/u)?.[0].length ?? 0;
        continue;
      }
      const distance = addition.line - singleInputLine;
      const indent = addition.source.match(/^\s*/u)?.[0].length ?? 0;
      if (input && distance > 0 && distance <= 20 && indent > guardIndent) {
        const returned = addition.source.match(/^\s*return\s+(.+)$/u)?.[1] ?? "";
        if (returned) {
          const usesCompleteCollection = new RegExp(`\\b(?:stable|order|normaliz|dedup|merge|combine)\\w*\\s*\\([^\\n]*\\b${escapeRegExp(input)}\\b(?!\\s*\\[)`, "iu").test(returned);
          if (usesCompleteCollection) continue;
          return {
            code: "variadic-single-input-bypass",
            path: file.path,
            line: addition.line,
            parameter: input
          };
        }
      }
      if (distance > 20 || distance > 0 && addition.source.trim() && indent <= guardIndent) input = "";
    }
  }
  return null;
}
function variadicCycleFallbackFinding(diff) {
  for (const file of productionFiles(diff)) {
    for (const scope of variadicFunctionScopes(file)) {
      let cycleBudget = 0;
      for (const addition of scope.additions) {
        if (/\b(?:except|catch)\b[^\n]*(?:cycle|cyclic|dependency)/iu.test(addition.source)) {
          cycleBudget = 24;
          continue;
        }
        if (cycleBudget > 0) cycleBudget -= 1;
        if (cycleBudget === 0 || !/^\s*return\b/u.test(addition.source)) continue;
        if (new RegExp(
          `\\b${escapeRegExp(scope.parameter)}\\s*\\[\\s*0\\s*\\]`,
          "u"
        ).test(addition.source)) {
          return {
            code: "variadic-cycle-first-input-fallback",
            path: file.path,
            line: addition.line,
            parameter: scope.parameter
          };
        }
      }
    }
  }
  return null;
}
function variadicFlattenedDiagnosticFinding(diff) {
  for (const file of productionFiles(diff)) {
    for (const scope of variadicFunctionScopes(file)) {
      const additions = scope.additions;
      for (let index = 0; index < additions.length; index += 1) {
        const warning = additions[index];
        if (!warning || !/(?:warnings?\.warn|console\.warn|throw\s+(?:new\s+)?\w*Error)\b/iu.test(warning.source)) continue;
        const block = additions.slice(index, index + 12).map(({ source }) => source).join("\n");
        const joinCount = [...block.matchAll(/\.join\s*\(/gu)].length;
        if (joinCount < 2) continue;
        if (!diagnosticCarriesCallerGroups(additions, index, block, scope.parameter)) continue;
        return {
          code: "variadic-flattened-diagnostic",
          path: file.path,
          line: warning.line,
          parameter: scope.parameter
        };
      }
    }
  }
  return null;
}
function variadicNovelDiagnosticStyleFinding(diff) {
  for (const file of productionFiles(diff)) {
    for (const scope of variadicFunctionScopes(file)) {
      const originalSeparators = removedDiagnosticSeparators(file, scope.hunk);
      const additions = scope.additions;
      for (let index = 0; index < additions.length; index += 1) {
        const warning = additions[index];
        if (!warning || !/(?:warnings?\.warn|console\.warn|throw\s+(?:new\s+)?\w*Error)\b/iu.test(warning.source)) continue;
        const block = additions.slice(index, index + 12).map(({ source }) => source).join("\n");
        if (!diagnosticCarriesCallerGroups(additions, index, block, scope.parameter)) continue;
        if (stringLiterals(block).some((literal) => /\\n/u.test(literal))) {
          return {
            code: "variadic-novel-diagnostic-style",
            path: file.path,
            line: warning.line,
            parameter: scope.parameter,
            style: "multiline-peer-operands"
          };
        }
        const lexicalConnector = joinSeparators(block).find((separator) => {
          const visible = separator.replace(/\\./gu, "");
          return new RegExp("\\p{L}", "u").test(visible) && !originalSeparators.has(separator);
        });
        if (lexicalConnector !== void 0) {
          return {
            code: "variadic-novel-diagnostic-style",
            path: file.path,
            line: warning.line,
            parameter: scope.parameter,
            style: "lexical-connector"
          };
        }
      }
    }
  }
  return null;
}
function diagnosticContractRewriteFinding(diff) {
  if (!hasVariadicCallerDiagnostic(diff)) return null;
  for (const file of diffFiles(diff)) {
    if (!CONTRACT_EVIDENCE_PATH.test(file.path)) continue;
    const removed = file.lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).map((line) => peerOperandDelimiter(line.slice(1))).filter((candidate) => candidate !== null);
    for (const addition of addedLines(file)) {
      const added = peerOperandDelimiter(addition.source);
      if (!added) continue;
      const baseline = removed.find((candidate) => candidate.normalized === added.normalized);
      if (!baseline || baseline.delimiter === added.delimiter) continue;
      return {
        code: "diagnostic-contract-rewrite",
        path: file.path,
        line: addition.line,
        before: baseline.delimiter,
        after: added.delimiter
      };
    }
  }
  return null;
}
function variadicDiagnosticFinding(diff) {
  for (const file of productionFiles(diff)) {
    const additions = addedLines(file);
    const parameters = additions.map(({ source }) => variadicParameter(source)).filter(Boolean);
    if (parameters.length === 0) continue;
    for (let index = 0; index < additions.length; index += 1) {
      const warning = additions[index];
      if (!warning || !/(?:warnings?\.warn|console\.warn|throw\s+(?:new\s+)?\w*Error)\b/iu.test(warning.source)) continue;
      const block = additions.slice(index, index + 8);
      for (const entry of block) {
        const formatting = entry.source.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gu, "");
        const variable = formatting.match(/%\s*(?:\(\s*)?([A-Za-z_]\w*)\b/u)?.[1] ?? formatting.match(/\.format\(\s*([A-Za-z_]\w*)\b/u)?.[1] ?? "";
        if (!variable) continue;
        const assignments = additions.filter(({ source }) => new RegExp(`\\b${escapeRegExp(variable)}\\s*=`, "u").test(source)).map(({ source }) => source).join("\n");
        const callerGroups = parameters.includes(variable) || parameters.some((parameter) => new RegExp(`\\b${escapeRegExp(parameter)}\\b`, "u").test(assignments)) || /\b(?:chains|lists|groups|inputs|operands|constraints)\b/iu.test(assignments);
        if (!callerGroups) {
          return {
            code: "variadic-internal-diagnostic",
            path: file.path,
            line: entry.line,
            variable
          };
        }
      }
    }
  }
  return null;
}
function fixedArityCompositionSeams(file) {
  const seams = /* @__PURE__ */ new Set();
  for (const rawLine of file.lines) {
    if (rawLine.startsWith("-")) continue;
    const source = rawLine.startsWith("+") ? rawLine.slice(1) : rawLine;
    const python = source.match(/^\s*def\s+((?:merge|combine|order)\w*)\s*\(([^)]*)\)/iu);
    const javascript = source.match(/^\s*(?:(?:export\s+)?(?:async\s+)?function\s+)?((?:merge|combine|order)\w*)\s*\(([^)]*)\)/iu);
    const signature = python ?? javascript;
    const name = signature?.[1];
    const parameters = signature?.[2];
    if (!name || parameters === void 0 || /(?:\*|\.\.\.)/u.test(parameters)) continue;
    const required = parameters.split(",").map((parameter) => parameter.trim()).filter((parameter) => parameter && !/^(?:self|cls)$/u.test(parameter));
    if (required.length >= 2) seams.add(name);
  }
  return [...seams];
}
function removedCompositionSeams(file) {
  const seams = /* @__PURE__ */ new Set();
  for (const rawLine of file.lines) {
    if (!rawLine.startsWith("-") || rawLine.startsWith("---")) continue;
    const matches = rawLine.slice(1).matchAll(
      /\b[A-Za-z_$][\w$]*\s*\.\s*((?:merge|combine|order)\w*)\s*\(/giu
    );
    for (const match of matches) {
      const seam = match[1];
      if (seam) seams.add(seam);
    }
  }
  return [...seams];
}
function variadicCompositionSeams(file) {
  const seams = /* @__PURE__ */ new Set();
  for (const rawLine of file.lines) {
    if (rawLine.startsWith("-")) continue;
    const source = rawLine.startsWith("+") ? rawLine.slice(1) : rawLine;
    const signature = source.match(
      /^\s*(?:def\s+|(?:(?:export\s+)?(?:async\s+)?function\s+)?)((?:merge|combine|order)\w*)\s*\(([^)]*)\)/iu
    );
    const name = signature?.[1];
    const parameters = signature?.[2];
    if (name && parameters !== void 0 && /(?:\*|\.\.\.)/u.test(parameters)) seams.add(name);
  }
  return [...seams];
}
function partialCompositionMigrationFinding(diff) {
  for (const file of productionFiles(diff)) {
    const additions = addedLines(file);
    const seams = /* @__PURE__ */ new Set();
    for (const addition of additions) {
      const signature = addition.source.match(
        /^\s*(?:def\s+|(?:static\s+)?(?:(?:export\s+)?(?:async\s+)?function\s+)?)((?:merge|combine|order)\w*)\s*\(([^)]*)\)/iu
      );
      if (signature?.[1] && /(?:\*|\.\.\.)/u.test(signature[2] ?? "")) seams.add(signature[1]);
    }
    if (seams.size === 0) continue;
    const lines = newSideLines(file);
    for (const seam of seams) {
      const seamPattern = escapeRegExp(seam);
      const hasMigratedConsumer = additions.some(({ source }) => !FUNCTION_SCOPE_START.test(source) && new RegExp(`(?:\\.|\\b)${seamPattern}\\s*\\(\\s*(?:\\*|\\.\\.\\.)`, "u").test(source));
      if (!hasMigratedConsumer) continue;
      for (let index = 0; index < lines.length; index += 1) {
        const entry = lines[index];
        if (!entry || FUNCTION_SCOPE_START.test(entry.source)) continue;
        const fixedCall = new RegExp(`(?:\\.|\\b)${seamPattern}\\s*\\(\\s*(?!\\*|\\.\\.)[^\\n,]+,`, "u").test(executableText(entry.source));
        if (!fixedCall) continue;
        const indent = entry.source.match(/^\s*/u)?.[0].length ?? 0;
        const nearby = lines.slice(Math.max(0, index - 8), index);
        const inAggregateLoop = /^\s*(?:for|while)\b/u.test(entry.source) || nearby.some((candidate) => {
          const candidateIndent = candidate.source.match(/^\s*/u)?.[0].length ?? 0;
          return /^\s*(?:for|while)\b/u.test(candidate.source) && candidateIndent < indent;
        });
        if (!inAggregateLoop) continue;
        return {
          code: "partial-composition-migration",
          path: file.path,
          line: entry.line,
          seam
        };
      }
    }
  }
  return null;
}
function parallelCompositionSeamFinding(diff) {
  for (const file of productionFiles(diff)) {
    const variadicSeams = new Set(variadicCompositionSeams(file));
    const publicSeams = [.../* @__PURE__ */ new Set([
      ...fixedArityCompositionSeams(file),
      ...removedCompositionSeams(file)
    ])].filter((seam) => !variadicSeams.has(seam));
    if (publicSeams.length === 0) continue;
    const additions = addedLines(file);
    for (const addition of additions) {
      const helperSignature = addition.source.match(
        /^\s*(?:def\s+|(?:static\s+)?(?:async\s+)?function\s+)?(_(?:merge|combine|order)[A-Za-z_$\d]*)\s*\(([^)]*)\)/iu
      );
      const helper = helperSignature?.[1];
      const parameters = helperSignature?.[2];
      if (!helper || parameters === void 0) continue;
      const hasMultiInputParameter = parameters.split(",").some((parameter) => /(?:lists|chains|groups|inputs|items)\b/iu.test(parameter.trim()));
      if (!hasMultiInputParameter) continue;
      const publicSeam = publicSeams.find((seam) => helper.toLowerCase().includes(seam.toLowerCase()));
      if (!publicSeam) continue;
      const callPattern = new RegExp(`(?:\\.|\\b)${escapeRegExp(helper)}\\s*\\(`, "u");
      const callCount = additions.filter(({ source }) => !FUNCTION_START.test(source) && callPattern.test(executableText(source))).length;
      if (callCount < 2) continue;
      return {
        code: "parallel-composition-seam",
        path: file.path,
        line: addition.line,
        helper,
        publicSeam
      };
    }
  }
  return null;
}
function candidateParts(candidate) {
  const match = candidate.match(/^([^:]+):(\d+):(.*)$/u);
  const path = match?.[1];
  const line = match?.[2];
  const source = match?.[3];
  if (!path || !line || !source || TEST_PATH.test(path) || GENERATED_PATH.test(path)) return null;
  const symbol = source.match(/\b(?:class|def|function)\s+([A-Za-z_$][\w$]*)/u)?.[1] ?? source.match(/\b([A-Za-z_$][\w$]*(?:topolog|depend|stable)[\w$]*)\b/iu)?.[1] ?? "";
  if (!symbol) return null;
  return { anchor: `${path}:${line}`, path, symbol };
}
function executableText(source) {
  return source.split("\n").map((line) => line.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/gu, "").replace(/\s*(?:\/\/|#).*$/u, "")).join("\n");
}
function orderingPrimitiveFinding(diff, candidates) {
  for (const file of productionFiles(diff)) {
    const added = file.lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).map((line) => line.slice(1)).join("\n");
    const executable = executableText(added);
    const hasNamedGraphState = /\b(?:dependencies|dependency_graph|indegree|successors)\b/iu.test(executable);
    const hasBeforeAfterGraph = /\bbefore\b/iu.test(executable) && /\bafter\b/iu.test(executable);
    const hasGraphState = hasNamedGraphState || hasBeforeAfterGraph;
    const hasExplicitFrontierState = /\b(?:ready|emitted|remaining|merged)\b/iu.test(executable);
    const hasMutatedFrontierAliases = /\bordered_?items\b/iu.test(executable) && /\bresult\s*\.\s*(?:append|push)\s*\(/iu.test(executable) && /\bordered_?items\s*\.\s*(?:pop|shift|splice)\s*\(/iu.test(executable);
    const hasFrontierState = hasExplicitFrontierState || hasMutatedFrontierAliases;
    const hasControlLoop = /^\s*(?:for|while)\s*(?:\(|\b)/mu.test(executable);
    if (!hasGraphState || !hasFrontierState || !hasControlLoop) continue;
    for (const rawCandidate of candidates) {
      const candidate = candidateParts(rawCandidate);
      if (!candidate || candidate.path === file.path) continue;
      if (new RegExp(`\\b${candidate.symbol.replace(/[$]/gu, "\\$")}\\b`, "u").test(executable)) continue;
      return {
        code: "repository-ordering-primitive-bypassed",
        path: file.path,
        candidate: candidate.anchor
      };
    }
  }
  return null;
}

// plugins/engineering-practice/src/entries/hooks/engineering-practice.ts
function warn(message) {
  process.stderr.write(`[engineering-practice] ${message}
`);
}
function engineeringPracticeContext() {
  return [
    "[Engineering Practice] Optional engineering method guidance",
    "Skills are optional method guides, not Hook prerequisites or completion evidence.",
    "For non-trivial implementation or refactoring, `engineering-judgment` can help control scope and tradeoffs.",
    "For a non-trivial fix, derive a compact observable contract before selecting code: value, type, container, shape, cardinality, order, stability, warning, error, and public API compatibility for existing accepted calls where applicable.",
    "A single example passing is not complete evidence. Challenge the proposed change with local callers, tests, documentation, and history, then prefer the smallest compatible repository-native mechanism.",
    "Compatibility means preserving proven accepted call forms and documented results, not incidental internal or container behavior without evidence.",
    "Use local evidence; do not hunt for hidden evaluator artifacts or solution patches. Treat unavailable evidence as unavailable.",
    "`engineering-review` is optional guidance; every read-only review finding still needs a P0-P3 severity, exact file:line, concrete evidence, and a verifiable fix or recovery path.",
    "Completion, fixed, passing, commit, or PR claims need fresh command evidence; `engineering-verification` can help select the checks.",
    "Use only helpful methods, or work directly. Hooks remain independent enforcement."
  ].join("\n");
}
var BOUNDARY_PROMPT = /\b(?:array|tensor|dimension|shape|broadcast|flatten|coerc|normaliz|empty|zero[- ]?(?:length|size)|boundary)\w*/iu;
var ORDERING_PROMPT = /\b(?:order(?:ed|ing)?|depend(?:ency|encies|ent|s)?|preced\w*|topolog\w*|cycle\w*|merge\w*|stable\w*)\b/iu;
var DIAGNOSTIC_DISPUTE_PROMPT = /(?:(?:warning|diagnostic|error\s+message)[\s\S]{0,120}\b(?:wrong|incorrect|misleading|unhelpful|arbitrary)\b|\b(?:wrong|incorrect|misleading|unhelpful|arbitrary)\b[\s\S]{0,120}(?:warning|diagnostic|message))/iu;
function boundaryChallengeContext() {
  return [
    "[Engineering Practice: boundary challenge]",
    "Treat the requested behavior as the contract candidate: a current exception or rejection is not compatibility proof unless local docs or callers require it.",
    "Before editing, write outcomes for all-empty, mixed empty/populated, and ordinary populated inputs. The mixed case must use unequal cardinality, such as zero items beside a singleton, so broadcast/coercion cannot hide which component still carries data.",
    "Locate the first lossy transform and branch before it when the required distinction would otherwise disappear; then rejoin the shared result path.",
    "For mixed unequal-cardinality inputs, do not synthesize one shared empty aggregate or matrix and split it back into components; preserve each original caller component separately.",
    "Add a durable mixed-case test that asserts each output component equals its corresponding input in both value and shape. Do not merely assert shapes or lock in the current exception."
  ].join("\n");
}
function orderingChallengeContext(diagnosticDisputed = false) {
  const context = [
    "[Engineering Practice: stable-order challenge]",
    "Before writing an ordering algorithm, run a repository-wide search for stable/topological/dependency ordering primitives and check the language standard library. Use an existing primitive unless the observable contract disproves it.",
    "Extend the named public seam rather than a parallel helper, and preserve zero, one, two, and many-input calls through that same normalization mechanism. Do not add a single-input side branch that performs its own deduplication or preserves an incidental input container; audit every aggregate caller and migrate sibling consumers through the widened public seam.",
    "Add a durable tie-break test with two independent chains of at least two items each. Stable ready-frontier means [a1\u2192a2] and [b1\u2192b2] with discovery order [a1,a2,b1,b2] yields [a1,b1,a2,b2], not [a1,a2,b1,b2].",
    "Test an adjacent duplicate in the same chain: it must not create a self-dependency or cycle. Also verify a genuine cycle fallback retains every distinct item supplied by every caller group, including items unique to later groups, and assert the exact diagnostic type and text."
  ];
  if (diagnosticDisputed) {
    context.push("The request disputes the diagnostic content. Report the original caller-supplied constraint groups\u2014the complete original input sequences\u2014as the caller-visible conflicting operands, not a pair of elements extracted from them or arbitrary internal cycle nodes. Preserve each collection boundary when rendering those groups; do not flatten every group into member text. Render the complete operands as one grammatical summary using project-conventional delimiters; do not retain an internal-node-oriented one-item-per-line layout unless local tests or documentation require it. Do not invent a lexical connector between peer operands; keep them on a single line with punctuation. When no exact local contract exists, default to comma-space between complete operands. If baseline tests or documentation already render complete peer collections, preserve their exact delimiter; do not rewrite tests or documentation to manufacture a different contract. Assert the exact diagnostic type and text against those original sequences.");
  }
  return context.join("\n");
}
function promptChallengeContext(event) {
  const prompt = eventPrompt(event);
  if (!prompt) return "";
  const contexts = [];
  if (BOUNDARY_PROMPT.test(prompt)) contexts.push(boundaryChallengeContext());
  if (ORDERING_PROMPT.test(prompt)) contexts.push(orderingChallengeContext(DIAGNOSTIC_DISPUTE_PROMPT.test(prompt)));
  return contexts.join("\n");
}
async function runSessionStart() {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", engineeringPracticeContext()));
}
async function runUserPromptSubmit() {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; prompt guidance was skipped");
  const context = promptChallengeContext(event);
  if (context) writeJson(additionalContext("UserPromptSubmit", context));
}
function gitOutput(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 8e3,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return "";
  }
}
async function runStop() {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; outcome challenge was skipped");
  const cwd = eventCwd(event);
  const root = gitOutput(cwd, ["rev-parse", "--show-toplevel"]).trim();
  if (!root) return;
  const diff = gitOutput(root, ["diff", "--no-ext-diff", "--unified=80", "HEAD", "--"]);
  if (!diff) return;
  const mixedRejection = mixedBoundaryRejectionFinding(diff);
  if (mixedRejection) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${mixedRejection.path}:${mixedRejection.line}: the change invents a mixed empty/populated rejection before lossy transform ${mixedRejection.transform}(). A new exception is not preservation evidence. Add a public-seam unequal-cardinality test that asserts every corresponding component's value and shape, then preserve that observable result; or cite local caller/documentation evidence that explicitly requires rejection.`
    ));
    return;
  }
  const mixedSynthesis = mixedBoundarySynthesisFinding(diff);
  if (mixedSynthesis) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${mixedSynthesis.path}:${mixedSynthesis.line}: shared empty aggregate ${mixedSynthesis.aggregate} is synthesized when any caller component is empty, then split back into components. This erases caller components that still carry data. Preserve each corresponding input's value and shape before the lossy transform, and prove the mixed unequal-cardinality result at the public seam.`
    ));
    return;
  }
  const mixedFreshEmpty = mixedBoundaryFreshEmptyFinding(diff);
  if (mixedFreshEmpty) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${mixedFreshEmpty.path}:${mixedFreshEmpty.line}: fresh empty components are synthesized after lossy transform ${mixedFreshEmpty.transform}(), so an earlier all-empty guard does not protect the mixed empty/populated contract. Remove the post-transform detour, preserve the original caller components before information is lost, and prove both mixed directions by value and shape at the public seam.`
    ));
    return;
  }
  const boundary = boundaryGuardFinding(diff);
  if (boundary) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${boundary.path}:${boundary.line}: the new empty-input guard is after lossy transform ${boundary.transform}(). Move the contract decision before that transform, and add a mixed unequal-cardinality test asserting each component's value and shape; or remove the short-circuit if local evidence disproves preservation.`
    ));
    return;
  }
  const variadicBypass = variadicSeamBypassFinding(diff);
  if (variadicBypass) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${variadicBypass.path}:${variadicBypass.line}: the new variadic seam returns ${variadicBypass.parameter}[0] unchanged for one input, bypassing the shared normalization contract. Route zero, one, two, and many inputs through the same deduplication/container mechanism, or cite local public-contract evidence that explicitly requires raw passthrough.`
    ));
    return;
  }
  const partialMigration = partialCompositionMigrationFinding(diff);
  if (partialMigration) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${partialMigration.path}:${partialMigration.line}: a sibling aggregate consumer still accumulates pairwise after another consumer migrated to variadic public seam ${partialMigration.seam}. Repository-search every caller and route each aggregate consumer through the widened seam so cross-group constraints are visible at once; add a sibling-consumer regression with three groups.`
    ));
    return;
  }
  const parallelSeam = parallelCompositionSeamFinding(diff);
  if (parallelSeam) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${parallelSeam.path}:${parallelSeam.line}: private multi-input helper ${parallelSeam.helper} was added beside fixed-arity named public seam ${parallelSeam.publicSeam}. Extend the named seam itself and route zero, one, two, and many inputs through it; do not leave accepted callers on a narrower parallel contract.`
    ));
    return;
  }
  const variadicDiagnostic = variadicDiagnosticFinding(diff);
  if (variadicDiagnostic) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${variadicDiagnostic.path}:${variadicDiagnostic.line}: the new variadic composition diagnostic formats extracted variable ${variadicDiagnostic.variable} instead of the complete caller-supplied input sequences. Keep the original groups through cycle handling and assert the exact warning/error text renders those full operands, not selected internal elements.`
    ));
    return;
  }
  const cycleFallback = variadicCycleFallbackFinding(diff);
  if (cycleFallback) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${cycleFallback.path}:${cycleFallback.line}: the cycle fallback returns only the first caller group from ${cycleFallback.parameter}, discarding distinct items supplied by later groups. Preserve stable first appearance across every group in the fallback, and test a cycle where both the first and a later group contain a unique item.`
    ));
    return;
  }
  const flattenedDiagnostic = variadicFlattenedDiagnosticFinding(diff);
  if (flattenedDiagnostic) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${flattenedDiagnostic.path}:${flattenedDiagnostic.line}: the new variadic diagnostic flattens caller groups from ${flattenedDiagnostic.parameter} into member text, erasing collection boundaries. Format each complete original group directly with project-conventional delimiters in one caller-level summary, and assert the exact diagnostic text.`
    ));
    return;
  }
  const contractRewrite = diagnosticContractRewriteFinding(diff);
  if (contractRewrite) {
    const after = contractRewrite.after === "," ? "comma (,)" : contractRewrite.after;
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${contractRewrite.path}:${contractRewrite.line}: the change rewrites a baseline diagnostic delimiter between complete peer operands from ${contractRewrite.before} to ${after} while changing the variadic implementation. Restore the existing test/documentation contract and make production satisfy it; do not rewrite baseline evidence to match the implementation.`
    ));
    return;
  }
  const novelDiagnosticStyle = variadicNovelDiagnosticStyleFinding(diff);
  if (novelDiagnosticStyle) {
    const style = novelDiagnosticStyle.style === "lexical-connector" ? "an invented lexical connector between caller groups" : "an invented multiline layout for caller groups";
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${novelDiagnosticStyle.path}:${novelDiagnosticStyle.line}: the new variadic diagnostic uses ${style}. Preserve an exact local diagnostic contract when one exists; otherwise render the complete peer operands on a single line with punctuation, defaulting to comma-space, and assert the exact text at the public seam.`
    ));
    return;
  }
  const candidates = gitOutput(root, [
    "grep",
    "-n",
    "-I",
    "-E",
    "stable_?(topological|dependency|order)|topological_?(sort|order)|stable(Topological|Dependency|Order)",
    "--"
  ]).split("\n").filter(Boolean);
  const ordering = orderingPrimitiveFinding(diff, candidates);
  if (ordering) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked: ${ordering.path} adds a hand-rolled dependency ordering loop while repository primitive ${ordering.candidate} exists. Reuse that primitive through the named seam, or add a public-seam counterexample proving it cannot satisfy the required ready-frontier, duplicate, cycle, and diagnostic contracts.`
    ));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? "session-start";
  const run = mode === "user-prompt" ? runUserPromptSubmit : mode === "stop" ? runStop : runSessionStart;
  run().catch((error) => warn(error instanceof Error ? error.message : String(error)));
}
export {
  boundaryChallengeContext,
  engineeringPracticeContext,
  orderingChallengeContext,
  promptChallengeContext,
  runSessionStart,
  runStop,
  runUserPromptSubmit
};
