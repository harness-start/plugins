#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  analyzeMarkdown,
  isMarkdownPath,
  resolveConfig,
} from "../../lib/markdown-policy.js";
import { eventToolName, readStdinJson } from "@harness/core/hook-event";
import { extractFileTargets } from "@harness/core/hook-targets";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FINDINGS = 20;
const CONFIG_FILE_NAMES = [
  ".markdown-format-guard.mjs",
  ".markdown-format-guard.cjs",
  ".markdown-format-guard.js",
];

function warnConfig(message) {
  process.stderr.write(`[markdown-format-guard] ${message}\n`);
}

export async function loadUserConfig(repoRoot) {
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

export function extractFilePaths(event) {
  return extractFileTargets(event, {
    tools: eventToolName(event) ? "mutation" : "any",
    includeShellWrites: true,
  });
}

function resolveRepoRoot(filePath) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dirname(filePath),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

function relativeMatchPath(filePath, repoRoot, cwd) {
  if (repoRoot) return relative(repoRoot, filePath).replaceAll("\\", "/");
  const fromCwd = relative(cwd, filePath).replaceAll("\\", "/");
  return fromCwd.startsWith("../")
    ? filePath.replaceAll("\\", "/")
    : fromCwd;
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
  const details = pathFindings.flatMap(({ path, findings }) =>
    findings.map((item) => formatFinding(path, item)),
  );
  process.stderr.write(
    [
      "[Markdown Format Guard] Formatting suggestions (report only)",
      ...details,
      "",
    ].join("\n"),
  );
}

function block(pathFindings) {
  const details = pathFindings.flatMap(({ path, findings }) =>
    findings.map((item) => formatFinding(path, item)),
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
      "",
    ].join("\n"),
  );
  process.exit(2);
}

export async function evaluateEvent(event) {
  const cwd =
    event?.cwd ??
    event?.working_directory ??
    event?.workingDirectory ??
    process.cwd();
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

  const { block: blockFindings, report: reportFindings } =
    await evaluateEvent(event);

  if (reportFindings.length > 0 && blockFindings.length === 0) {
    emitReport(reportFindings);
  }

  if (blockFindings.length > 0) {
    // Include report items in the block output for context when mixed.
    if (reportFindings.length > 0) {
      for (const entry of reportFindings) {
        blockFindings.push({
          path: entry.path,
          findings: entry.findings.map((f) => ({
            ...f,
            message: `(report) ${f.message}`,
          })),
        });
      }
    }
    block(blockFindings);
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch(() => process.exit(0));
}
