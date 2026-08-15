#!/usr/bin/env node
import {
  evaluateVideoWrite,
  issueWriterCapability,
  validateVideoModel
} from "../chunks/chunk-6W43YK4G.mjs";
import {
  findVideoProjects,
  loadVideoProject,
  resolveWorkspaceRoot
} from "../chunks/chunk-MQPEWRNU.mjs";

// plugins/video-project-delivery-guard/src/entries/hooks/video-project-delivery-guard.ts
import { relative, resolve as resolve2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// plugins/video-project-delivery-guard/src/lib/shell-policy.ts
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
var PLUGIN_DIRECTORY = resolve(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../.."
);
var TOOL_DIRECTORY = resolve(PLUGIN_DIRECTORY, "dist", "cli");
var WRITERS = /* @__PURE__ */ new Set(["project-lint.mjs", "project-probe.mjs", "project-release.mjs", "project-render.mjs", "project-review.mjs"]);
var READ_ONLY = /* @__PURE__ */ new Set(["file", "find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "sed", "stat", "tail", "wc"]);
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
function wrapperInvocation(words, cwd, workspaceRoot) {
  if (!words || words.length < 3) return null;
  if (!["node", basename(process.execPath), process.execPath].includes(words[0])) return null;
  if (words[1].startsWith("-")) return null;
  const script = isAbsolute(words[1]) ? resolve(words[1]) : resolve(cwd, words[1]);
  const name = basename(script);
  if (dirname(resolve(script)) !== resolve(TOOL_DIRECTORY) || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute(words[2]) ? resolve(words[2]) : resolve(cwd, words[2]);
  const expectedParent = resolve(workspaceRoot, "artifacts", "video");
  if (dirname(projectRoot) !== expectedParent || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}
function expandKnownPluginRoot(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (!value) continue;
    expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve(value)}/dist/cli/`);
  }
  return expanded;
}
function readOnlyCommand(words) {
  if (!words || words.length === 0) return false;
  const command = basename(words[0]);
  if (!READ_ONLY.has(command)) return false;
  if (command === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (command === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(word))) return false;
  return true;
}
function commandTouchesVideoScope(command, cwd, workspaceRoot) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/video/`) || /(?:^|[\s"'=])\.?\/?artifacts\/video(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/video/`);
}
function evaluateVideoShell({ command, cwd, workspaceRoot }) {
  if (!commandTouchesVideoScope(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return {
    decision: "allow",
    writer: `video-${invocation.name.slice("project-".length, -".mjs".length)}`,
    projectRoot: invocation.projectRoot,
    argv: invocation.argv
  };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "video scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/video-project-delivery-guard/src/entries/hooks/video-project-delivery-guard.ts
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
var sessionOf = (event) => event?.session_id ?? event?.sessionId ?? event?.context?.session_id ?? process.env.AI_EXPERTS_SESSION_ID ?? "unknown";
function objectTargets(input) {
  if (!input || typeof input !== "object") return [];
  const targets = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    if (typeof input[key] === "string") targets.push(input[key]);
  }
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
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[Video Project Delivery Guard] ${reason}` } };
}
function context(eventName, message) {
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: message } };
}
async function findingsFor(cwd) {
  const findings = [];
  const { workspaceRoot, roots } = await findVideoProjects(cwd);
  for (const root of roots) {
    const model = await loadVideoProject(root);
    const artifactPath = relative(workspaceRoot, root).replaceAll("\\", "/");
    if (!("plan.contract.json" in model.files)) {
      findings.push({ artifactId: model.artifactId, code: "PLAN_CONTRACT_MISSING", path: `${artifactPath}/plan.contract.json`, message: "plan.contract.json is required to select a closure stage" });
    }
    const stage = model.plan?.targetStage;
    for (const item of validateVideoModel(model, { stage })) findings.push({ artifactId: model.artifactId, ...item });
  }
  return { findings, projectCount: roots.length };
}
function format(findings) {
  return ["[Video Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named contract, proof, evidence, or output and rerun the registered video tool."].join("\n");
}
async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readEvent();
  if (event.__parseError) {
    process.stderr.write("[Video Project Delivery Guard] invalid hook JSON\n");
    process.exitCode = 2;
    return;
  }
  const cwd = cwdOf(event);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      const absolutePath = resolve2(cwd, target);
      const result = evaluateVideoWrite({ relativePath: absolutePath, toolName: nameOf(event) });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
        return;
      }
    }
    const input = inputOf(event);
    const command = typeof input?.command === "string" ? input.command : typeof input?.cmd === "string" ? input.cmd : "";
    if (command) {
      const result = evaluateVideoShell({ command, cwd, workspaceRoot });
      if (result.decision === "deny") process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
      else if (result.writer && result.writer !== "video-lint") {
        try {
          await issueWriterCapability({ root: result.projectRoot, capability: result.writer, argv: result.argv, sessionId: sessionOf(event), triggerFrom: `video-project-delivery-guard:pre:${result.writer}` });
        } catch (error) {
          process.stdout.write(`${JSON.stringify(deny(`WRITER_CAPABILITY_DENIED: ${error.message}`))}
`);
        }
      }
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findVideoProjects(cwd);
    const projectCount = roots.length;
    if (projectCount > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", `[Video Project Delivery Guard] discovered ${projectCount} project(s); generated outputs require registered writers; host session id=${sessionOf(event)}.`))}
`);
    return;
  }
  const { findings } = await findingsFor(cwd);
  if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}
`);
  } else if (mode === "stop" && findings.length > 0) {
    process.stderr.write(`${format(findings)}
`);
    process.exitCode = 2;
  }
}
if (process.argv[1] && fileURLToPath2(import.meta.url) === resolve2(process.argv[1])) main().catch((error) => {
  process.stderr.write(`[Video Project Delivery Guard] ${error.message}
`);
  process.exitCode = 2;
});
