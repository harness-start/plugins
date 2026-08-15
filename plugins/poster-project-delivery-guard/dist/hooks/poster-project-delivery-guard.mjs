#!/usr/bin/env node
// harness-source-hash: sha256:f29b1f41f0ba95036663639eaa3c08347831135940143339caf4061064bb57eb
import {
  evaluatePosterWrite,
  validatePosterModel
} from "../chunks/chunk-H77QB4KA.mjs";

// plugins/poster-project-delivery-guard/src/entries/hooks/poster-project-delivery-guard.ts
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename as basename2, dirname as dirname2, join, relative, resolve as resolve2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// plugins/poster-project-delivery-guard/src/lib/shell-policy.ts
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
var PLUGIN_DIRECTORY = resolve(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../.."
);
var TOOL_DIRECTORY = resolve(PLUGIN_DIRECTORY, "dist", "cli");
var WRITERS = /* @__PURE__ */ new Set(["project-lint.mjs", "project-release.mjs"]);
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
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    if (process.env[name]) expanded = expanded.replaceAll(`\${${name}}`, resolve(process.env[name]));
  }
  return expanded;
}
function wrapperInvocation(words, cwd, workspaceRoot) {
  if (!words || words.length < 3 || !["node", basename(process.execPath), process.execPath].includes(words[0]) || words[1].startsWith("-")) {
    return null;
  }
  const script = isAbsolute(words[1]) ? resolve(words[1]) : resolve(cwd, words[1]);
  const name = basename(script);
  if (dirname(script) !== resolve(TOOL_DIRECTORY) || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute(words[2]) ? resolve(words[2]) : resolve(cwd, words[2]);
  if (dirname(projectRoot) !== resolve(workspaceRoot, "artifacts", "poster") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) {
    return null;
  }
  if (name === "project-release.mjs" && words.length !== 3) return null;
  if (name === "project-lint.mjs" && words.slice(3).some((word) => word.startsWith("-"))) return null;
  return { name, projectRoot };
}
function readOnlyCommand(words) {
  if (!words?.length || words[0] !== basename(words[0]) || !READ_ONLY.has(words[0])) return false;
  if (words[0] === "git") {
    if (!["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
    if (words.some((word) => word === "--output" || word.startsWith("--output=") || /^-o.+/u.test(word) || ["--ext-diff", "--textconv"].includes(word))) {
      return false;
    }
  }
  if (words[0] === "rg" && words.some((word) => word === "--pre" || word.startsWith("--pre="))) return false;
  return true;
}
function touchesPoster(command, cwd, workspaceRoot) {
  const normalized = String(command ?? "").replaceAll("\\", "/");
  const root = resolve(workspaceRoot).replaceAll("\\", "/");
  const current = resolve(cwd).replaceAll("\\", "/");
  return current.startsWith(`${root}/artifacts/poster/`) || /(?:^|[\s"'=])\.?\/?artifacts\/poster(?:\/|[\s"']|$)/u.test(normalized) || normalized.includes(`${root}/artifacts/poster/`);
}
function evaluatePosterShell({ command, cwd, workspaceRoot }) {
  if (!touchesPoster(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return { decision: "allow", writer: invocation.name, projectRoot: invocation.projectRoot };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return {
    decision: "deny",
    code: "UNKNOWN_MUTATION_SHELL",
    message: "poster scope permits only read-only commands or an exact registered writer invocation"
  };
}

// plugins/poster-project-delivery-guard/src/entries/hooks/poster-project-delivery-guard.ts
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
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    if (typeof input[key] === "string" && input[key]) targets.push(input[key]);
  }
  if (Array.isArray(input.edits)) for (const edit of input.edits) targets.push(...objectTargets(edit));
  return targets;
}
function targetsOf(event) {
  const input = inputOf(event);
  const targets = objectTargets(input);
  for (const value of [input?.patch, input?.input]) if (typeof value === "string") {
    for (const match of value.matchAll(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/gmu)) targets.push(match[1].trim());
  }
  return [...new Set(targets)];
}
function deny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[Poster Project Delivery Guard] ${reason}` } };
}
function context(eventName, message) {
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: message } };
}
function resolveWorkspaceRoot(cwd) {
  let current = resolve2(cwd);
  while (current !== dirname2(current)) {
    if (basename2(dirname2(current)) === "poster" && basename2(dirname2(dirname2(current))) === "artifacts") {
      return dirname2(dirname2(dirname2(current)));
    }
    current = dirname2(current);
  }
  return resolve2(cwd);
}
async function discover(cwd) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const root = join(workspaceRoot, "artifacts", "poster");
  try {
    return (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name)).slice(0, 32).map((entry) => join(root, entry.name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}
async function collect(root, directory, files, digests, bytesMap) {
  if (Object.keys(files).length >= 2048) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collect(root, absolute, files, digests, bytesMap);
    else if (entry.isFile()) {
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      const bytes = await readFile(absolute);
      files[filePath] = bytes.toString("utf8");
      bytesMap[filePath] = bytes;
      digests[filePath] = createHash("sha256").update(bytes).digest("hex");
    }
  }
}
async function findingsFor(cwd) {
  const findings = [];
  for (const root of await discover(cwd)) {
    const files = {};
    const digests = {};
    const bytes = {};
    await collect(root, root, files, digests, bytes);
    if (!("plan.contract.json" in files)) continue;
    let plan = null;
    let project = null;
    try {
      plan = JSON.parse(files["plan.contract.json"]);
    } catch {
    }
    try {
      project = JSON.parse(files["poster.project.json"]);
    } catch {
    }
    const model = { artifactId: basename2(root), files, digests, bytes, plan, project };
    for (const item of validatePosterModel(model, { stage: plan?.targetStage ?? "source" })) findings.push({ artifactId: model.artifactId, ...item });
  }
  return findings;
}
function format(findings) {
  return ["[Poster Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named variant, layer, proof, or output and rerun the registered poster tool."].join("\n");
}
async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readEvent();
  if (event.__parseError) return;
  const cwd = cwdOf(event);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      const result = evaluatePosterWrite({
        relativePath: relative(cwd, resolve2(cwd, target)),
        toolName: nameOf(event),
        cwd
      });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
        return;
      }
    }
    const input = inputOf(event);
    const command = typeof input?.command === "string" ? input.command : typeof input?.cmd === "string" ? input.cmd : "";
    if (command) {
      const result = evaluatePosterShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot(cwd) });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
      }
    }
    return;
  }
  const findings = await findingsFor(cwd);
  if (mode === "session") {
    if ((await discover(cwd)).length > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", "[Poster Project Delivery Guard] active; generated outputs require registered writers."))}
`);
  } else if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}
`);
  } else if (mode === "stop" && findings.length > 0) {
    process.stderr.write(`${format(findings)}
`);
    process.exitCode = 2;
  }
}
if (process.argv[1] && fileURLToPath2(import.meta.url) === resolve2(process.argv[1])) main().catch((error) => {
  process.stderr.write(`[Poster Project Delivery Guard] ${error.message}
`);
  process.exitCode = 2;
});
