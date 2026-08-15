#!/usr/bin/env node
// harness-source-hash: sha256:2aff1d064d6b7d23103f1a68f7475ebcbee3145b1fa48dc93f13d01953380e8b
import {
  canonicalJson,
  sealPayload,
  sha256
} from "../chunks/chunk-NXSTRNUW.mjs";
import {
  SEALED_OR_LATER,
  classifyResearchPath,
  extractResearchRelativePaths,
  findActiveWorkflow,
  isActivePhase,
  pathLooksLikeResearchWrite,
  readWorkflowFile,
  terminalizeWorkflow,
  workflowPath
} from "../chunks/chunk-EHHD26IL.mjs";

// plugins/research-provenance-guard/src/entries/hooks/research-provenance-guard.ts
import { join as join3, resolve as resolve3 } from "node:path";
import { fileURLToPath } from "node:url";

// plugins/research-provenance-guard/src/lib/seal-validator.ts
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
function parseTrailer(message) {
  const match = String(message).match(/(?:^|\n)Research-Evidence: research-evidence\/v1\nResearch-Run: ([a-z0-9-]+)\nResearch-Seal: (sha256:[a-f0-9]{64})(?:\n|$)/u);
  return match ? { runId: match[1], seal: match[2] } : null;
}
async function validateSealedArtifacts({ workspaceRoot, runId, seal, promptEpoch, mutationRevision }) {
  const findings = [];
  if (!/^r-[a-z0-9-]+$/u.test(runId ?? "")) return ["invalid research run id"];
  const directory2 = join(resolve(workspaceRoot), ".research", "runs", runId);
  let manifest;
  let report;
  try {
    manifest = JSON.parse(await readFile(join(directory2, "research.json"), "utf8"));
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
  if (!integrity || integrity.seal !== seal) findings.push("research seal does not match manifest");
  const manifestPayloadHash = sha256(canonicalJson(base));
  const reportHash = sha256(report);
  if (integrity?.manifest_payload_sha256 !== manifestPayloadHash) findings.push("manifest hash mismatch");
  if (integrity?.report_sha256 !== reportHash) findings.push("report hash mismatch");
  const expectedPayload = sealPayload({ runId, promptEpoch: base.prompt_epoch, mutationRevision: base.mutation_revision, manifestPayloadHash, reportHash });
  const expectedSeal = `sha256:${sha256(canonicalJson(expectedPayload))}`;
  if (expectedSeal !== seal) findings.push("research seal digest mismatch");
  if (promptEpoch !== void 0 && base.prompt_epoch !== promptEpoch) findings.push("research seal is from a stale prompt epoch");
  if (mutationRevision !== void 0 && base.mutation_revision !== mutationRevision) findings.push("workspace changed after research seal");
  return [...new Set(findings)];
}

// plugins/research-provenance-guard/src/lib/state-store.ts
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join as join2, resolve as resolve2 } from "node:path";

// plugins/research-provenance-guard/src/lib/hook-io.ts
var FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/iu;
var SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;
async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: true };
  }
}
var sessionId = (event) => event?.session_id ?? event?.sessionId ?? process.env.AI_EXPERTS_SESSION_ID ?? null;
var cwd = (event) => event?.cwd ?? event?.working_directory ?? process.cwd();
var prompt = (event) => typeof (event?.prompt ?? event?.user_prompt) === "string" ? event.prompt ?? event.user_prompt : "";
var assistantMessage = (event) => typeof (event?.last_assistant_message ?? event?.assistant_text) === "string" ? event.last_assistant_message ?? event.assistant_text : "";
var toolName = (event) => event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
var toolInput = (event) => event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? {};
var toolResponse = (event) => event?.tool_response ?? event?.toolResponse ?? event?.tool_result ?? event?.toolResult ?? event?.response ?? null;
function shellCommand(event) {
  if (!SHELL_TOOLS.test(String(toolName(event)))) return null;
  const input = toolInput(event);
  return typeof (input?.command ?? input?.cmd) === "string" ? input.command ?? input.cmd : null;
}
function fileMutation(event) {
  return FILE_TOOLS.test(String(toolName(event)));
}
function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}
`);
}

// plugins/research-provenance-guard/src/lib/state-store.ts
var TTL_MS = 24 * 60 * 60 * 1e3;
function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
var STATE_DIR_RELATIVE = ".research/state";
function ensureStateDir(directory2) {
  mkdirSync(directory2, { recursive: true, mode: 448 });
  const ignore = join2(dirname(directory2), ".gitignore");
  try {
    readFileSync(ignore, "utf8");
  } catch {
    writeFileSync(ignore, "state/\n", { encoding: "utf8", mode: 384 });
  }
}
function directory(event) {
  const session = sessionId(event) || "default";
  const target = join2(resolve2(cwd(event)), STATE_DIR_RELATIVE, "hook-events", hash(session));
  return target;
}
function appendStateEvent(event, type, payload = {}) {
  const target = directory(event);
  if (!target) return false;
  try {
    ensureStateDir(join2(resolve2(cwd(event)), STATE_DIR_RELATIVE));
    mkdirSync(target, { recursive: true, mode: 448 });
    const stamp = `${String(Date.now()).padStart(13, "0")}-${process.hrtime.bigint()}-${process.pid}-${randomBytes(5).toString("hex")}`;
    writeFileSync(join2(target, `${stamp}.json`), `${JSON.stringify({ version: 1, type, at: Date.now(), payload })}
`, { encoding: "utf8", mode: 384, flag: "wx" });
    return true;
  } catch {
    return false;
  }
}
function readState(event) {
  const workspace = resolve2(cwd(event));
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
        item = JSON.parse(readFileSync(join2(target, file), "utf8"));
      } catch {
        continue;
      }
      if (Date.now() - Number(item.at ?? 0) > TTL_MS) {
        try {
          unlinkSync(join2(target, file));
        } catch {
        }
        continue;
      }
      if (item.type === "prompt") {
        state.promptEpoch += 1;
        if (item.payload.abort === true) {
          state.aborted = true;
          state.abortedRunId = item.payload.runId ?? state.runId;
          state.runId = item.payload.runId ?? state.runId;
        }
      } else if (item.type === "mutation") {
        state.revision += 1;
        state.seal = null;
      } else if (item.type === "receipt") {
        state.receipts.push(item.payload);
        if (item.payload.tool === "research_begin") {
          state.runId = item.payload.runId ?? state.runId;
          state.seal = null;
          state.aborted = false;
          state.completed = false;
        }
        if (item.payload.tool === "research_seal" && (!state.runId || item.payload.runId === state.runId)) state.seal = item.payload;
      } else if (item.type === "complete") {
        if (!item.payload.runId || !state.runId || item.payload.runId === state.runId) {
          state.completed = true;
          state.completedRunId = item.payload.runId ?? state.runId;
          state.runId = item.payload.runId ?? state.runId;
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

// plugins/research-provenance-guard/src/entries/hooks/research-provenance-guard.ts
var MCP_TOOL = /(?:^|_)research_provenance__(research_begin|source_discover|source_capture|source_read|source_anchor|research_status|research_seal)$/iu;
var SESSION_CONTEXT = [
  "[Research Provenance Guard] Research entry routing",
  "For research, investigation of APIs/docs/specs/facts, source-backed findings, or multi-source evidence work, invoke research-evidence-workflow first and open a project run under .research/runs/.",
  "Do not start such tasks by invoking standalone firecrawl, research, or arxiv-search skills. Use them only as phase techniques under the orchestrator; optional ordinary helpers return leads that the parent must verify.",
  "Invoke handoff only after the run is sealed and handoffs/outbound files exist.",
  "Hard enforcement (CLI block, Stop seal) starts only after a durable project workflow run is open\u2014not because this SessionStart text appeared.",
  "Narrow escape: single-URL fetch with no multi-claim research intent, pure local code Q&A, or user-explicit skip may omit the orchestrator. Prefer the orchestrator when unsure if claims will be treated as evidence."
].join("\n");
function mcpMethod(event) {
  return String(toolName(event)).match(MCP_TOOL)?.[1] ?? null;
}
function responsePayload(event) {
  const response = toolResponse(event);
  if (response?.structuredContent && typeof response.structuredContent === "object") return response.structuredContent;
  if (response?.content && Array.isArray(response.content)) {
    const text = response.content.find((item) => item?.type === "text")?.text;
    try {
      return JSON.parse(text);
    } catch {
    }
  }
  if (typeof response === "string") {
    try {
      return JSON.parse(response);
    } catch {
    }
  }
  return null;
}
function writeTargetClasses(event) {
  const command = shellCommand(event) ?? "";
  const serialized = JSON.stringify(toolInput(event)) + command;
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
  if (!value || /[\n;&|><`]|\$\(/u.test(value)) return false;
  return /^(?:cat|pwd|ls|rg|grep|head|tail|jq|wc|stat|file)\b/iu.test(value) || /^sed\b/iu.test(value) && !/(?:^|\s)-(?:[^\s]*i|--in-place)(?:\s|=|$)/iu.test(value) || /^find\b/iu.test(value) && !/(?:-delete|-exec|-execdir|>)/iu.test(value) || /^git\s+(?:status|diff|log|show|rev-parse)\b/iu.test(value) && !/--output(?:=|\s)/iu.test(value) || /^node\s+--check\b/iu.test(value);
}
function trustedWorkflowCommand(command, subcommand) {
  const pluginRoot = process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return false;
  const script = join3(resolve3(pluginRoot), "scripts", "research-workflow.mjs");
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
    const input = toolInput(event);
    if (Number(input?.prompt_epoch) !== state.promptEpoch) {
      return `research_begin requires current prompt_epoch=${state.promptEpoch}.`;
    }
    return null;
  }
  if (method === "research_seal" && state.active) {
    const input = toolInput(event);
    if (Number(input?.prompt_epoch) !== state.promptEpoch || Number(input?.mutation_revision) !== state.revision) {
      return `research_seal is stale; retry with prompt_epoch=${state.promptEpoch} and mutation_revision=${state.revision}.`;
    }
  }
  if (!state.active) return null;
  const command = shellCommand(event);
  if (callsFirecrawlCli(command)) {
    return "Active research runs must use source_discover/source_capture through the research_provenance MCP service; direct Firecrawl CLI calls are blocked.";
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
    if (!payload || payload.isError === true || toolResponse(event)?.isError === true) return null;
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
  if (fileMutation(event)) mutated = appendStateEvent(event, "mutation", { tool: toolName(event) });
  else if (shellCommand(event) && !shellCommandIsReadOnly(shellCommand(event))) {
    mutated = appendStateEvent(event, "mutation", { tool: toolName(event), conservative: true });
  }
  return mutated ? readState(event) : null;
}
async function evaluateStop(event) {
  const state = readState(event);
  if (!state.active || state.aborted) return { allow: true, state };
  const trailer = parseTrailer(assistantMessage(event));
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
      workspaceRoot: resolve3(cwd(event)),
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
    const text = prompt(event).trim();
    const abort = text === "# research-abort";
    const prior = readState(event);
    if (!appendStateEvent(event, "prompt", { abort, runId: prior.runId }) && abort) {
      writeJson({ decision: "block", reason: "research plugin data is unavailable; cannot record research abort." });
      return;
    }
    if (abort) {
      if (prior.workflow && !terminalizeWorkflow(resolve3(cwd(event)), prior.workflow.run_id, "aborted")) {
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
      const terminalized = !result.state.workflow || terminalizeWorkflow(resolve3(cwd(event)), result.trailer.runId, "complete");
      const recorded = terminalized && appendStateEvent(event, "complete", { runId: result.trailer.runId });
      if (!recorded || !terminalized) {
        writeJson({ decision: "block", reason: "[Research Provenance Guard] Completion could not be recorded durably; retry Stop without changing the workspace." });
      }
    }
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve3(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[research-provenance-guard] failed closed: ${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 2;
  });
}
export {
  evaluateStop
};
