import { isRecord } from "@harness/core/hook-event";

export const CHECK_NAMES = [
  "headingIncrement",
  "headingStyle",
  "headingSpace",
  "emptyHeading",
  "headingBlankLines",
  "hardTabs",
  "trailingWhitespace",
  "multipleBlankLines",
  "finalNewline",
  "fencedCodeClosed",
  "fencedCodeLanguage",
  "singleH1",
] as const;

export type MarkdownCheckName = (typeof CHECK_NAMES)[number];
export type MarkdownCheckMode = "block" | "report" | "off";
export type MarkdownChecks = Record<MarkdownCheckName, MarkdownCheckMode>;
export type MarkdownOverride = {
  match: RegExp;
  checks: Partial<MarkdownChecks>;
};
export type MarkdownConfig = {
  checks: MarkdownChecks;
  overrides: MarkdownOverride[];
};
export type MarkdownFinding = {
  check: MarkdownCheckName;
  line: number;
  message: string;
  mode: MarkdownCheckMode;
};

export const DEFAULT_CHECKS: Readonly<MarkdownChecks> = Object.freeze({
  headingIncrement: "block",
  headingStyle: "block",
  headingSpace: "block",
  emptyHeading: "block",
  headingBlankLines: "block",
  hardTabs: "block",
  trailingWhitespace: "block",
  multipleBlankLines: "block",
  finalNewline: "block",
  fencedCodeClosed: "block",
  fencedCodeLanguage: "report",
  singleH1: "off",
});

function isCheckMode(value: unknown): value is MarkdownCheckMode {
  return value === "block" || value === "report" || value === "off";
}

export const MARKDOWN_EXTENSION =
  /\.(?:md|markdown|mdown|mkd)$/iu;

export const SKIP_PATH =
  /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;

const ATX_HEADING = /^( {0,3})(#{1,6})(.*)$/u;
const SETEXT_UNDERLINE = /^( {0,3})(=+|-+)[ \t]*$/u;
const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/u;

function warnDefault(message: string): void {
  process.stderr.write(`[engineering-quality] ${message}\n`);
}

function normalizeMode<T extends MarkdownCheckMode | null>(
  value: unknown,
  fallback: T,
  label: string,
  warn: (message: string) => void,
): MarkdownCheckMode | T {
  if (value === undefined) return fallback;
  if (isCheckMode(value)) return value;
  warn(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}

export function resolveConfig(
  userConfig: unknown,
  warn: (message: string) => void = warnDefault,
): MarkdownConfig {
  const record = isRecord(userConfig) ? userConfig : undefined;
  const checks: MarkdownChecks = { ...DEFAULT_CHECKS };
  if (
    record?.checks !== undefined &&
    (!record.checks ||
      typeof record.checks !== "object" ||
      Array.isArray(record.checks))
  ) {
    warn('config "checks" must be an object; using defaults');
  } else {
    const checksSource = isRecord(record?.checks) ? record.checks : undefined;
    for (const name of CHECK_NAMES) {
      checks[name] = normalizeMode(
        checksSource?.[name],
        checks[name],
        `checks.${name}`,
        warn,
      );
    }
  }

  const overrides: MarkdownOverride[] = [];
  if (
    record?.overrides !== undefined &&
    !Array.isArray(record.overrides)
  ) {
    warn('config "overrides" must be an array; ignoring overrides');
  } else {
    const rawOverrides = Array.isArray(record?.overrides) ? record.overrides : [];
    for (const [index, override] of rawOverrides.entries()) {
      if (!isRecord(override) || !(override.match instanceof RegExp)) {
        warn(`override[${index}].match must be a RegExp; skipping`);
        continue;
      }
      if (
        !override.checks ||
        typeof override.checks !== "object" ||
        Array.isArray(override.checks)
      ) {
        warn(`override[${index}].checks must be an object; skipping`);
        continue;
      }
      const overrideChecks = isRecord(override.checks) ? override.checks : {};
      const normalizedChecks: Partial<MarkdownChecks> = {};
      for (const name of CHECK_NAMES) {
        if (overrideChecks[name] === undefined) continue;
        const mode = normalizeMode(
          overrideChecks[name],
          null,
          `override[${index}].checks.${name}`,
          warn,
        );
        if (mode) normalizedChecks[name] = mode;
      }
      if (Object.keys(normalizedChecks).length === 0) {
        warn(`override[${index}] has no valid checks; skipping`);
        continue;
      }
      overrides.push({ match: override.match, checks: normalizedChecks });
    }
  }
  return { checks, overrides };
}

function regexMatches(pattern: RegExp, value: string): boolean {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}

export function modeFor(checkName: MarkdownCheckName, relativePath: string, config: MarkdownConfig): MarkdownCheckMode {
  for (const override of config.overrides) {
    if (
      override.checks[checkName] !== undefined &&
      regexMatches(override.match, relativePath)
    ) {
      return override.checks[checkName];
    }
  }
  return config.checks[checkName] ?? "off";
}

export function isMarkdownPath(relativePath: string): boolean {
  return MARKDOWN_EXTENSION.test(relativePath) && !SKIP_PATH.test(relativePath);
}

function splitLines(text: string): string[] {
  // Keep line bodies without trailing \n; track whether file ends with newline separately.
  if (text.length === 0) return [];
  const parts = text.split("\n");
  if (text.endsWith("\n")) parts.pop();
  return parts;
}

function detectFrontMatterEnd(lines: readonly string[]): number {
  if (lines.length === 0) return 0;
  const first = lines[0];
  if (first === undefined || first.trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line !== undefined && (line.trim() === "---" || line.trim() === "...")) {
      return i + 1;
    }
  }
  // Unclosed front matter: treat as no front matter so content still checked.
  return 0;
}

type FenceMarker = {
  char: string;
  length: number;
  info: string;
  rawInfo: string;
};

function parseFenceMarker(line: string): FenceMarker | null {
  const match = line.match(FENCE_OPEN);
  if (!match) return null;
  const marker = match[2];
  if (!marker) return null;
  const info = match[3] ?? "";
  const char = marker[0];
  if (char === undefined) return null;
  // Closing fences cannot have non-whitespace info string content after marker.
  return {
    char,
    length: marker.length,
    info: info.trim(),
    rawInfo: info,
  };
}

/**
 * Build a line-oriented view: inFence, headings, blank flags.
 */
type FenceOpen = {
  char: string;
  length: number;
  openLine: number;
  info: string;
};

type LineState = {
  line: number;
  content: string;
  inFence: boolean;
  isBlank: boolean;
  isFrontMatter: boolean;
  fenceOpen?: FenceOpen;
};

type Heading = {
  line: number;
  level: number;
  style: "atx" | "setext";
  hashes: string;
  rest: string;
  text: string;
  index: number;
  underlineLine?: number;
};

export type DocumentModel = {
  lines: string[];
  lineStates: LineState[];
  headings: Heading[];
  bodyStart: number;
  endsWithNewline: boolean;
  unclosedFence: FenceOpen | null;
};

export function buildDocumentModel(text: string): DocumentModel {
  const lines = splitLines(text);
  const endsWithNewline = text.length === 0 || text.endsWith("\n");
  const bodyStart = detectFrontMatterEnd(lines);

  const lineStates: LineState[] = lines.map((content, index) => ({
    line: index + 1,
    content,
    inFence: false,
    isBlank: content.trim() === "",
    isFrontMatter: index < bodyStart,
  }));

  let fence: FenceOpen | null = null;
  for (let i = bodyStart; i < lines.length; i += 1) {
    const content = lines[i];
    const state = lineStates[i];
    if (content === undefined || !state) continue;
    if (fence) {
      state.inFence = true;
      const close = parseFenceMarker(content);
      if (
        close &&
        close.char === fence.char &&
        close.length >= fence.length &&
        close.rawInfo.trim() === ""
      ) {
        fence = null;
      }
      continue;
    }

    const open = parseFenceMarker(content);
    if (open) {
      state.inFence = true;
      fence = { char: open.char, length: open.length, openLine: i + 1, info: open.info };
      state.fenceOpen = fence;
      continue;
    }
  }

  const headings: Heading[] = [];
  for (let i = bodyStart; i < lines.length; i += 1) {
    const state = lineStates[i];
    if (!state) continue;
    if (state.inFence && !state.fenceOpen) continue;
    // Opening fence line is not a heading.
    if (state.fenceOpen) continue;

    const content = lines[i];
    if (content === undefined) continue;
    const atx = content.match(ATX_HEADING);
    if (atx) {
      const hashes = atx[2];
      if (!hashes) continue;
      const rest = atx[3] ?? "";
      headings.push({
        line: i + 1,
        level: hashes.length,
        style: "atx",
        hashes,
        rest,
        text: rest.replace(/^\s+/u, "").replace(/\s+#*\s*$/u, ""),
        index: i,
      });
      continue;
    }

    // Setext: current non-blank line + next underline, not in fence.
    const nextState = lineStates[i + 1];
    const nextLine = lines[i + 1];
    if (i + 1 < lines.length && nextState && !nextState.inFence && nextLine !== undefined) {
      const underline = nextLine.match(SETEXT_UNDERLINE);
      if (
        underline &&
        content.trim() !== "" &&
        !content.startsWith("#") &&
        !parseFenceMarker(content)
      ) {
        const marker = underline[2];
        if (!marker) continue;
        headings.push({
          line: i + 1,
          level: marker.startsWith("=") ? 1 : 2,
          style: "setext",
          hashes: "",
          rest: content,
          text: content.trim(),
          index: i,
          underlineLine: i + 2,
        });
        i += 1; // skip underline
      }
    }
  }

  return {
    lines,
    lineStates,
    headings,
    bodyStart,
    endsWithNewline,
    unclosedFence: fence,
  };
}

function finding(check: MarkdownCheckName, line: number, message: string): Omit<MarkdownFinding, "mode"> {
  return { check, line, message };
}

export function runChecks(text: string, relativePath: string, config: MarkdownConfig): MarkdownFinding[] {
  const model = buildDocumentModel(text);
  const findings: MarkdownFinding[] = [];

  const enabled = (name: MarkdownCheckName): MarkdownCheckMode | null => {
    const mode = modeFor(name, relativePath, config);
    return mode === "off" ? null : mode;
  };

  // hardTabs
  {
    const mode = enabled("hardTabs");
    if (mode) {
      for (const state of model.lineStates) {
        if (state.isFrontMatter) continue;
        if (state.content.includes("\t")) {
          findings.push({
            mode,
            ...finding("hardTabs", state.line, "Line contains a tab; use spaces for indentation"),
          });
        }
      }
    }
  }

  // trailingWhitespace — allow exactly two spaces (hard line break)
  {
    const mode = enabled("trailingWhitespace");
    if (mode) {
      for (const state of model.lineStates) {
        if (state.isFrontMatter) continue;
        const match = state.content.match(/^(.*?)([ \t]+)$/u);
        if (!match) continue;
        const trail = match[2];
        if (trail === undefined || trail === "  ") continue;
        if (trail.includes("\t")) {
          findings.push({
            mode,
            ...finding(
              "trailingWhitespace",
              state.line,
              "Line ends with a tab or invalid whitespace",
            ),
          });
          continue;
        }
        findings.push({
          mode,
          ...finding(
            "trailingWhitespace",
            state.line,
            `Line ends with ${trail.length} spaces (only exactly 2 spaces are allowed for a hard line break)`,
          ),
        });
      }
    }
  }

  // multipleBlankLines
  {
    const mode = enabled("multipleBlankLines");
    if (mode) {
      let blankRun = 0;
      let blankStart = 0;
      for (const state of model.lineStates) {
        if (state.isFrontMatter) {
          blankRun = 0;
          continue;
        }
        if (state.inFence && !state.fenceOpen) {
          blankRun = 0;
          continue;
        }
        if (state.isBlank) {
          if (blankRun === 0) blankStart = state.line;
          blankRun += 1;
          if (blankRun === 2) {
            findings.push({
              mode,
              ...finding(
                "multipleBlankLines",
                blankStart,
                "More than one consecutive blank line",
              ),
            });
          }
        } else {
          blankRun = 0;
        }
      }
    }
  }

  // finalNewline
  {
    const mode = enabled("finalNewline");
    if (mode && text.length > 0 && !model.endsWithNewline) {
      findings.push({
        mode,
        ...finding(
          "finalNewline",
          model.lines.length || 1,
          "File must end with a newline",
        ),
      });
    }
  }

  // fencedCodeClosed
  {
    const mode = enabled("fencedCodeClosed");
    if (mode && model.unclosedFence) {
      findings.push({
        mode,
        ...finding(
          "fencedCodeClosed",
          model.unclosedFence.openLine,
          "Fenced code block is not closed",
        ),
      });
    }
  }

  // fencedCodeLanguage
  {
    const mode = enabled("fencedCodeLanguage");
    if (mode) {
      for (const state of model.lineStates) {
        if (!state.fenceOpen) continue;
        if (!state.fenceOpen.info) {
          findings.push({
            mode,
            ...finding(
              "fencedCodeLanguage",
              state.line,
              "Fenced code blocks should declare a language (for example, ```js)",
            ),
          });
        }
      }
    }
  }

  // Heading-related checks
  const headingMode = {
    headingStyle: enabled("headingStyle"),
    headingSpace: enabled("headingSpace"),
    emptyHeading: enabled("emptyHeading"),
    headingBlankLines: enabled("headingBlankLines"),
    headingIncrement: enabled("headingIncrement"),
    singleH1: enabled("singleH1"),
  };

  if (headingMode.headingStyle) {
    for (const heading of model.headings) {
      if (heading.style === "setext") {
        findings.push({
          mode: headingMode.headingStyle,
          ...finding(
            "headingStyle",
            heading.line,
            "Use ATX headings (# / ##) instead of Setext underlined headings",
          ),
        });
      }
    }
  }

  if (headingMode.headingSpace) {
    for (const heading of model.headings) {
      if (heading.style !== "atx") continue;
      const rest = heading.rest;
      if (rest === "") continue; // empty handled separately
      if (!rest.startsWith(" ")) {
        findings.push({
          mode: headingMode.headingSpace,
          ...finding(
            "headingSpace",
            heading.line,
            "An ATX heading must have one space after #",
          ),
        });
        continue;
      }
      if (rest.startsWith("  ") && rest.trim() !== "") {
        findings.push({
          mode: headingMode.headingSpace,
          ...finding(
            "headingSpace",
            heading.line,
            "An ATX heading must have exactly one space after #",
          ),
        });
      }
    }
  }

  if (headingMode.emptyHeading) {
    for (const heading of model.headings) {
      if (heading.text === "") {
        findings.push({
          mode: headingMode.emptyHeading,
          ...finding("emptyHeading", heading.line, "Heading must not be empty"),
        });
      }
    }
  }

  if (headingMode.headingBlankLines) {
    for (const heading of model.headings) {
      const idx = heading.index;
      // Need blank line above (unless first body line or previous is blank / front-matter boundary)
      if (idx > model.bodyStart) {
        const prev = model.lineStates[idx - 1];
        if (prev && !prev.isBlank && !prev.isFrontMatter) {
          // setext underline pair: if previous is another heading's content? only check immediate prev
          findings.push({
            mode: headingMode.headingBlankLines,
            ...finding(
              "headingBlankLines",
              heading.line,
              "A blank line is required above the heading",
            ),
          });
        }
      }
      // Need blank line below (unless last line).
      // setext underlineLine is 1-based; next content is that index (0-based = underlineLine).
      const nextIndex =
        heading.style === "setext" && heading.underlineLine
          ? heading.underlineLine
          : idx + 1;
      if (nextIndex < model.lines.length) {
        const next = model.lineStates[nextIndex];
        if (next && !next.isBlank) {
          findings.push({
            mode: headingMode.headingBlankLines,
            ...finding(
              "headingBlankLines",
              heading.line,
              "A blank line is required below the heading",
            ),
          });
        }
      }
    }
  }

  if (headingMode.headingIncrement) {
    let lastLevel: number | null = null;
    for (const heading of model.headings) {
      if (lastLevel !== null && heading.level > lastLevel + 1) {
        findings.push({
          mode: headingMode.headingIncrement,
          ...finding(
            "headingIncrement",
            heading.line,
            `Heading level jumps from h${lastLevel} to h${heading.level}; increase by at most one level`,
          ),
        });
      }
      lastLevel = heading.level;
    }
  }

  if (headingMode.singleH1) {
    const h1s = model.headings.filter((h) => h.level === 1);
    if (h1s.length > 1) {
      for (const heading of h1s.slice(1)) {
        findings.push({
          mode: headingMode.singleH1,
          ...finding(
            "singleH1",
            heading.line,
            "Only one level-one heading (h1) is allowed per document",
          ),
        });
      }
    }
  }

  return findings;
}

export function analyzeMarkdown(
  text: string,
  relativePath: string,
  config: MarkdownConfig,
): { block: MarkdownFinding[]; report: MarkdownFinding[] } {
  const findings = runChecks(text, relativePath, config);
  return {
    block: findings.filter((f) => f.mode === "block"),
    report: findings.filter((f) => f.mode === "report"),
  };
}
