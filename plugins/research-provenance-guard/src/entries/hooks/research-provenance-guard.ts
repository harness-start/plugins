#!/usr/bin/env node

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { HookEvent } from "@harness/core/hook-event";

import { validateSealedArtifacts, parseTrailer, type ResearchTrailer } from "../../lib/seal-validator.js";
import { appendStateEvent, readState, type ResearchHookState } from "../../lib/state-store.js";
import {
  classifyResearchPath,
  extractResearchRelativePaths,
  pathLooksLikeResearchWrite,
  SEALED_OR_LATER,
  terminalizeWorkflow,
} from "../../lib/workflow-fs.js";
import { assistantMessage, cwd, fileMutation, prompt, readStdinJson, shellCommand, toolInput, toolName, toolResponse, writeJson } from "../../lib/hook-io.js";

const MCP_TOOL = /(?:^|_)research_provenance__(research_begin|source_discover|source_capture|source_read|source_anchor|research_status|research_seal)$/iu;

const SESSION_CONTEXT = [
  "[Research Provenance Guard] Research entry routing",
  "For research, investigation of APIs/docs/specs/facts, source-backed findings, or multi-source evidence work, invoke research-evidence-workflow first and open a project run under .research/runs/.",
  "Do not start such tasks by invoking standalone firecrawl, research, or arxiv-search skills. Use them only as phase techniques under the orchestrator; optional ordinary helpers return leads that the parent must verify.",
  "Invoke handoff only after the run is sealed and handoffs/outbound files exist.",
  "Hard enforcement (CLI block, Stop seal) starts only after a durable project workflow run is open—not because this SessionStart text appeared.",
  "Narrow escape: single-URL fetch with no multi-claim research intent, pure local code Q&A, or user-explicit skip may omit the orchestrator. Prefer the orchestrator when unsure if claims will be treated as evidence.",
].join("\n");

type McpResponsePayload = {
  isError?: unknown;
  event_id?: unknown;
  run_id?: unknown;
  seal?: unknown;
};

export type StopEvaluation = {
  allow: boolean;
  findings: string[];
  state: ResearchHookState;
  trailer: ResearchTrailer | null;
};

function objectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mcpMethod(event: HookEvent): string | null {
  return String(toolName(event)).match(MCP_TOOL)?.[1] ?? null;
}

function responsePayload(event: HookEvent): McpResponsePayload | null {
  const response = toolResponse(event);
  if (objectLike(response) && objectLike(response.structuredContent)) return response.structuredContent;
  if (objectLike(response) && Array.isArray(response.content)) {
    const textItem = response.content.find((item) => objectLike(item) && item.type === "text");
    const text = objectLike(textItem) && typeof textItem.text === "string" ? textItem.text : undefined;
    try {
      const parsed: unknown = JSON.parse(String(text));
      return objectLike(parsed) ? parsed : null;
    } catch {}
  }
  if (typeof response === "string") {
    try {
      const parsed: unknown = JSON.parse(response);
      return objectLike(parsed) ? parsed : null;
    } catch {}
  }
  return null;
}

function writeTargetClasses(event: HookEvent): string[] {
  const command = shellCommand(event) ?? "";
  const serialized = JSON.stringify(toolInput(event)) + command;
  if (!pathLooksLikeResearchWrite(serialized)) return [];
  const paths = extractResearchRelativePaths(serialized);
  if (paths.length === 0) return ["orchestration"];
  return [...new Set(paths.map((path) => classifyResearchPath(path)))];
}

function callsFirecrawlCli(command: string | null): boolean {
  return String(command ?? "")
    .split(/(?:&&|\|\||[;|\n])/u)
    .some((segment) => /^(?:(?:command|sudo)(?:\s+--?[^\s]+)*\s+)*(?:env(?:\s+[A-Za-z_][A-Za-z0-9_]*=[^\s]+)*\s+)?(?:npx(?:\s+--?[^\s]+)*\s+)?["']?(?:[^\s"']*\/)?firecrawl["']?(?:\s|$)/iu.test(segment.trim()));
}

function shellCommandIsReadOnly(command: string | null): boolean {
  const value = String(command ?? "").trim();
  if (!value || /[\n;&|><`]|\$\(/u.test(value)) return false;
  return /^(?:cat|pwd|ls|rg|grep|head|tail|jq|wc|stat|file)\b/iu.test(value)
    || (/^sed\b/iu.test(value) && !/(?:^|\s)-(?:[^\s]*i|--in-place)(?:\s|=|$)/iu.test(value))
    || (/^find\b/iu.test(value) && !/(?:-delete|-exec|-execdir|>)/iu.test(value))
    || (/^git\s+(?:status|diff|log|show|rev-parse)\b/iu.test(value) && !/--output(?:=|\s)/iu.test(value))
    || /^node\s+--check\b/iu.test(value);
}

function trustedWorkflowCommand(command: string | null, subcommand: string): boolean {
  const pluginRoot = process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return false;
  const script = join(resolve(pluginRoot), "scripts", "research-workflow.mjs");
  const value = String(command ?? "").trim();
  if (/[\n;&|><`]|\$\(/u.test(value)) return false;
  const exact = [
    `node "${script}" ${subcommand}`,
    `node '${script}' ${subcommand}`,
    `node ${script} ${subcommand}`,
    `"${script}" ${subcommand}`,
    `'${script}' ${subcommand}`,
    `${script} ${subcommand}`,
  ].some((prefix) => value === prefix || value.startsWith(`${prefix} `));
  return exact;
}

function destructiveResearchCommand(command: string | null): boolean {
  const value = String(command ?? "");
  return /(?:^|[\s;&|])(?:rm|mv|truncate)(?:\s|$)|\bfind\b[^\n]*(?:-delete|-exec\s+rm|-execdir\s+rm)\b/iu.test(value);
}

function preDecision(event: HookEvent, state: ResearchHookState): string | null {
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

function post(event: HookEvent): ResearchHookState | null {
  const state = readState(event);
  const method = mcpMethod(event);
  if (method) {
    const payload = responsePayload(event);
    const rawResponse = toolResponse(event);
    const responseIsError = objectLike(rawResponse) && rawResponse.isError === true;
    if (!payload || payload.isError === true || responseIsError) return null;
    appendStateEvent(event, "receipt", {
      tool: method,
      eventId: payload.event_id ?? null,
      runId: payload.run_id ?? state.runId,
      seal: payload.seal ?? null,
      promptEpoch: state.promptEpoch,
      revision: state.revision,
      observedAt: Date.now(),
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

export async function evaluateStop(event: HookEvent): Promise<StopEvaluation> {
  const state = readState(event);
  if (!state.active || state.aborted) return { allow: true, findings: [], state, trailer: null };
  // After handed_off or sealed with trailer, still require seal integrity until complete/abort
  const trailer = parseTrailer(assistantMessage(event));
  const findings: string[] = [];
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
      workspaceRoot: resolve(cwd(event)),
      runId: trailer.runId,
      seal: trailer.seal,
      promptEpoch: state.promptEpoch,
      mutationRevision: state.revision,
    }));
  }
  return { allow: findings.length === 0, findings: [...new Set(findings)], state, trailer };
}

async function main(mode: string | undefined = process.argv[2]): Promise<void> {
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
      if (prior.workflow && !terminalizeWorkflow(resolve(cwd(event)), prior.workflow.run_id, "aborted")) {
        writeJson({ decision: "block", reason: "research workflow could not be terminalized after the abort request." });
        return;
      }
      writeJson({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "[Research Provenance Guard] Research abort recorded. Hard mode will not require a seal for this session after abort.",
        },
      });
      return;
    }
    const state = readState(event);
    if (state.active) {
      writeJson({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: `[Research Provenance Guard] Active research run ${state.runId ?? "(unknown)"} phase=${state.workflowPhase ?? "unknown"}; prompt_epoch=${state.promptEpoch}; mutation_revision=${state.revision}. Use research_provenance MCP only for evidence; seal after last mutation; outbound handoff only after sealed.`,
        },
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
        reason: `[Research Provenance Guard] Completion blocked.\n- ${result.findings.join("\n- ")}\nRecovery: open/use research-evidence-workflow, capture and anchor through research_provenance, call research_seal after the last mutation, paste its exact trailer. Outbound handoff only after seal. To abandon, submit exactly # research-abort.`,
      });
    } else if (result.trailer) {
      const terminalized = !result.state.workflow || terminalizeWorkflow(resolve(cwd(event)), result.trailer.runId, "complete");
      const recorded = terminalized && appendStateEvent(event, "complete", { runId: result.trailer.runId });
      if (!recorded || !terminalized) {
        writeJson({ decision: "block", reason: "[Research Provenance Guard] Completion could not be recorded durably; retry Stop without changing the workspace." });
      }
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    process.stderr.write(`[research-provenance-guard] failed closed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
