#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendSkillTrace,
  defaultWorkflow,
  ensureRunSkeleton,
  findActiveWorkflow,
  generateRunId,
  listWorkflows,
  readWorkflowFile,
  SEALED_OR_LATER,
  writeWorkflow,
  workflowPath,
} from "./lib/workflow-fs.mjs";

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) options[key] = true;
    else {
      options[key] = next;
      index += 1;
    }
  }
  return { options, positionals };
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function loadWorkflow(cwd, runId) {
  const path = workflowPath(cwd, runId);
  const workflow = readWorkflowFile(path);
  if (!workflow) throw new Error(`workflow not found: ${path}`);
  return workflow;
}

function saveBrief(cwd, runId, workflow) {
  const path = join(cwd, ".research", "runs", runId, "brief.md");
  const body = [
    `# Research brief: ${workflow.question || "(untitled)"}`,
    "",
    `- Scope: ${workflow.scope || ""}`,
    `- As of: ${workflow.as_of || ""}`,
    `- Run: ${runId}`,
    "",
    "## Non-goals",
    "",
    workflow.non_goals || "_None recorded._",
    "",
    "## Decision",
    "",
    workflow.decision || "_None recorded._",
    "",
  ].join("\n");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, "utf8");
}

function cmdRunOpen(cwd, options) {
  const existing = findActiveWorkflow(cwd);
  if (existing) throw new Error(`run ${existing.run_id} is already open (phase=${existing.phase})`);
  const runId = String(options["run-id"] ?? "").trim() || generateRunId();
  ensureRunSkeleton(cwd, runId);
  const workflow = defaultWorkflow({
    runId,
    question: String(options.question ?? "").trim(),
    scope: String(options.scope ?? "").trim(),
    asOf: String(options["as-of"] ?? options.as_of ?? "").trim(),
    promptEpoch: Number(options["prompt-epoch"] ?? 0),
    allowSoloMain: options["allow-solo-main"] === true || options["allow-solo-main"] === "true",
  });
  writeWorkflow(cwd, workflow);
  appendSkillTrace(cwd, runId, { phase: "open", skill: "research-evidence-workflow", mode: "invoke", notes: "run-open" });
  output({ ok: true, run_id: runId, phase: workflow.phase, path: workflowPath(cwd, runId) });
}

function cmdBriefWrite(cwd, options) {
  const runId = String(options["run-id"] ?? findActiveWorkflow(cwd)?.run_id ?? "").trim();
  if (!runId) throw new Error("--run-id or an active run is required");
  const workflow = loadWorkflow(cwd, runId);
  workflow.question = String(options.question ?? workflow.question ?? "").trim();
  workflow.scope = String(options.scope ?? workflow.scope ?? "").trim();
  workflow.as_of = String(options["as-of"] ?? options.as_of ?? workflow.as_of ?? "").trim();
  if (options["non-goals"] !== undefined) workflow.non_goals = String(options["non-goals"]);
  if (options.decision !== undefined) workflow.decision = String(options.decision);
  if (!workflow.question || !workflow.scope || !workflow.as_of) throw new Error("question, scope, and as-of are required");
  workflow.phase = "briefed";
  workflow.completeness.brief = true;
  writeWorkflow(cwd, workflow);
  saveBrief(cwd, runId, workflow);
  appendSkillTrace(cwd, runId, { phase: "briefed", skill: "research-evidence-workflow", mode: "invoke", artifact_paths: [`brief.md`] });
  output({ ok: true, run_id: runId, phase: workflow.phase });
}

function cmdHandoffInbound(cwd, options) {
  const runId = String(options["run-id"] ?? findActiveWorkflow(cwd)?.run_id ?? "").trim();
  if (!runId) throw new Error("--run-id or an active run is required");
  if (!options.file) throw new Error("--file is required");
  const workflow = loadWorkflow(cwd, runId);
  const source = resolve(cwd, String(options.file));
  const raw = JSON.parse(readFileSync(source, "utf8"));
  const id = String(raw.id ?? "").trim();
  if (!/^[a-zA-Z0-9._-]{1,96}$/u.test(id)) throw new Error("inbound handoff id is required");
  if (typeof raw.dispatch_prompt !== "string" || !raw.dispatch_prompt.trim()) throw new Error("dispatch_prompt is required");
  ensureRunSkeleton(cwd, runId);
  const rel = `handoffs/inbound/${id}.json`;
  const dest = join(cwd, ".research", "runs", runId, rel);
  writeFileSync(dest, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  const entry = {
    id,
    role: raw.role ?? "researcher",
    handoff_path: rel,
    result_path: `handoffs/inbound/${id}.result.md`,
    status: "open",
    suggested_skills: Array.isArray(raw.suggested_skills) ? raw.suggested_skills : [],
  };
  workflow.subagents = [...(workflow.subagents ?? []).filter((item) => item.id !== id), entry];
  if (!["sealed", "handed_off", "complete", "aborted"].includes(workflow.phase)) workflow.phase = "discovering";
  writeWorkflow(cwd, workflow);
  appendSkillTrace(cwd, runId, {
    phase: workflow.phase,
    skill: "research",
    mode: "adapt",
    artifact_paths: [rel],
    notes: "inbound handoff registered",
  });
  output({ ok: true, run_id: runId, handoff_path: rel, dispatch_prompt_bytes: Buffer.byteLength(raw.dispatch_prompt, "utf8") });
}

function cmdHandoffResult(cwd, options) {
  const runId = String(options["run-id"] ?? findActiveWorkflow(cwd)?.run_id ?? "").trim();
  const id = String(options.id ?? "").trim();
  if (!runId || !id) throw new Error("--run-id and --id are required");
  if (!options.file) throw new Error("--file is required");
  const workflow = loadWorkflow(cwd, runId);
  const source = resolve(cwd, String(options.file));
  const text = readFileSync(source, "utf8");
  const rel = `handoffs/inbound/${id}.result.md`;
  const dest = join(cwd, ".research", "runs", runId, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, text, "utf8");
  workflow.subagents = (workflow.subagents ?? []).map((item) => (item.id === id ? { ...item, status: "delivered", result_path: rel } : item));
  writeWorkflow(cwd, workflow);
  output({ ok: true, run_id: runId, result_path: rel });
}

function cmdClaimsDraft(cwd, options) {
  const runId = String(options["run-id"] ?? findActiveWorkflow(cwd)?.run_id ?? "").trim();
  if (!runId) throw new Error("--run-id or an active run is required");
  if (!options.file) throw new Error("--file is required");
  const workflow = loadWorkflow(cwd, runId);
  const source = resolve(cwd, String(options.file));
  const claims = JSON.parse(readFileSync(source, "utf8"));
  if (!Array.isArray(claims) || claims.length === 0) throw new Error("claims must be a non-empty array");
  const dest = join(cwd, ".research", "runs", runId, "claims.draft.json");
  writeFileSync(dest, `${JSON.stringify(claims, null, 2)}\n`, "utf8");
  workflow.phase = "claims_drafted";
  workflow.completeness.all_claims_classified = claims.every((claim) => claim && typeof claim.status === "string");
  writeWorkflow(cwd, workflow);
  appendSkillTrace(cwd, runId, { phase: "claims_drafted", skill: "research-evidence-workflow", mode: "invoke", artifact_paths: ["claims.draft.json"] });
  output({ ok: true, run_id: runId, phase: workflow.phase, claim_count: claims.length });
}

function cmdCompleteness(cwd, options) {
  const runId = String(options["run-id"] ?? findActiveWorkflow(cwd)?.run_id ?? "").trim();
  if (!runId) throw new Error("--run-id or an active run is required");
  const workflow = loadWorkflow(cwd, runId);
  const canSeal = workflow.completeness?.brief === true || Boolean(workflow.question && workflow.scope && workflow.as_of);
  const canOutbound = SEALED_OR_LATER.has(workflow.phase) || workflow.completeness?.sealed === true;
  output({
    ok: true,
    run_id: runId,
    phase: workflow.phase,
    completeness: workflow.completeness,
    can_seal: canSeal,
    can_outbound: canOutbound,
    mcp: workflow.mcp,
  });
}

function cmdHandoffOutbound(cwd, options) {
  const runId = String(options["run-id"] ?? findActiveWorkflow(cwd)?.run_id ?? "").trim();
  if (!runId) throw new Error("--run-id or an active run is required");
  const workflow = loadWorkflow(cwd, runId);
  if (!workflow.completeness?.sealed && !SEALED_OR_LATER.has(workflow.phase)) {
    throw new Error("outbound handoff requires a sealed research run");
  }
  const handoffFile = options["handoff-file"] ? resolve(cwd, String(options["handoff-file"])) : null;
  const promptFile = options["prompt-file"] ? resolve(cwd, String(options["prompt-file"])) : null;
  if (!handoffFile || !promptFile) throw new Error("--handoff-file and --prompt-file are required");
  const handoff = readFileSync(handoffFile, "utf8");
  const prompt = readFileSync(promptFile, "utf8");
  if (!handoff.trim() || !prompt.trim()) throw new Error("handoff and prompt must be non-empty");
  ensureRunSkeleton(cwd, runId);
  const handoffRel = "handoffs/outbound/handoff.md";
  const promptRel = "handoffs/outbound/prompt.md";
  writeFileSync(join(cwd, ".research", "runs", runId, handoffRel), handoff, "utf8");
  writeFileSync(join(cwd, ".research", "runs", runId, promptRel), prompt, "utf8");
  workflow.phase = "handed_off";
  workflow.completeness.outbound_handoff = true;
  workflow.outbound_handoff = {
    handoff_path: handoffRel,
    prompt_path: promptRel,
    at: new Date().toISOString(),
    prompt_sha256_prefix: Buffer.from(prompt).toString("hex").slice(0, 16),
  };
  writeWorkflow(cwd, workflow);
  appendSkillTrace(cwd, runId, {
    phase: "handed_off",
    skill: "handoff",
    mode: "invoke",
    artifact_paths: [handoffRel, promptRel],
  });
  output({ ok: true, run_id: runId, phase: workflow.phase, handoff_path: handoffRel, prompt_path: promptRel });
}

function cmdStatus(cwd, options) {
  if (options["run-id"]) {
    output(loadWorkflow(cwd, String(options["run-id"])));
    return;
  }
  const active = findActiveWorkflow(cwd);
  output({ active, runs: listWorkflows(cwd).map((item) => ({ run_id: item.run_id, phase: item.phase })) });
}

function cmdAbort(cwd, options) {
  const runId = String(options["run-id"] ?? findActiveWorkflow(cwd)?.run_id ?? "").trim();
  if (!runId) throw new Error("--run-id or an active run is required");
  const workflow = loadWorkflow(cwd, runId);
  workflow.phase = "aborted";
  writeWorkflow(cwd, workflow);
  appendSkillTrace(cwd, runId, { phase: "aborted", skill: "research-evidence-workflow", mode: "invoke", notes: "run-abort" });
  output({ ok: true, run_id: runId, phase: "aborted" });
}

function cmdComplete(cwd, options) {
  const runId = String(options["run-id"] ?? findActiveWorkflow(cwd)?.run_id ?? "").trim();
  if (!runId) throw new Error("--run-id or an active run is required");
  const workflow = loadWorkflow(cwd, runId);
  if (!workflow.completeness?.sealed && workflow.phase !== "handed_off") {
    throw new Error("complete requires sealed (or handed_off) research");
  }
  workflow.phase = "complete";
  writeWorkflow(cwd, workflow);
  output({ ok: true, run_id: runId, phase: "complete" });
}

async function main() {
  const { options, positionals } = parseArgs(process.argv.slice(2));
  const command = positionals[0];
  const cwd = resolve(String(options.cwd ?? process.cwd()));
  if (!command) throw new Error("usage: research-workflow.mjs <command> [--cwd DIR]");
  if (command === "run-open") return cmdRunOpen(cwd, options);
  if (command === "brief-write") return cmdBriefWrite(cwd, options);
  if (command === "handoff-inbound") return cmdHandoffInbound(cwd, options);
  if (command === "handoff-result") return cmdHandoffResult(cwd, options);
  if (command === "claims-draft") return cmdClaimsDraft(cwd, options);
  if (command === "completeness-check") return cmdCompleteness(cwd, options);
  if (command === "handoff-outbound") return cmdHandoffOutbound(cwd, options);
  if (command === "run-status") return cmdStatus(cwd, options);
  if (command === "run-abort") return cmdAbort(cwd, options);
  if (command === "run-complete") return cmdComplete(cwd, options);
  throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[research-workflow] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
