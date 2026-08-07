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
];

export const DEFAULT_CHECKS = Object.freeze({
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

const VALID_MODES = new Set(["block", "report", "off"]);

export const MARKDOWN_EXTENSION =
  /\.(?:md|markdown|mdown|mkd)$/iu;

export const SKIP_PATH =
  /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;

const ATX_HEADING = /^( {0,3})(#{1,6})(.*)$/u;
const SETEXT_UNDERLINE = /^( {0,3})(=+|-+)[ \t]*$/u;
const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/u;

function warnDefault(message) {
  process.stderr.write(`[markdown-format-guard] ${message}\n`);
}

function normalizeMode(value, fallback, label, warn) {
  if (value === undefined) return fallback;
  if (VALID_MODES.has(value)) return value;
  warn(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}

export function resolveConfig(userConfig, warn = warnDefault) {
  const checks = { ...DEFAULT_CHECKS };
  if (
    userConfig?.checks !== undefined &&
    (!userConfig.checks ||
      typeof userConfig.checks !== "object" ||
      Array.isArray(userConfig.checks))
  ) {
    warn('config "checks" must be an object; using defaults');
  } else {
    for (const name of CHECK_NAMES) {
      checks[name] = normalizeMode(
        userConfig?.checks?.[name],
        checks[name],
        `checks.${name}`,
        warn,
      );
    }
  }

  const overrides = [];
  if (
    userConfig?.overrides !== undefined &&
    !Array.isArray(userConfig.overrides)
  ) {
    warn('config "overrides" must be an array; ignoring overrides');
  } else {
    for (const [index, override] of (userConfig?.overrides ?? []).entries()) {
      if (!override || !(override.match instanceof RegExp)) {
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
      const normalizedChecks = {};
      for (const name of CHECK_NAMES) {
        if (override.checks[name] === undefined) continue;
        const mode = normalizeMode(
          override.checks[name],
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

function regexMatches(pattern, value) {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}

export function modeFor(checkName, relativePath, config) {
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

export function isMarkdownPath(relativePath) {
  return MARKDOWN_EXTENSION.test(relativePath) && !SKIP_PATH.test(relativePath);
}

function splitLines(text) {
  // Keep line bodies without trailing \n; track whether file ends with newline separately.
  if (text.length === 0) return [];
  const parts = text.split("\n");
  if (text.endsWith("\n")) parts.pop();
  return parts;
}

function detectFrontMatterEnd(lines) {
  if (lines.length === 0) return 0;
  if (lines[0].trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---" || lines[i].trim() === "...") {
      return i + 1;
    }
  }
  // Unclosed front matter: treat as no front matter so content still checked.
  return 0;
}

function parseFenceMarker(line) {
  const match = line.match(FENCE_OPEN);
  if (!match) return null;
  const marker = match[2];
  const info = match[3] ?? "";
  // Closing fences cannot have non-whitespace info string content after marker.
  return {
    char: marker[0],
    length: marker.length,
    info: info.trim(),
    rawInfo: info,
  };
}

/**
 * Build a line-oriented view: inFence, headings, blank flags.
 */
export function buildDocumentModel(text) {
  const lines = splitLines(text);
  const endsWithNewline = text.length === 0 || text.endsWith("\n");
  const bodyStart = detectFrontMatterEnd(lines);

  const lineStates = lines.map((content, index) => ({
    line: index + 1,
    content,
    inFence: false,
    isBlank: content.trim() === "",
    isFrontMatter: index < bodyStart,
  }));

  let fence = null;
  for (let i = bodyStart; i < lines.length; i += 1) {
    const content = lines[i];
    if (fence) {
      lineStates[i].inFence = true;
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
      lineStates[i].inFence = true;
      fence = { char: open.char, length: open.length, openLine: i + 1, info: open.info };
      lineStates[i].fenceOpen = fence;
      continue;
    }
  }

  const headings = [];
  for (let i = bodyStart; i < lines.length; i += 1) {
    if (lineStates[i].inFence && !lineStates[i].fenceOpen) continue;
    // Opening fence line is not a heading.
    if (lineStates[i].fenceOpen) continue;

    const content = lines[i];
    const atx = content.match(ATX_HEADING);
    if (atx) {
      const hashes = atx[2];
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
    if (i + 1 < lines.length && !lineStates[i + 1].inFence) {
      const underline = lines[i + 1].match(SETEXT_UNDERLINE);
      if (
        underline &&
        content.trim() !== "" &&
        !content.startsWith("#") &&
        !parseFenceMarker(content)
      ) {
        const marker = underline[2];
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

function finding(check, line, message) {
  return { check, line, message };
}

export function runChecks(text, relativePath, config) {
  const model = buildDocumentModel(text);
  const findings = [];

  const enabled = (name) => {
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
            ...finding("hardTabs", state.line, "行内包含 Tab，请改用空格缩进"),
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
        if (trail === "  ") continue;
        if (trail.includes("\t")) {
          findings.push({
            mode,
            ...finding(
              "trailingWhitespace",
              state.line,
              "行尾含 Tab 或非法空白",
            ),
          });
          continue;
        }
        findings.push({
          mode,
          ...finding(
            "trailingWhitespace",
            state.line,
            `行尾有 ${trail.length} 个空格（仅允许恰好 2 个空格作硬换行）`,
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
                "连续空行超过 1 行",
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
          "文件必须以换行符结尾",
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
          "围栏代码块未闭合",
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
              "围栏代码块建议标注语言（例如 ```js）",
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
            "请使用 ATX 标题（# / ##），不要使用 Setext 下划线标题",
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
            "ATX 标题的 # 后必须有一个空格",
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
            "ATX 标题的 # 后只能有一个空格",
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
          ...finding("emptyHeading", heading.line, "标题不能为空"),
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
              "标题上方需要空行",
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
              "标题下方需要空行",
            ),
          });
        }
      }
    }
  }

  if (headingMode.headingIncrement) {
    let lastLevel = null;
    for (const heading of model.headings) {
      if (lastLevel !== null && heading.level > lastLevel + 1) {
        findings.push({
          mode: headingMode.headingIncrement,
          ...finding(
            "headingIncrement",
            heading.line,
            `标题层级从 h${lastLevel} 跳到 h${heading.level}，每次最多增加一级`,
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
            "全文只允许一个一级标题（h1）",
          ),
        });
      }
    }
  }

  return findings;
}

export function analyzeMarkdown(text, relativePath, config) {
  const findings = runChecks(text, relativePath, config);
  return {
    block: findings.filter((f) => f.mode === "block"),
    report: findings.filter((f) => f.mode === "report"),
  };
}
