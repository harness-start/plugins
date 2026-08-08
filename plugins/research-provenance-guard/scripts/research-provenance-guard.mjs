#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateSealedArtifacts, parseTrailer } from "./lib/seal-validator.mjs";
import { appendStateEvent, readState } from "./lib/state-store.mjs";
import {
  classifyResearchPath,
  extractResearchRelativePaths,
  pathLooksLikeResearchWrite,
  SEALED_OR_LATER,
} from "./lib/workflow-fs.mjs";
import { assistantMessage, cwd, fileMutation, prompt, readStdinJson, shellCommand, toolInput, toolName, toolResponse, writeJson } from "./lib/hook-io.mjs";

const MCP_TOOL = /(?:^|_)research_provenance__(research_begin|source_discover|source_capture|source_read|source_anchor|research_status|research_seal)$/iu;

const SESSION_CONTEXT = [
  "[Research Provenance Guard] Research entry routing",
  "For research, investigation of APIs/docs/specs/facts, source-backed findings, or multi-source evidence work, invoke research-evidence-workflow first and open a project run under .research/runs/.",
  "Do not start such tasks by invoking standalone firecrawl or research skills. Use them only as phase workers under the orchestrator (discover / subagent technique).",
  "Invoke handoff only after the run is sealed and handoffs/outbound files exist.",
  "Hard enforcement (CLI block, Stop seal) starts only after a durable project workflow run is open—not because this SessionStart text appeared.",
  "Narrow escape: single-URL fetch with no multi-claim research intent, pure local code Q&A, or user-explicit skip may omit the orchestrator. Prefer the orchestrator when unsure if claims will be treated as evidence.",
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
    } catch {}
  }
  if (typeof response === "string") {
    try {
      return JSON.parse(response);
    } catch {}
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
  if (command && /(?:^|\s)(?:npx(?:\s+--[^\s]+)*\s+)?firecrawl(?:\s|$)/iu.test(command)) {
    return "Active research runs must use source_discover/source_capture through the research_provenance MCP service; direct Firecrawl CLI calls are blocked.";
  }

  const classes = writeTargetClasses(event);
  const shellWrite = command && /(?:^|\s)(?:cp|install|mkdir|mv|perl\s+-p?i|rm|sed\s+-[^\s]*i|tee|touch|truncate)(?:\s|$)|>{1,2}/iu.test(command);
  const mutating = fileMutation(event) || shellWrite;
  if (!mutating || classes.length === 0) return null;

  if (classes.includes("seal")) {
    return "Direct writes to research.json/report.md are blocked; only research_seal may generate canonical evidence artifacts.";
  }
  const sealed = state.workflow && (state.workflow.completeness?.sealed === true || SEALED_OR_LATER.has(state.workflow.phase));
  if (classes.includes("outbound") && !sealed) {
    return "Outbound handoff files are blocked until the research run is sealed; finish capture, claims, and research_seal first.";
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
      observedAt: Date.now(),
    });
    return null;
  }
  if (!state.active) return null;
  let mutated = false;
  if (fileMutation(event)) mutated = appendStateEvent(event, "mutation", { tool: toolName(event) });
  else if (shellCommand(event) && !/^\s*(?:cat|echo|pwd|ls|find|rg|grep|sed|head|tail|git\s+(?:status|diff|log|show)|node\s+--check)\b/iu.test(shellCommand(event))) {
    mutated = appendStateEvent(event, "mutation", { tool: toolName(event), conservative: true });
  }
  return mutated ? readState(event) : null;
}

export async function evaluateStop(event) {
  const state = readState(event);
  if (!state.active || state.aborted) return { allow: true, state };
  // After handed_off or sealed with trailer, still require seal integrity until complete/abort
  const trailer = parseTrailer(assistantMessage(event));
  const findings = [];
  if (!trailer) findings.push("final response is missing the exact research-evidence/v1 trailer");
  if (trailer) {
    const outside = assistantMessage(event)
      .replace(/(?:^|\n)Research-Evidence: research-evidence\/v1\nResearch-Run: [a-z0-9-]+\nResearch-Seal: sha256:[a-f0-9]{64}(?:\n|$)/u, "\n")
      .trim();
    const pointerMatch = outside.match(/^(?:Research report:\s*)?(?:\[Research report\]\()?\.research\/runs\/([a-z0-9-]+)\/report\.md\)?$/u);
    if (outside && (!pointerMatch || pointerMatch[1] !== trailer.runId)) {
      findings.push("hard-mode final response contains free-form prose outside the canonical report; return only its matching report pointer and the exact trailer");
    }
  }
  if (!state.seal?.seal) findings.push("no successful research_seal MCP receipt was observed in this session");
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

async function main(mode = process.argv[2]) {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (mode === "session") {
    writeJson({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: SESSION_CONTEXT } });
  } else if (mode === "prompt") {
    const text = prompt(event).trim();
    const abort = text === "# research-abort";
    if (!appendStateEvent(event, "prompt", { abort }) && abort) {
      writeJson({ decision: "block", reason: "research plugin data is unavailable; cannot record research abort." });
      return;
    }
    if (abort) {
      // Mark abort in hook stream; skill/CLI should also set workflow phase=aborted when possible
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
      appendStateEvent(event, "complete");
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[research-provenance-guard] failed closed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
