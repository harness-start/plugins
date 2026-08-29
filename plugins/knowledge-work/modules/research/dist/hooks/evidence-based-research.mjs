#!/usr/bin/env node
// harness-source-hash: sha256:8efe8eec25fcb0cb78cd8312e0c5185d2a41c4a5d046256199b5956b149300b2
import {
  canonicalJson,
  sealPayload,
  sha256
} from "../chunks/chunk-LREX5F4M.mjs";
import {
  SEALED_OR_LATER,
  classifyResearchPath,
  eventAssistantMessage,
  eventCwd,
  eventPrompt,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  extractResearchRelativePaths,
  findActiveWorkflow,
  isActivePhase,
  isRecord,
  pathLooksLikeResearchWrite,
  readStdinJson,
  readWorkflowFile,
  terminalizeWorkflow,
  workflowPath
} from "../chunks/chunk-52B4RD6W.mjs";

// plugins/knowledge-work/modules/research/src/entries/hooks/evidence-based-research.ts
import { join as join4, resolve as resolve3 } from "node:path";
import { fileURLToPath } from "node:url";

// core/src/shell-parse.ts
function decodeAnsiCQuoteEscape(command, slashIndex) {
  const marker = command[slashIndex + 1] ?? "";
  const simple = /* @__PURE__ */ new Map([
    ["a", "\x07"],
    ["b", "\b"],
    ["e", "\x1B"],
    ["E", "\x1B"],
    ["f", "\f"],
    ["n", "\n"],
    ["r", "\r"],
    ["t", "	"],
    ["v", "\v"],
    ["\\", "\\"],
    ["'", "'"],
    ['"', '"']
  ]);
  if (simple.has(marker)) {
    return { value: simple.get(marker) ?? "", endIndex: slashIndex + 1 };
  }
  const numeric = marker === "x" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,2}/iu) : marker === "u" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,4}/iu) : marker === "U" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,8}/iu) : command.slice(slashIndex + 1).match(/^[0-7]{1,3}/u);
  if (numeric?.[0]) {
    const radix = marker === "x" || marker === "u" || marker === "U" ? 16 : 8;
    const codePoint = Number.parseInt(numeric[0], radix);
    if (codePoint <= 1114111) {
      const offset = marker === "x" || marker === "u" || marker === "U" ? 2 : 1;
      return {
        value: String.fromCodePoint(codePoint),
        endIndex: slashIndex + offset + numeric[0].length - 1
      };
    }
  }
  if (marker === "\n") return { value: "", endIndex: slashIndex + 1 };
  return { value: `\\${marker}`, endIndex: slashIndex + 1 };
}
var EMPTY_OPTIONS = /* @__PURE__ */ new Set();
var SIMPLE_COMMAND_WRAPPERS = /* @__PURE__ */ new Set(["command", "exec", "nohup", "busybox", "time"]);
var SUDO_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-C",
  "-D",
  "-g",
  "-h",
  "-p",
  "-R",
  "-T",
  "-u",
  "--chdir",
  "--close-from",
  "--group",
  "--host",
  "--prompt",
  "--role",
  "--type",
  "--user"
]);
var ENV_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-C",
  "-S",
  "-u",
  "--chdir",
  "--split-string",
  "--unset"
]);
var XARGS_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-a",
  "-d",
  "-E",
  "-I",
  "-L",
  "-n",
  "-P",
  "-s",
  "--arg-file",
  "--delimiter",
  "--eof",
  "--max-args",
  "--max-chars",
  "--max-lines",
  "--max-procs",
  "--replace"
]);
var TIMEOUT_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-s",
  "--signal",
  "-k",
  "--kill-after"
]);
var NICE_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set(["-n", "--adjustment"]);
var STDBUF_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-i",
  "--input",
  "-o",
  "--output",
  "-e",
  "--error"
]);
var IONICE_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-c",
  "--class",
  "-n",
  "--classdata",
  "-p",
  "--pid"
]);
var COMMAND_SEPARATORS = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
function skipWrapperOptions(tokens, start, optionsWithValue) {
  let index = start;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token?.startsWith("-")) break;
    if (token === "--") return index + 1;
    index += optionsWithValue.has(token) ? 2 : 1;
  }
  return index;
}
function tokenBasename(token) {
  return token.split("/").at(-1) ?? "";
}
function commandInvocation(tokens) {
  let index = 0;
  let stdinDriven = false;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename(token);
    if (SIMPLE_COMMAND_WRAPPERS.has(name)) {
      index = skipWrapperOptions(tokens, index + 1, EMPTY_OPTIONS);
      continue;
    }
    if (name === "sudo") {
      index = skipWrapperOptions(tokens, index + 1, SUDO_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "env") {
      index = skipWrapperOptions(tokens, index + 1, ENV_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "xargs") {
      stdinDriven = true;
      index = skipWrapperOptions(tokens, index + 1, XARGS_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "timeout") {
      index = skipWrapperOptions(tokens, index + 1, TIMEOUT_OPTIONS_WITH_VALUE);
      if (index < tokens.length && tokens[index] && !COMMAND_SEPARATORS.has(tokens[index] ?? "")) {
        index += 1;
      }
      continue;
    }
    if (name === "nice") {
      index = skipWrapperOptions(tokens, index + 1, NICE_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "stdbuf") {
      index = skipWrapperOptions(tokens, index + 1, STDBUF_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "ionice") {
      index = skipWrapperOptions(tokens, index + 1, IONICE_OPTIONS_WITH_VALUE);
      continue;
    }
    return {
      executable: name || token,
      args: tokens.slice(index + 1),
      stdinDriven
    };
  }
  return null;
}
function tokenizeShell(command) {
  const tokens = [];
  let current = "";
  let tokenStarted = false;
  let quote = null;
  let ansiCQuote = false;
  let escaped = false;
  const pushCurrent = () => {
    if (tokenStarted) {
      tokens.push(current);
      current = "";
      tokenStarted = false;
    }
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? "";
    const next = command[index + 1];
    if (escaped) {
      current += char;
      tokenStarted = true;
      escaped = false;
      continue;
    }
    if (quote) {
      if (ansiCQuote && char === "\\") {
        const decoded = decodeAnsiCQuoteEscape(command, index);
        current += decoded.value;
        tokenStarted = true;
        index = decoded.endIndex;
        continue;
      }
      if (quote === '"' && char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
        ansiCQuote = false;
        continue;
      }
      current += char;
      tokenStarted = true;
      continue;
    }
    if (char === "$" && (next === '"' || next === "'")) {
      quote = next;
      ansiCQuote = next === "'";
      tokenStarted = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      tokenStarted = true;
      continue;
    }
    if (/\s/u.test(char)) {
      pushCurrent();
      continue;
    }
    if (char === "#" && !tokenStarted) break;
    if (char === "&" && next === "&") {
      pushCurrent();
      tokens.push("&&");
      index += 1;
      continue;
    }
    if (char === "&") {
      pushCurrent();
      tokens.push("&");
      continue;
    }
    if (char === "|" && next === "|") {
      pushCurrent();
      tokens.push("||");
      index += 1;
      continue;
    }
    if (char === ";" || char === "|") {
      pushCurrent();
      tokens.push(char);
      continue;
    }
    current += char;
    tokenStarted = true;
  }
  pushCurrent();
  return tokens;
}
function splitShellLogicalLines(command) {
  const lines = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\n") {
      if (current.trim()) lines.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) lines.push(current);
  return lines;
}
function shellCommandInvocations(command) {
  const invocations = [];
  for (const logicalLine of splitShellLogicalLines(command)) {
    const tokens = tokenizeShell(logicalLine);
    let segment = [];
    for (let index = 0; index <= tokens.length; index += 1) {
      const token = tokens[index];
      if (token !== void 0 && !COMMAND_SEPARATORS.has(token)) {
        segment.push(token);
        continue;
      }
      const invocation = commandInvocation(segment);
      if (invocation) invocations.push(invocation);
      segment = [];
    }
  }
  return invocations;
}

// plugins/knowledge-work/modules/research/src/lib/seal-validator.ts
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
function parseTrailer(message) {
  const match = String(message).match(/(?:^|\n)Research-Evidence: research-evidence\/v1\nResearch-Run: ([a-z0-9-]+)\nResearch-Seal: (sha256:[a-f0-9]{64})(?:\n|$)/u);
  const runId = match?.[1];
  const seal = match?.[2];
  return runId && seal ? { runId, seal } : null;
}
async function validateSealedArtifacts({ workspaceRoot, runId, seal, promptEpoch, mutationRevision }) {
  const findings = [];
  if (typeof runId !== "string" || !/^r-[a-z0-9-]+$/u.test(runId)) return ["invalid research run id"];
  const directory2 = join(resolve(workspaceRoot), ".research", "runs", runId);
  let manifest;
  let report;
  try {
    const parsed = JSON.parse(await readFile(join(directory2, "research.json"), "utf8"));
    if (!isRecord(parsed)) return ["research manifest is missing or invalid JSON"];
    manifest = parsed;
  } catch {
    return ["research manifest is missing or invalid JSON"];
  }
  try {
    report = await readFile(join(directory2, "report.md"), "utf8");
  } catch {
    return ["research report is missing"];
  }
  if (manifest.schema !== "research-manifest/v1" || manifest.run_id !== runId) findings.push("research manifest identity mismatch");
  const { integrity, ...base } = manifest;
  const integrityRecord = isRecord(integrity) ? integrity : null;
  if (!integrityRecord || integrityRecord.seal !== seal) findings.push("research seal does not match manifest");
  const manifestPayloadHash = sha256(canonicalJson(base));
  const reportHash = sha256(report);
  if (integrityRecord?.manifest_payload_sha256 !== manifestPayloadHash) findings.push("manifest hash mismatch");
  if (integrityRecord?.report_sha256 !== reportHash) findings.push("report hash mismatch");
  const expectedPayload = sealPayload({ runId, promptEpoch: base.prompt_epoch, mutationRevision: base.mutation_revision, manifestPayloadHash, reportHash });
  const expectedSeal = `sha256:${sha256(canonicalJson(expectedPayload))}`;
  if (expectedSeal !== seal) findings.push("research seal digest mismatch");
  if (promptEpoch !== void 0 && base.prompt_epoch !== promptEpoch) findings.push("research seal is from a stale prompt epoch");
  if (mutationRevision !== void 0 && base.mutation_revision !== mutationRevision) findings.push("workspace changed after research seal");
  return [...new Set(findings)];
}

// plugins/knowledge-work/modules/research/src/lib/state-store.ts
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync as mkdirSync2, readFileSync as readFileSync2, readdirSync, unlinkSync, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname, join as join3, resolve as resolve2 } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";
var PLUGIN_WORKDIR_GITIGNORE = "*\n";
function normalizeGitignore(text) {
  return String(text ?? "").replace(/\r\n/gu, "\n").trim();
}
function isStalePluginWorkdirGitignore(text) {
  const value = normalizeGitignore(text);
  return value === "" || value === "state/" || value === "sessions/";
}
function ensurePluginWorkdirGitignore(pluginRoot) {
  mkdirSync(pluginRoot, { recursive: true, mode: 448 });
  const ignore = join2(pluginRoot, ".gitignore");
  let current = null;
  try {
    current = readFileSync(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

// core/src/hook-output.ts
function writeJson(value) {
  if (value !== null && value !== void 0) {
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// core/src/state-file.ts
var WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

// core/src/hook-targets.ts
var FILE_MUTATION_TOOLS = /* @__PURE__ */ new Set([
  "applypatch",
  "createfile",
  "edit",
  "multiedit",
  "notebookedit",
  "searchreplace",
  "write"
]);
var SHELL_TOOLS = /* @__PURE__ */ new Set([
  "bash",
  "exec",
  "execcommand",
  "localshell",
  "shell",
  "shellcommand"
]);
function canonicalToolName(name) {
  return String(name ?? "").replaceAll("_", "").toLowerCase();
}
function isFileMutationTool(name) {
  return FILE_MUTATION_TOOLS.has(canonicalToolName(name));
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

// plugins/knowledge-work/modules/research/src/lib/hook-io.ts
function sessionId(event) {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || null;
}
function shellCommand(event) {
  return extractShellCommand(event);
}
function fileMutation(event) {
  return isFileMutationTool(eventToolName(event));
}

// plugins/knowledge-work/modules/research/src/lib/state-store.ts
var TTL_MS = 24 * 60 * 60 * 1e3;
function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
var STATE_DIR_RELATIVE = ".research/state";
function ensureStateDir(directory2) {
  mkdirSync2(directory2, { recursive: true, mode: 448 });
  ensurePluginWorkdirGitignore(dirname(directory2));
}
function directory(event) {
  const session = sessionId(event) || "default";
  const target = join3(resolve2(eventCwd(event)), STATE_DIR_RELATIVE, "hook-events", hash(session));
  return target;
}
function payloadFromUnknown(value) {
  if (!isRecord(value)) return {};
  const payload = {};
  if (typeof value.abort === "boolean") payload.abort = value.abort;
  if (typeof value.runId === "string" || value.runId === null) payload.runId = value.runId;
  if (typeof value.tool === "string") payload.tool = value.tool;
  if (typeof value.seal === "string" || value.seal === null) payload.seal = value.seal;
  if (typeof value.promptEpoch === "number") payload.promptEpoch = value.promptEpoch;
  if (typeof value.revision === "number") payload.revision = value.revision;
  if (typeof value.eventId === "string" || value.eventId === null) payload.eventId = value.eventId;
  if (typeof value.observedAt === "number") payload.observedAt = value.observedAt;
  if (typeof value.conservative === "boolean") payload.conservative = value.conservative;
  return payload;
}
function appendStateEvent(event, type, payload = {}) {
  const target = directory(event);
  if (!target) return false;
  try {
    ensureStateDir(join3(resolve2(eventCwd(event)), STATE_DIR_RELATIVE));
    mkdirSync2(target, { recursive: true, mode: 448 });
    const stamp = `${String(Date.now()).padStart(13, "0")}-${process.hrtime.bigint()}-${process.pid}-${randomBytes(5).toString("hex")}`;
    writeFileSync2(join3(target, `${stamp}.json`), `${JSON.stringify({ version: 1, type, at: Date.now(), payload })}
`, { encoding: "utf8", mode: 384, flag: "wx" });
    return true;
  } catch {
    return false;
  }
}
function readState(event) {
  const workspace = resolve2(eventCwd(event));
  const workflow = findActiveWorkflow(workspace);
  const state = {
    promptEpoch: 0,
    revision: 0,
    active: false,
    aborted: false,
    abortedRunId: null,
    completed: false,
    completedRunId: null,
    seal: null,
    runId: workflow?.run_id ?? null,
    receipts: [],
    workflow,
    workflowPhase: workflow?.phase ?? null
  };
  const target = directory(event);
  if (target) {
    let files;
    try {
      files = readdirSync(target).filter((name) => name.endsWith(".json")).sort();
    } catch {
      files = [];
    }
    for (const file of files) {
      let item;
      try {
        const parsed = JSON.parse(readFileSync2(join3(target, file), "utf8"));
        if (!isRecord(parsed)) continue;
        item = parsed;
      } catch {
        continue;
      }
      if (Date.now() - Number(item.at ?? 0) > TTL_MS) {
        try {
          unlinkSync(join3(target, file));
        } catch {
        }
        continue;
      }
      const payload = payloadFromUnknown(item.payload);
      if (item.type === "prompt") {
        state.promptEpoch += 1;
        if (payload.abort === true) {
          state.aborted = true;
          state.abortedRunId = payload.runId ?? state.runId;
          state.runId = payload.runId ?? state.runId;
        }
      } else if (item.type === "mutation") {
        state.revision += 1;
        state.seal = null;
      } else if (item.type === "receipt") {
        state.receipts.push(payload);
        if (payload.tool === "research_begin") {
          state.runId = payload.runId ?? state.runId;
          state.seal = null;
          state.aborted = false;
          state.completed = false;
        }
        if (payload.tool === "research_seal" && (!state.runId || payload.runId === state.runId)) state.seal = payload;
      } else if (item.type === "complete") {
        if (!payload.runId || !state.runId || payload.runId === state.runId) {
          state.completed = true;
          state.completedRunId = payload.runId ?? state.runId;
          state.runId = payload.runId ?? state.runId;
        }
      }
    }
  }
  const runWorkflow = state.runId ? readWorkflowFile(workflowPath(workspace, state.runId)) : null;
  if (state.aborted && runWorkflow && runWorkflow.phase !== "aborted") state.aborted = false;
  if (state.completed && runWorkflow && runWorkflow.phase !== "complete") state.completed = false;
  if (workflow && state.aborted && state.abortedRunId !== workflow.run_id) state.aborted = false;
  if (workflow && state.completed && state.completedRunId !== workflow.run_id) state.completed = false;
  if (state.aborted || state.completed) {
    state.active = false;
    return state;
  }
  if (workflow && isActivePhase(workflow.phase)) {
    state.active = true;
    state.runId = workflow.run_id;
    if (state.seal?.runId !== state.runId) state.seal = null;
  } else if (state.receipts.some((item) => item.tool === "research_begin")) {
    const begun = [...state.receipts].reverse().find((item) => item.tool === "research_begin");
    if (begun && !state.aborted && !state.completed) {
      state.active = true;
      state.runId = begun.runId ?? state.runId;
      if (state.seal?.runId !== state.runId) state.seal = null;
    }
  }
  return state;
}

// plugins/knowledge-work/modules/research/src/entries/hooks/evidence-based-research.ts
var MCP_TOOL = /(?:^|_)research_provenance__(research_begin|source_capture|source_read|source_anchor|research_status|research_seal)$/iu;
var SESSION_CONTEXT = [
  "[Research Provenance Guard] Research entry routing",
  "Invoke research-evidence-workflow and open a project run under .research/runs/ when the final deliverable requires multiple sourced claims, a durable evidence package, or persistent research state.",
  "Use the current host's built-in web search for candidate discovery: Claude Code uses WebSearch/WebFetch; Codex uses its registered web search tool. Do not require provider API keys or standalone search CLIs.",
  "Invoke the bundled handoff method only after the run is sealed and handoffs/outbound files exist.",
  "Hard enforcement (CLI block, Stop seal) starts only after a durable project workflow run is open\u2014not because this SessionStart text appeared.",
  "Keep single-URL fetches, single-fact checks, pure local code Q&A, and user-explicit skips on the direct path unless the requested deliverable needs that durable research contract."
].join("\n");
function objectLike(value) {
  return typeof value === "object" && value !== null;
}
function mcpMethod(event) {
  return String(eventToolName(event)).match(MCP_TOOL)?.[1] ?? null;
}
function responsePayload(event) {
  const response = eventToolResponse(event);
  if (objectLike(response) && objectLike(response.structuredContent)) return response.structuredContent;
  if (objectLike(response) && Array.isArray(response.content)) {
    const textItem = response.content.find((item) => objectLike(item) && item.type === "text");
    const text = objectLike(textItem) && typeof textItem.text === "string" ? textItem.text : void 0;
    try {
      const parsed = JSON.parse(String(text));
      return objectLike(parsed) ? parsed : null;
    } catch {
    }
  }
  if (typeof response === "string") {
    try {
      const parsed = JSON.parse(response);
      return objectLike(parsed) ? parsed : null;
    } catch {
    }
  }
  return null;
}
function writeTargetClasses(event) {
  const command = shellCommand(event) ?? "";
  const serialized = JSON.stringify(eventToolInput(event)) + command;
  if (!pathLooksLikeResearchWrite(serialized)) return [];
  const paths = extractResearchRelativePaths(serialized);
  if (paths.length === 0) return ["orchestration"];
  return [...new Set(paths.map((path) => classifyResearchPath(path)))];
}
function callsFirecrawlCli(command) {
  return String(command ?? "").split(/(?:&&|\|\||[;|\n])/u).some((segment) => /^(?:(?:command|sudo)(?:\s+--?[^\s]+)*\s+)*(?:env(?:\s+[A-Za-z_][A-Za-z0-9_]*=[^\s]+)*\s+)?(?:npx(?:\s+--?[^\s]+)*\s+)?["']?(?:[^\s"']*\/)?firecrawl["']?(?:\s|$)/iu.test(segment.trim()));
}
function shellCommandIsReadOnly(command) {
  const value = String(command ?? "").trim();
  if (!value || /[<>`]|\$\(/u.test(value)) return false;
  const invocations = shellCommandInvocations(value);
  if (invocations.length === 0) return false;
  return invocations.every(({ executable, args }) => {
    if ((/* @__PURE__ */ new Set(["cat", "file", "grep", "head", "jq", "ls", "pwd", "rg", "stat", "tail", "wc"])).has(executable)) {
      return executable !== "rg" || !args.some((arg) => arg === "--pre" || arg.startsWith("--pre="));
    }
    if (executable === "sed") return !args.some((arg) => arg === "--in-place" || arg.startsWith("--in-place=") || /^-[^-]*i/u.test(arg));
    if (executable === "find") return !args.some((arg) => ["-delete", "-exec", "-execdir", "-fprint", "-fprint0", "-fprintf", "-fls", "-ok", "-okdir"].includes(arg));
    if (executable === "git") return ["diff", "log", "rev-parse", "show", "status"].includes(args[0] ?? "") && !args.some((arg) => arg === "--output" || arg.startsWith("--output="));
    return executable === "node" && args[0] === "--check";
  });
}
function trustedWorkflowCommand(command, subcommand) {
  const pluginRoot = process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return false;
  const script = join4(resolve3(pluginRoot), "scripts", "research-workflow.mjs");
  const value = String(command ?? "").trim();
  if (/[\n;&|><`]|\$\(/u.test(value)) return false;
  const exact = [
    `node "${script}" ${subcommand}`,
    `node '${script}' ${subcommand}`,
    `node ${script} ${subcommand}`,
    `"${script}" ${subcommand}`,
    `'${script}' ${subcommand}`,
    `${script} ${subcommand}`
  ].some((prefix) => value === prefix || value.startsWith(`${prefix} `));
  return exact;
}
function destructiveResearchCommand(command) {
  const value = String(command ?? "");
  return /(?:^|[\s;&|])(?:rm|mv|truncate)(?:\s|$)|\bfind\b[^\n]*(?:-delete|-exec\s+rm|-execdir\s+rm)\b/iu.test(value);
}
function preDecision(event, state) {
  const method = mcpMethod(event);
  if (method === "research_begin") {
    if (!appendStateEvent(event, "receipt", { tool: "research_begin_preflight", promptEpoch: state.promptEpoch })) {
      return "research plugin data is unavailable; cannot establish a durable evidence session.";
    }
    const input = eventToolInput(event);
    if (Number(input?.prompt_epoch) !== state.promptEpoch) {
      return `research_begin requires current prompt_epoch=${state.promptEpoch}.`;
    }
    return null;
  }
  if (method === "research_seal" && state.active) {
    const input = eventToolInput(event);
    if (Number(input?.prompt_epoch) !== state.promptEpoch || Number(input?.mutation_revision) !== state.revision) {
      return `research_seal is stale; retry with prompt_epoch=${state.promptEpoch} and mutation_revision=${state.revision}.`;
    }
  }
  if (!state.active) return null;
  const command = shellCommand(event);
  if (callsFirecrawlCli(command)) {
    return "Active research runs must use the host's built-in web search for discovery and source_capture for evidence; direct Firecrawl CLI calls are blocked.";
  }
  const classes = writeTargetClasses(event);
  const shellWrite = command && !shellCommandIsReadOnly(command);
  const mutating = fileMutation(event) || shellWrite;
  if (!mutating || classes.length === 0) return null;
  if (classes.includes("seal")) {
    return "Direct writes to research.json/report.md are blocked; only research_seal may generate canonical evidence artifacts.";
  }
  if (classes.includes("workflow")) {
    return "Direct writes to workflow.json are blocked; use the research workflow CLI, MCP service, or the exact user abort prompt.";
  }
  if (destructiveResearchCommand(command)) {
    return "Destructive changes to an active .research run are blocked; use the exact user abort prompt to abandon it.";
  }
  const sealed = state.workflow && (state.workflow.completeness?.sealed === true || SEALED_OR_LATER.has(state.workflow.phase));
  if (classes.includes("outbound")) {
    if (!sealed) return "Outbound handoff files are blocked until the research run is sealed; finish capture, claims, and research_seal first.";
    return "Direct outbound handoff writes are blocked; use research-workflow.mjs handoff-outbound with non-empty input files.";
  }
  return null;
}
function post(event) {
  const state = readState(event);
  const method = mcpMethod(event);
  if (method) {
    const payload = responsePayload(event);
    const rawResponse = eventToolResponse(event);
    const responseIsError = objectLike(rawResponse) && rawResponse.isError === true;
    if (!payload || payload.isError === true || responseIsError) return null;
    appendStateEvent(event, "receipt", {
      tool: method,
      eventId: payload.event_id ?? null,
      runId: payload.run_id ?? state.runId,
      seal: payload.seal ?? null,
      promptEpoch: state.promptEpoch,
      revision: state.revision,
      observedAt: Date.now()
    });
    return null;
  }
  if (!state.active) return null;
  if (state.seal?.seal) return null;
  if (trustedWorkflowCommand(shellCommand(event), "handoff-outbound")) return null;
  let mutated = false;
  if (fileMutation(event)) mutated = appendStateEvent(event, "mutation", { tool: eventToolName(event) });
  else if (shellCommand(event) && !shellCommandIsReadOnly(shellCommand(event))) {
    mutated = appendStateEvent(event, "mutation", { tool: eventToolName(event), conservative: true });
  }
  return mutated ? readState(event) : null;
}
async function evaluateStop(event) {
  const state = readState(event);
  if (!state.active || state.aborted) return { allow: true, findings: [], state, trailer: null };
  const trailer = parseTrailer(eventAssistantMessage(event));
  const findings = [];
  if (!trailer) findings.push("final response is missing the exact research-evidence/v1 trailer");
  if (!state.seal?.seal) findings.push("no successful research_seal MCP receipt was observed in this session");
  if (state.seal?.runId && state.runId && state.seal.runId !== state.runId) findings.push("research seal belongs to a different research run");
  if (trailer && state.seal?.seal && (trailer.seal !== state.seal.seal || trailer.runId !== state.seal.runId)) {
    findings.push("final trailer does not match the observed MCP seal receipt");
  }
  if (state.seal && (state.seal.promptEpoch !== state.promptEpoch || state.seal.revision !== state.revision)) {
    findings.push("research seal is stale after a new prompt or workspace mutation");
  }
  if (trailer && findings.length === 0) {
    findings.push(...await validateSealedArtifacts({
      workspaceRoot: resolve3(eventCwd(event)),
      runId: trailer.runId,
      seal: trailer.seal,
      promptEpoch: state.promptEpoch,
      mutationRevision: state.revision
    }));
  }
  return { allow: findings.length === 0, findings: [...new Set(findings)], state, trailer };
}
async function main(mode = process.argv[2]) {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (mode === "session") {
    writeJson({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: SESSION_CONTEXT } });
  } else if (mode === "prompt") {
    const text = eventPrompt(event).trim();
    const abort = text === "# research-abort";
    const prior = readState(event);
    if (!abort && !prior.active) return;
    if (!appendStateEvent(event, "prompt", { abort, runId: prior.runId }) && abort) {
      writeJson({ decision: "block", reason: "research plugin data is unavailable; cannot record research abort." });
      return;
    }
    if (abort) {
      if (prior.workflow && !terminalizeWorkflow(resolve3(eventCwd(event)), prior.workflow.run_id, "aborted")) {
        writeJson({ decision: "block", reason: "research workflow could not be terminalized after the abort request." });
        return;
      }
      writeJson({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "[Research Provenance Guard] Research abort recorded. Hard mode will not require a seal for this session after abort."
        }
      });
      return;
    }
    const state = readState(event);
    if (state.active) {
      writeJson({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: `[Research Provenance Guard] Active research run ${state.runId ?? "(unknown)"} phase=${state.workflowPhase ?? "unknown"}; prompt_epoch=${state.promptEpoch}; mutation_revision=${state.revision}. Use research_provenance MCP only for evidence; seal after last mutation; outbound handoff only after sealed.`
        }
      });
    }
  } else if (mode === "pre") {
    const prior = readState(event);
    const reason = preDecision(event, prior);
    if (reason) writeJson({ decision: "block", reason });
  } else if (mode === "post") {
    post(event);
  } else if (mode === "stop") {
    const result = await evaluateStop(event);
    if (!result.allow) {
      writeJson({
        decision: "block",
        reason: `[Research Provenance Guard] Completion blocked.
- ${result.findings.join("\n- ")}
Recovery: open/use research-evidence-workflow, capture and anchor through research_provenance, call research_seal after the last mutation, paste its exact trailer. Outbound handoff only after seal. To abandon, submit exactly # research-abort.`
      });
    } else if (result.trailer) {
      const terminalized = !result.state.workflow || terminalizeWorkflow(resolve3(eventCwd(event)), result.trailer.runId, "complete");
      const recorded = terminalized && appendStateEvent(event, "complete", { runId: result.trailer.runId });
      if (!recorded || !terminalized) {
        writeJson({ decision: "block", reason: "[Research Provenance Guard] Completion could not be recorded durably; retry Stop without changing the workspace." });
      }
    }
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve3(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[evidence-based-research] failed closed: ${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 2;
  });
}
export {
  evaluateStop
};
