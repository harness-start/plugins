#!/usr/bin/env node
// harness-source-hash: sha256:1ecafbd0352621e15e0b605402136b0ea866ca961edf865301c35a5fa8c3b975
import {
  findLogoProjects,
  loadLogoProject,
  resolveWorkspaceRoot
} from "../chunks/chunk-QPTNINUP.mjs";
import {
  evaluateLogoWrite,
  validateLogoModel
} from "../chunks/chunk-GKYXOIB4.mjs";

// plugins/logo-project-delivery-guard/src/entries/hooks/logo-project-delivery-guard.ts
import { access } from "node:fs/promises";
import { resolve as resolve2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// plugins/logo-project-delivery-guard/src/lib/shell-policy.ts
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
var PLUGIN_DIRECTORY = resolve(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../.."
);
var TOOL_DIRECTORY = resolve(PLUGIN_DIRECTORY, "dist", "cli");
var WRITERS = /* @__PURE__ */ new Set(["project-lint.mjs", "project-preview.mjs", "project-render.mjs", "project-release.mjs", "project-stage.mjs", "project-validate.mjs"]);
var READ_ONLY = /* @__PURE__ */ new Set(["file", "git", "grep", "head", "jq", "ls", "pwd", "rg", "stat", "tail", "wc"]);
function parseShellWords(command) {
  const words = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of String(command ?? "")) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      if (quote === '"' && (char === "$" || char === "`")) return null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/u.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    if (/[;&|><`$(){}\n\r]/u.test(char)) return null;
    current += char;
  }
  if (escaped || quote) return null;
  if (current) words.push(current);
  return words;
}
function expandKnownPluginRoot(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) if (process.env[name]) expanded = expanded.replaceAll(`\${${name}}`, resolve(process.env[name]));
  return expanded;
}
function wrapperInvocation(words, cwd, workspaceRoot) {
  if (!words || words.length < 3 || !["node", basename(process.execPath), process.execPath].includes(words[0]) || words[1].startsWith("-")) return null;
  const script = isAbsolute(words[1]) ? resolve(words[1]) : resolve(cwd, words[1]);
  const name = basename(script);
  if (dirname(script) !== resolve(TOOL_DIRECTORY) || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute(words[2]) ? resolve(words[2]) : resolve(cwd, words[2]);
  if (dirname(projectRoot) !== resolve(workspaceRoot, "artifacts", "logo") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  if (name === "project-release.mjs" && words.length !== 3) return null;
  if (name === "project-render.mjs" && (words.length !== 4 || !["source", "release"].includes(words[3]))) return null;
  if (name === "project-stage.mjs" && (words.length !== 4 || words[3] !== "release")) return null;
  if (name === "project-validate.mjs") {
    const args = words.slice(3);
    while (args.length > 0) {
      const value = args.shift();
      if (value === "--json") continue;
      if (/^--stage=(?:source|release)$/u.test(value)) continue;
      if (value === "--stage" && ["source", "release"].includes(args.shift())) continue;
      return null;
    }
  }
  if (name === "project-preview.mjs") {
    const args = words.slice(3);
    while (args.length > 0) {
      const value = args.shift();
      if (value === "--write-review") continue;
      return null;
    }
  }
  return { name, projectRoot };
}
function readOnlyCommand(words) {
  if (!words?.length || words[0] !== basename(words[0]) || !READ_ONLY.has(words[0])) return false;
  const command = words[0];
  if (command === "git") {
    if (!["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
    if (words.some((word) => word === "--output" || word.startsWith("--output=") || /^-o.+/u.test(word) || ["--ext-diff", "--textconv"].includes(word))) return false;
  }
  if (command === "rg" && words.some((word) => word === "--pre" || word.startsWith("--pre="))) return false;
  return true;
}
function touchesLogo(command, cwd, workspaceRoot) {
  const normalized = String(command ?? "").replaceAll("\\", "/");
  const root = resolve(workspaceRoot).replaceAll("\\", "/");
  const current = resolve(cwd).replaceAll("\\", "/");
  return current.startsWith(`${root}/artifacts/logo/`) || /(?:^|[\s"'=])\.?\/?artifacts\/logo(?:\/|[\s"']|$)/u.test(normalized) || normalized.includes(`${root}/artifacts/logo/`);
}
function evaluateLogoShell({ command, cwd, workspaceRoot, activeProjectCount = 0 }) {
  if (activeProjectCount < 1 && !touchesLogo(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return { decision: "allow", writer: invocation.name, projectRoot: invocation.projectRoot };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "logo scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/logo-project-delivery-guard/src/entries/hooks/logo-project-delivery-guard.ts
async function readEvent() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return { __parseError: true };
  }
}
var inputOf = (event) => event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
var nameOf = (event) => event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
var cwdOf = (event) => resolve2(event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd());
function objectTargets(input) {
  if (!input || typeof input !== "object") return [];
  const targets = [];
  for (const key of [
    "file_path",
    "filePath",
    "path",
    "target_file",
    "output_file",
    "outputFile",
    "notebook_path",
    "notebookPath",
    "source_path",
    "sourcePath",
    "destination_path",
    "destinationPath",
    "old_path",
    "oldPath",
    "new_path",
    "newPath"
  ]) if (typeof input[key] === "string") targets.push(input[key]);
  if (Array.isArray(input.edits)) for (const edit of input.edits) targets.push(...objectTargets(edit));
  return targets;
}
function targetsOf(event) {
  const input = inputOf(event);
  const targets = objectTargets(input);
  for (const value of [input?.patch, input?.input, typeof input === "string" ? input : null]) if (typeof value === "string") {
    for (const match of value.matchAll(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/gmu)) targets.push(match[1].trim());
    for (const match of value.matchAll(/^\*\*\*\s+Move to:\s+(.+)$/gmu)) targets.push(match[1].trim());
  }
  return [...new Set(targets)];
}
function deny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[Logo Project Delivery Guard] ${reason}` } };
}
function context(eventName, message) {
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: message } };
}
function stopBlock(reason) {
  return { decision: "block", reason };
}
async function existingPlanTarget(cwd, target) {
  const absolute = resolve2(cwd, target);
  if (!/(?:^|[\\/])artifacts[\\/]logo[\\/][^\\/]+[\\/]plan\.contract\.json$/u.test(absolute)) return false;
  try {
    await access(absolute);
    return true;
  } catch {
    return false;
  }
}
async function findingsFor(cwd) {
  const findings = [];
  const { roots } = await findLogoProjects(cwd);
  for (const root of roots) {
    const model = await loadLogoProject(root);
    const stage = model.plan?.targetStage;
    for (const item of validateLogoModel(model, { stage })) findings.push({ artifactId: model.artifactId, ...item });
  }
  findings.sort((left, right) => left.code.localeCompare(right.code) || left.artifactId.localeCompare(right.artifactId) || left.path.localeCompare(right.path));
  return { findings, projectCount: roots.length };
}
function format(findings) {
  return ["[Logo Project Delivery Guard] Project contract violations", ...findings.slice(0, 100).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named contract, vector, proof, evidence, or output and rerun the registered logo tool."].join("\n");
}
async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readEvent();
  if (event.__parseError) {
    process.stderr.write("[Logo Project Delivery Guard] invalid hook JSON\n");
    process.exitCode = 2;
    return;
  }
  if (mode === "stop" && (event?.stop_hook_active === true || event?.stopHookActive === true)) return;
  const cwd = cwdOf(event);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      if (await existingPlanTarget(cwd, target)) {
        process.stdout.write(`${JSON.stringify(deny("PLAN_STAGE_WRITER_REQUIRED: existing plan changes require project-stage.mjs"))}
`);
        return;
      }
      const result = evaluateLogoWrite({ relativePath: resolve2(cwd, target), toolName: nameOf(event) });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
        return;
      }
    }
    const input = inputOf(event);
    const command = typeof input?.command === "string" ? input.command : typeof input?.cmd === "string" ? input.cmd : "";
    if (command) {
      const { roots } = await findLogoProjects(cwd);
      const result = evaluateLogoShell({ command, cwd, workspaceRoot, activeProjectCount: roots.length });
      if (result.writer && !roots.includes(result.projectRoot)) process.stdout.write(`${JSON.stringify(deny("PROJECT_ROOT_UNREGISTERED: registered writers require a discovered non-symlink logo project root"))}
`);
      else if (result.decision === "deny") process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findLogoProjects(cwd);
    if (roots.length > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", `[Logo Project Delivery Guard] discovered ${roots.length} project(s); generated outputs require project-render and release requires project-release.`))}
`);
    return;
  }
  const { findings } = await findingsFor(cwd);
  if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}
`);
  } else if (mode === "stop" && findings.length > 0) {
    process.stdout.write(`${JSON.stringify(stopBlock(format(findings)))}
`);
  }
}
if (process.argv[1] && fileURLToPath2(import.meta.url) === resolve2(process.argv[1])) main().catch((error) => {
  process.stderr.write(`[Logo Project Delivery Guard] ${error.message}
`);
  process.exitCode = 2;
});
