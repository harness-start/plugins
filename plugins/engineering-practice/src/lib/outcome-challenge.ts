export type BoundaryGuardFinding = {
  code: "lossy-boundary-guard-order";
  path: string;
  line: number;
  transform: string;
};

export type OrderingPrimitiveFinding = {
  code: "repository-ordering-primitive-bypassed";
  path: string;
  candidate: string;
};

export type MixedBoundaryRejectionFinding = {
  code: "mixed-boundary-rejection";
  path: string;
  line: number;
  transform: string;
};

export type VariadicSeamBypassFinding = {
  code: "variadic-single-input-bypass";
  path: string;
  line: number;
  parameter: string;
};

export type VariadicDiagnosticFinding = {
  code: "variadic-internal-diagnostic";
  path: string;
  line: number;
  variable: string;
};

const TEST_PATH = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/iu;
const GENERATED_PATH = /(?:^|\/)(?:acceptance|dist|build|docs?|examples?|fixtures?|vendor|node_modules|\.git)(?:\/|$)/u;
const LOSSY_TRANSFORM = /\b((?:broadcast|flatten|coerc|normaliz|deduplic|align|stack|reshape)\w*)\s*\(/iu;
const EMPTY_GUARD = /\bif\b[^\n]*(?:\bempty\b|\bzero\b|\.size\b|\.length\b|\.shape\b)/iu;
const MIXED_EMPTY_GUARD = /\bif\b[^\n]*(?:\bany\s*\([^)]*(?:empty|sizes?)[^)]*\)|(?:empty|sizes?)\.some\s*\()[^\n]*(?:\bnot\s+all\s*\([^)]*(?:empty|sizes?)[^)]*\)|!\s*(?:empty|sizes?)\.every\s*\()/iu;
const REJECTION = /^\s*(?:raise\b|throw\b|return\s+(?:new\s+)?\w*Error\b)/iu;
const FUNCTION_START = /^\s*(?:(?:export\s+)?(?:async\s+)?function\s+|(?:async\s+)?def\s+)/u;

type DiffFile = { path: string; lines: string[] };
type AddedLine = { line: number; source: string };

function diffFiles(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  for (const block of diff.split(/^diff --git /mu).slice(1)) {
    const header = block.match(/^a\/\S+ b\/(\S+)/u);
    const path = header?.[1];
    if (path) files.push({ path, lines: block.split("\n") });
  }
  return files;
}

function productionFiles(diff: string): DiffFile[] {
  return diffFiles(diff).filter(({ path }) => !TEST_PATH.test(path) && !GENERATED_PATH.test(path));
}

function addedLines(file: DiffFile): AddedLine[] {
  const added: AddedLine[] = [];
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

export function boundaryGuardFinding(diff: string): BoundaryGuardFinding | null {
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
            transform,
          };
        }
        newLine += 1;
      }
    }
  }
  return null;
}

export function mixedBoundaryRejectionFinding(diff: string): MixedBoundaryRejectionFinding | null {
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
            transform: lossyTransform,
          };
        }
        newLine += 1;
      }
    }
  }
  return null;
}

function variadicParameter(source: string): string {
  return source.match(/\bdef\s+\w+\s*\(\s*\*([A-Za-z_]\w*)/u)?.[1]
    ?? source.match(/(?:\bfunction\s+\w+|\b\w+)\s*\([^)]*\.\.\.([A-Za-z_$][\w$]*)/u)?.[1]
    ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function singleInputExpression(source: string): string {
  const expression = "([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)";
  return source.match(new RegExp(`\\bif\\b[^\\n]*len\\s*\\(\\s*${expression}\\s*\\)\\s*={2,3}\\s*1`, "u"))?.[1]
    ?? source.match(new RegExp(`\\bif\\b[^\\n]*${expression}\\.length\\s*={2,3}\\s*1`, "u"))?.[1]
    ?? "";
}

export function variadicSeamBypassFinding(diff: string): VariadicSeamBypassFinding | null {
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
            parameter: input,
          };
        }
      }
      if (distance > 4) input = "";
    }
  }
  return null;
}

export function variadicDiagnosticFinding(diff: string): VariadicDiagnosticFinding | null {
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
        const variable = formatting.match(/%\s*(?:\(\s*)?([A-Za-z_]\w*)\b/u)?.[1]
          ?? formatting.match(/\.format\(\s*([A-Za-z_]\w*)\b/u)?.[1]
          ?? "";
        if (!variable) continue;
        const assignments = additions
          .filter(({ source }) => new RegExp(`\\b${escapeRegExp(variable)}\\s*=`, "u").test(source))
          .map(({ source }) => source)
          .join("\n");
        const callerGroups = parameters.includes(variable)
          || parameters.some((parameter) => new RegExp(`\\b${escapeRegExp(parameter)}\\b`, "u").test(assignments))
          || /\b(?:chains|lists|groups|inputs|operands|constraints)\b/iu.test(assignments);
        if (!callerGroups) {
          return {
            code: "variadic-internal-diagnostic",
            path: file.path,
            line: entry.line,
            variable,
          };
        }
      }
    }
  }
  return null;
}

function candidateParts(candidate: string): { anchor: string; path: string; symbol: string } | null {
  const match = candidate.match(/^([^:]+):(\d+):(.*)$/u);
  const path = match?.[1];
  const line = match?.[2];
  const source = match?.[3];
  if (!path || !line || !source || TEST_PATH.test(path) || GENERATED_PATH.test(path)) return null;
  const symbol = source.match(/\b(?:class|def|function)\s+([A-Za-z_$][\w$]*)/u)?.[1]
    ?? source.match(/\b([A-Za-z_$][\w$]*(?:topolog|depend|stable)[\w$]*)\b/iu)?.[1]
    ?? "";
  if (!symbol) return null;
  return { anchor: `${path}:${line}`, path, symbol };
}

function executableText(source: string): string {
  return source
    .split("\n")
    .map((line) => line
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/gu, "")
      .replace(/\s*(?:\/\/|#).*$/u, ""))
    .join("\n");
}

export function orderingPrimitiveFinding(
  diff: string,
  candidates: readonly string[],
): OrderingPrimitiveFinding | null {
  for (const file of productionFiles(diff)) {
    const added = file.lines
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .map((line) => line.slice(1))
      .join("\n");
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
        candidate: candidate.anchor,
      };
    }
  }
  return null;
}
