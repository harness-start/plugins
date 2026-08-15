#!/usr/bin/env node
// harness-source-hash: sha256:602baa5083db91adad7becbacab88efa8d46b0feeca08afe20d1d3b3edce133c

// plugins/markdown-format-guard/src/entries/hooks/markdown-format-guard.ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve as resolve2 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// plugins/markdown-format-guard/src/lib/markdown-policy.ts
var CHECK_NAMES = [
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
  "singleH1"
];
var DEFAULT_CHECKS = Object.freeze({
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
  singleH1: "off"
});
var VALID_MODES = /* @__PURE__ */ new Set(["block", "report", "off"]);
var MARKDOWN_EXTENSION = /\.(?:md|markdown|mdown|mkd)$/iu;
var SKIP_PATH = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
var ATX_HEADING = /^( {0,3})(#{1,6})(.*)$/u;
var SETEXT_UNDERLINE = /^( {0,3})(=+|-+)[ \t]*$/u;
var FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/u;
function warnDefault(message) {
  process.stderr.write(`[markdown-format-guard] ${message}
`);
}
function normalizeMode(value, fallback, label, warn) {
  if (value === void 0) return fallback;
  if (VALID_MODES.has(value)) return value;
  warn(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}
function resolveConfig(userConfig, warn = warnDefault) {
  const checks = { ...DEFAULT_CHECKS };
  if (userConfig?.checks !== void 0 && (!userConfig.checks || typeof userConfig.checks !== "object" || Array.isArray(userConfig.checks))) {
    warn('config "checks" must be an object; using defaults');
  } else {
    for (const name of CHECK_NAMES) {
      checks[name] = normalizeMode(
        userConfig?.checks?.[name],
        checks[name],
        `checks.${name}`,
        warn
      );
    }
  }
  const overrides = [];
  if (userConfig?.overrides !== void 0 && !Array.isArray(userConfig.overrides)) {
    warn('config "overrides" must be an array; ignoring overrides');
  } else {
    for (const [index, override] of (userConfig?.overrides ?? []).entries()) {
      if (!override || !(override.match instanceof RegExp)) {
        warn(`override[${index}].match must be a RegExp; skipping`);
        continue;
      }
      if (!override.checks || typeof override.checks !== "object" || Array.isArray(override.checks)) {
        warn(`override[${index}].checks must be an object; skipping`);
        continue;
      }
      const normalizedChecks = {};
      for (const name of CHECK_NAMES) {
        if (override.checks[name] === void 0) continue;
        const mode = normalizeMode(
          override.checks[name],
          null,
          `override[${index}].checks.${name}`,
          warn
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
function modeFor(checkName, relativePath, config) {
  for (const override of config.overrides) {
    if (override.checks[checkName] !== void 0 && regexMatches(override.match, relativePath)) {
      return override.checks[checkName];
    }
  }
  return config.checks[checkName] ?? "off";
}
function isMarkdownPath(relativePath) {
  return MARKDOWN_EXTENSION.test(relativePath) && !SKIP_PATH.test(relativePath);
}
function splitLines(text) {
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
  return 0;
}
function parseFenceMarker(line) {
  const match = line.match(FENCE_OPEN);
  if (!match) return null;
  const marker = match[2];
  const info = match[3] ?? "";
  return {
    char: marker[0],
    length: marker.length,
    info: info.trim(),
    rawInfo: info
  };
}
function buildDocumentModel(text) {
  const lines = splitLines(text);
  const endsWithNewline = text.length === 0 || text.endsWith("\n");
  const bodyStart = detectFrontMatterEnd(lines);
  const lineStates = lines.map((content, index) => ({
    line: index + 1,
    content,
    inFence: false,
    isBlank: content.trim() === "",
    isFrontMatter: index < bodyStart
  }));
  let fence = null;
  for (let i = bodyStart; i < lines.length; i += 1) {
    const content = lines[i];
    if (fence) {
      lineStates[i].inFence = true;
      const close = parseFenceMarker(content);
      if (close && close.char === fence.char && close.length >= fence.length && close.rawInfo.trim() === "") {
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
        index: i
      });
      continue;
    }
    if (i + 1 < lines.length && !lineStates[i + 1].inFence) {
      const underline = lines[i + 1].match(SETEXT_UNDERLINE);
      if (underline && content.trim() !== "" && !content.startsWith("#") && !parseFenceMarker(content)) {
        const marker = underline[2];
        headings.push({
          line: i + 1,
          level: marker.startsWith("=") ? 1 : 2,
          style: "setext",
          hashes: "",
          rest: content,
          text: content.trim(),
          index: i,
          underlineLine: i + 2
        });
        i += 1;
      }
    }
  }
  return {
    lines,
    lineStates,
    headings,
    bodyStart,
    endsWithNewline,
    unclosedFence: fence
  };
}
function finding(check, line, message) {
  return { check, line, message };
}
function runChecks(text, relativePath, config) {
  const model = buildDocumentModel(text);
  const findings = [];
  const enabled = (name) => {
    const mode = modeFor(name, relativePath, config);
    return mode === "off" ? null : mode;
  };
  {
    const mode = enabled("hardTabs");
    if (mode) {
      for (const state of model.lineStates) {
        if (state.isFrontMatter) continue;
        if (state.content.includes("	")) {
          findings.push({
            mode,
            ...finding("hardTabs", state.line, "Line contains a tab; use spaces for indentation")
          });
        }
      }
    }
  }
  {
    const mode = enabled("trailingWhitespace");
    if (mode) {
      for (const state of model.lineStates) {
        if (state.isFrontMatter) continue;
        const match = state.content.match(/^(.*?)([ \t]+)$/u);
        if (!match) continue;
        const trail = match[2];
        if (trail === "  ") continue;
        if (trail.includes("	")) {
          findings.push({
            mode,
            ...finding(
              "trailingWhitespace",
              state.line,
              "Line ends with a tab or invalid whitespace"
            )
          });
          continue;
        }
        findings.push({
          mode,
          ...finding(
            "trailingWhitespace",
            state.line,
            `Line ends with ${trail.length} spaces (only exactly 2 spaces are allowed for a hard line break)`
          )
        });
      }
    }
  }
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
                "More than one consecutive blank line"
              )
            });
          }
        } else {
          blankRun = 0;
        }
      }
    }
  }
  {
    const mode = enabled("finalNewline");
    if (mode && text.length > 0 && !model.endsWithNewline) {
      findings.push({
        mode,
        ...finding(
          "finalNewline",
          model.lines.length || 1,
          "File must end with a newline"
        )
      });
    }
  }
  {
    const mode = enabled("fencedCodeClosed");
    if (mode && model.unclosedFence) {
      findings.push({
        mode,
        ...finding(
          "fencedCodeClosed",
          model.unclosedFence.openLine,
          "Fenced code block is not closed"
        )
      });
    }
  }
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
              "Fenced code blocks should declare a language (for example, ```js)"
            )
          });
        }
      }
    }
  }
  const headingMode = {
    headingStyle: enabled("headingStyle"),
    headingSpace: enabled("headingSpace"),
    emptyHeading: enabled("emptyHeading"),
    headingBlankLines: enabled("headingBlankLines"),
    headingIncrement: enabled("headingIncrement"),
    singleH1: enabled("singleH1")
  };
  if (headingMode.headingStyle) {
    for (const heading of model.headings) {
      if (heading.style === "setext") {
        findings.push({
          mode: headingMode.headingStyle,
          ...finding(
            "headingStyle",
            heading.line,
            "Use ATX headings (# / ##) instead of Setext underlined headings"
          )
        });
      }
    }
  }
  if (headingMode.headingSpace) {
    for (const heading of model.headings) {
      if (heading.style !== "atx") continue;
      const rest = heading.rest;
      if (rest === "") continue;
      if (!rest.startsWith(" ")) {
        findings.push({
          mode: headingMode.headingSpace,
          ...finding(
            "headingSpace",
            heading.line,
            "An ATX heading must have one space after #"
          )
        });
        continue;
      }
      if (rest.startsWith("  ") && rest.trim() !== "") {
        findings.push({
          mode: headingMode.headingSpace,
          ...finding(
            "headingSpace",
            heading.line,
            "An ATX heading must have exactly one space after #"
          )
        });
      }
    }
  }
  if (headingMode.emptyHeading) {
    for (const heading of model.headings) {
      if (heading.text === "") {
        findings.push({
          mode: headingMode.emptyHeading,
          ...finding("emptyHeading", heading.line, "Heading must not be empty")
        });
      }
    }
  }
  if (headingMode.headingBlankLines) {
    for (const heading of model.headings) {
      const idx = heading.index;
      if (idx > model.bodyStart) {
        const prev = model.lineStates[idx - 1];
        if (prev && !prev.isBlank && !prev.isFrontMatter) {
          findings.push({
            mode: headingMode.headingBlankLines,
            ...finding(
              "headingBlankLines",
              heading.line,
              "A blank line is required above the heading"
            )
          });
        }
      }
      const nextIndex = heading.style === "setext" && heading.underlineLine ? heading.underlineLine : idx + 1;
      if (nextIndex < model.lines.length) {
        const next = model.lineStates[nextIndex];
        if (next && !next.isBlank) {
          findings.push({
            mode: headingMode.headingBlankLines,
            ...finding(
              "headingBlankLines",
              heading.line,
              "A blank line is required below the heading"
            )
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
            `Heading level jumps from h${lastLevel} to h${heading.level}; increase by at most one level`
          )
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
            "Only one level-one heading (h1) is allowed per document"
          )
        });
      }
    }
  }
  return findings;
}
function analyzeMarkdown(text, relativePath, config) {
  const findings = runChecks(text, relativePath, config);
  return {
    block: findings.filter((f) => f.mode === "block"),
    report: findings.filter((f) => f.mode === "report")
  };
}

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
function nestedRecord(event, key) {
  const value = event[key];
  return isRecord(value) ? value : null;
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
function eventToolName(event) {
  const tool = nestedRecord(event, "tool");
  return firstString(event.tool_name, event.toolName, tool?.name);
}
function eventToolInput(event) {
  const tool = nestedRecord(event, "tool");
  const value = event.tool_input ?? event.toolInput ?? tool?.input ?? event.input;
  return isRecord(value) ? value : {};
}

// core/src/hook-targets.ts
import { isAbsolute, resolve } from "node:path";
var FILE_MUTATION_TOOLS = /* @__PURE__ */ new Set([
  "applypatch",
  "createfile",
  "edit",
  "multiedit",
  "notebookedit",
  "searchreplace",
  "write"
]);
var READ_TOOLS = /* @__PURE__ */ new Set(["read"]);
var SHELL_TOOLS = /* @__PURE__ */ new Set([
  "bash",
  "exec",
  "execcommand",
  "localshell",
  "shell",
  "shellcommand"
]);
var PATH_KEYS = [
  "file_path",
  "filePath",
  "path",
  "target_file",
  "output_file",
  "outputFile",
  "notebook_path",
  "notebookPath"
];
function canonicalToolName(name) {
  return String(name ?? "").replaceAll("_", "").toLowerCase();
}
function isFileMutationTool(name) {
  return FILE_MUTATION_TOOLS.has(canonicalToolName(name));
}
function isReadTool(name) {
  return READ_TOOLS.has(canonicalToolName(name));
}
function isShellTool(name) {
  return SHELL_TOOLS.has(canonicalToolName(name));
}
function extractShellCommand(event) {
  if (!isShellTool(eventToolName(event))) return null;
  const input = eventToolInput(event);
  const command = input.command ?? input.cmd ?? input.script;
  return typeof command === "string" ? command : null;
}
function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}
function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const record = input;
  const paths = [];
  for (const key of PATH_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value) paths.push(value);
  }
  if (Array.isArray(record.edits)) {
    for (const edit of record.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}
function patchPaths(payload) {
  const paths = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (file?.[1]) paths.push(stripMatchingQuotes(file[1]));
    if (move?.[1]) paths.push(stripMatchingQuotes(move[1]));
  }
  return paths;
}
function patchPayload(input) {
  if (typeof input === "string") return input;
  return [input.patch, input.input, input.command].filter((value) => typeof value === "string").join("\n");
}
function resolveTargets(raw, cwd) {
  return [...new Set(
    raw.map(stripMatchingQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")))
  )];
}
function shellWritePaths(command) {
  const paths = [];
  const push = (raw) => {
    const value = stripMatchingQuotes(String(raw ?? ""));
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of command.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of command.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of command.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  return paths;
}
function acceptsTool(name, tools) {
  if (tools === "any") return true;
  if (isFileMutationTool(name)) return true;
  if (tools === "read-or-mutation" && isReadTool(name)) return true;
  return false;
}
function extractFileTargets(event, options = {}) {
  const tools = options.tools ?? "mutation";
  const name = eventToolName(event);
  const cwd = resolve(eventCwd(event));
  const input = eventToolInput(event);
  const raw = [];
  if (acceptsTool(name, tools)) {
    raw.push(...objectPaths(input));
    raw.push(...patchPaths(patchPayload(typeof event.tool_input === "string" ? event.tool_input : input)));
    if (typeof event.tool_input === "string") raw.push(...objectPaths(input));
  }
  if (options.includeShellWrites) {
    const command = extractShellCommand(event) ?? (typeof input.command === "string" ? input.command : null) ?? (typeof input.cmd === "string" ? input.cmd : null) ?? (typeof input.script === "string" ? input.script : null);
    if (command) raw.push(...shellWritePaths(command));
  }
  return resolveTargets(raw, cwd);
}

// plugins/markdown-format-guard/src/entries/hooks/markdown-format-guard.ts
var MAX_FILE_BYTES = 2 * 1024 * 1024;
var MAX_FINDINGS = 20;
var CONFIG_FILE_NAMES = [
  ".markdown-format-guard.mjs",
  ".markdown-format-guard.cjs",
  ".markdown-format-guard.js"
];
function warnConfig(message) {
  process.stderr.write(`[markdown-format-guard] ${message}
`);
}
async function loadUserConfig(repoRoot) {
  for (const name of CONFIG_FILE_NAMES) {
    const configPath = join(repoRoot, name);
    if (!existsSync(configPath)) continue;
    try {
      const loaded = await import(pathToFileURL(configPath).href);
      return loaded.default ?? loaded;
    } catch (error) {
      warnConfig(`failed to load ${name}: ${error.message}`);
      return null;
    }
  }
  return null;
}
function extractFilePaths(event) {
  return extractFileTargets(event, {
    tools: eventToolName(event) ? "mutation" : "any",
    includeShellWrites: true
  });
}
function resolveRepoRoot(filePath) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dirname(filePath),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
    }).trim();
  } catch {
    return null;
  }
}
function relativeMatchPath(filePath, repoRoot, cwd) {
  if (repoRoot) return relative(repoRoot, filePath).replaceAll("\\", "/");
  const fromCwd = relative(cwd, filePath).replaceAll("\\", "/");
  return fromCwd.startsWith("../") ? filePath.replaceAll("\\", "/") : fromCwd;
}
function readTextCapped(filePath) {
  try {
    if (statSync(filePath).size > MAX_FILE_BYTES) return null;
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}
function formatFinding(path, item) {
  return `- ${path}:${item.line} [${item.check}] ${item.message}`;
}
function emitReport(pathFindings) {
  if (pathFindings.length === 0) return;
  const details = pathFindings.flatMap(
    ({ path, findings }) => findings.map((item) => formatFinding(path, item))
  );
  process.stderr.write(
    [
      "[Markdown Format Guard] Formatting suggestions (report only)",
      ...details,
      ""
    ].join("\n")
  );
}
function block(pathFindings) {
  const details = pathFindings.flatMap(
    ({ path, findings }) => findings.map((item) => formatFinding(path, item))
  );
  process.stderr.write(
    [
      "[Markdown Format Guard] Markdown formatting issues detected",
      ...details,
      "",
      "blockingContract:",
      "  observedFacts: The listed Markdown files violate enabled formatting rules for headings, whitespace, fences, or related structure.",
      "  harm: Inconsistent Markdown structure reduces readability and makes rendering, TOC, and review tools unreliable.",
      "  unblockWhen: Fix every blocking finding, save the file again, and pass this check.",
      "  recovery: Use the reported line numbers to fix heading increments and blank lines, remove tabs or invalid trailing whitespace, close fenced code blocks, and end the file with one newline. Do not rely on a guessed full-document rewrite.",
      ""
    ].join("\n")
  );
  process.exit(2);
}
async function evaluateEvent(event) {
  const cwd = event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
  const candidates = extractFilePaths(event).filter(existsSync);
  if (candidates.length === 0) {
    return { block: [], report: [] };
  }
  const repoRoot = resolveRepoRoot(candidates[0]);
  const userConfig = repoRoot ? await loadUserConfig(repoRoot) : null;
  const config = resolveConfig(userConfig, warnConfig);
  const blockFindings = [];
  const reportFindings = [];
  let total = 0;
  for (const filePath of candidates) {
    const matchPath = relativeMatchPath(filePath, repoRoot, cwd);
    if (!isMarkdownPath(matchPath)) continue;
    const text = readTextCapped(filePath);
    if (text === null) continue;
    const result = analyzeMarkdown(text, matchPath, config);
    if (result.block.length > 0) {
      blockFindings.push({ path: matchPath, findings: result.block });
      total += result.block.length;
    }
    if (result.report.length > 0) {
      reportFindings.push({ path: matchPath, findings: result.report });
    }
    if (total >= MAX_FINDINGS) break;
  }
  return { block: blockFindings, report: reportFindings };
}
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const { block: blockFindings, report: reportFindings } = await evaluateEvent(event);
  if (reportFindings.length > 0 && blockFindings.length === 0) {
    emitReport(reportFindings);
  }
  if (blockFindings.length > 0) {
    if (reportFindings.length > 0) {
      for (const entry of reportFindings) {
        blockFindings.push({
          path: entry.path,
          findings: entry.findings.map((f) => ({
            ...f,
            message: `(report) ${f.message}`
          }))
        });
      }
    }
    block(blockFindings);
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve2(process.argv[1])) {
  main().catch(() => process.exit(0));
}
export {
  evaluateEvent,
  extractFilePaths,
  loadUserConfig
};
