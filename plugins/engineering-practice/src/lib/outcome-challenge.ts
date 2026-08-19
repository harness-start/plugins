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

const TEST_PATH = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/iu;
const GENERATED_PATH = /(?:^|\/)(?:acceptance|dist|build|docs?|examples?|fixtures?|vendor|node_modules|\.git)(?:\/|$)/u;
const LOSSY_TRANSFORM = /\b((?:broadcast|flatten|coerc|normaliz|deduplic|align|stack|reshape)\w*)\s*\(/iu;
const EMPTY_GUARD = /\bif\b[^\n]*(?:\bempty\b|\bzero\b|\.size\b|\.length\b|\.shape\b)/iu;
const MIXED_EMPTY_GUARD = /\bif\b[^\n]*(?:\bany\s*\([^)]*(?:empty|sizes?)[^)]*\)|(?:empty|sizes?)\.some\s*\()[^\n]*(?:\bnot\s+all\s*\([^)]*(?:empty|sizes?)[^)]*\)|!\s*(?:empty|sizes?)\.every\s*\()/iu;
const REJECTION = /^\s*(?:raise\b|throw\b|return\s+(?:new\s+)?\w*Error\b)/iu;
const FUNCTION_START = /^\s*(?:(?:export\s+)?(?:async\s+)?function\s+|(?:async\s+)?def\s+)/u;

type DiffFile = { path: string; lines: string[] };

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

export function variadicSeamBypassFinding(diff: string): VariadicSeamBypassFinding | null {
  for (const file of productionFiles(diff)) {
    let newLine = 0;
    let parameter = "";
    let singleInputBudget = 0;
    for (const rawLine of file.lines) {
      const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u);
      const hunkLine = hunk?.[1];
      if (hunkLine) {
        newLine = Number.parseInt(hunkLine, 10);
        singleInputBudget = 0;
        continue;
      }
      if (newLine === 0 || rawLine.startsWith("---") || rawLine.startsWith("+++")) continue;
      const removed = rawLine.startsWith("-");
      const added = rawLine.startsWith("+");
      const source = rawLine.slice(1);
      if (!removed) {
        const addedParameter = added ? variadicParameter(source) : "";
        if (FUNCTION_START.test(source) && !addedParameter) parameter = "";
        if (addedParameter) parameter = addedParameter;
        if (parameter) {
          const escaped = parameter.replace(/[$]/gu, "\\$");
          const singleInput = new RegExp(`\\bif\\b[^\\n]*(?:len\\s*\\(\\s*${escaped}\\s*\\)\\s*={2,3}\\s*1|${escaped}\\.length\\s*={2,3}\\s*1)`, "u");
          if (added && singleInput.test(source)) singleInputBudget = 4;
          else if (singleInputBudget > 0) singleInputBudget -= 1;
          const rawReturn = new RegExp(`^\\s*return\\s+${escaped}\\s*\\[\\s*0\\s*\\]`, "u");
          if (added && singleInputBudget > 0 && rawReturn.test(source)) {
            return {
              code: "variadic-single-input-bypass",
              path: file.path,
              line: newLine,
              parameter,
            };
          }
        }
        newLine += 1;
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
