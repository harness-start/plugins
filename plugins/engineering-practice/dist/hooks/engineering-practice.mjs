#!/usr/bin/env node
// harness-source-hash: sha256:c10a0d68932a1da084ccc0733f432061ae1a8448d0f1494e7851e1d8d2bbe905

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
var GENERATED_PATH = /(?:^|\/)(?:acceptance|dist|build|docs?|examples?|fixtures?|vendor|node_modules|\.git)(?:\/|$)/u;
var LOSSY_TRANSFORM = /\b((?:broadcast|flatten|coerc|normaliz|deduplic|align|stack|reshape)\w*)\s*\(/iu;
var EMPTY_GUARD = /\bif\b[^\n]*(?:\bempty\b|\bzero\b|\.size\b|\.length\b|\.shape\b)/iu;
var MIXED_EMPTY_GUARD = /\bif\b[^\n]*(?:\bany\s*\([^)]*(?:empty|sizes?)[^)]*\)|(?:empty|sizes?)\.some\s*\()[^\n]*(?:\bnot\s+all\s*\([^)]*(?:empty|sizes?)[^)]*\)|!\s*(?:empty|sizes?)\.every\s*\()/iu;
var REJECTION = /^\s*(?:raise\b|throw\b|return\s+(?:new\s+)?\w*Error\b)/iu;
var FUNCTION_START = /^\s*(?:(?:export\s+)?(?:async\s+)?function\s+|(?:async\s+)?def\s+)/u;
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
function variadicSeamBypassFinding(diff) {
  for (const file of productionFiles(diff)) {
    const additions = addedLines(file);
    if (!additions.some(({ source }) => variadicParameter(source))) continue;
    let input = "";
    let singleInputLine = 0;
    for (const addition of additions) {
      const candidate = singleInputExpression(addition.source);
      if (candidate && /(?:lists|chains|groups|inputs|items)$/u.test(candidate)) {
        input = candidate;
        singleInputLine = addition.line;
        continue;
      }
      const distance = addition.line - singleInputLine;
      if (input && distance > 0 && distance <= 4) {
        const rawReturn = new RegExp(`^\\s*return\\s+${escapeRegExp(input)}\\s*\\[\\s*0\\s*\\]`, "u");
        if (rawReturn.test(addition.source)) {
          return {
            code: "variadic-single-input-bypass",
            path: file.path,
            line: addition.line,
            parameter: input
          };
        }
      }
      if (distance > 4) input = "";
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
    const hasFrontierState = /\b(?:ready|emitted|remaining|merged)\b/iu.test(executable);
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
    "Add a durable mixed-case test that asserts each output component equals its corresponding input in both value and shape. Do not merely assert shapes or lock in the current exception."
  ].join("\n");
}
function orderingChallengeContext(diagnosticDisputed = false) {
  const context = [
    "[Engineering Practice: stable-order challenge]",
    "Before writing an ordering algorithm, run a repository-wide search for stable/topological/dependency ordering primitives and check the language standard library. Use an existing primitive unless the observable contract disproves it.",
    "Extend the named public seam rather than a parallel helper, and preserve zero, one, two, and many-input calls through that same normalization mechanism. Do not add a raw single-input passthrough that skips deduplication or changes the result container unless local evidence explicitly requires it.",
    "Add a durable tie-break test with two independent chains of at least two items each. Stable ready-frontier means [a1\u2192a2] and [b1\u2192b2] with discovery order [a1,a2,b1,b2] yields [a1,b1,a2,b2], not [a1,a2,b1,b2].",
    "Test an adjacent duplicate in the same chain: it must not create a self-dependency or cycle. Also verify a genuine cycle fallback and the exact diagnostic type and text."
  ];
  if (diagnosticDisputed) {
    context.push("The request disputes the diagnostic content. Report the original caller-supplied constraint groups\u2014the complete original input sequences\u2014as the caller-visible conflicting operands, not a pair of elements extracted from them or arbitrary internal cycle nodes. Assert the exact diagnostic type and text against those original sequences.");
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
  const variadicDiagnostic = variadicDiagnosticFinding(diff);
  if (variadicDiagnostic) {
    writeJson(stopBlock(
      `[Engineering Practice] Completion blocked at ${variadicDiagnostic.path}:${variadicDiagnostic.line}: the new variadic composition diagnostic formats extracted variable ${variadicDiagnostic.variable} instead of the complete caller-supplied input sequences. Keep the original groups through cycle handling and assert the exact warning/error text renders those full operands, not selected internal elements.`
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
