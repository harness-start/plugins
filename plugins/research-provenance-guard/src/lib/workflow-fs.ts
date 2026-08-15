import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";

import { isRecord } from "@harness/core/hook-event";

export const WORKFLOW_SCHEMA = "research-workflow/v1";
export const OPEN_PHASES: ReadonlySet<string> = new Set(["open", "briefed", "discovering", "capturing", "claims_drafted", "sealed", "handed_off"]);
export const TERMINAL_PHASES: ReadonlySet<string> = new Set(["aborted", "complete"]);
export const SEALED_OR_LATER: ReadonlySet<string> = new Set(["sealed", "handed_off", "complete"]);

const RUN_ID = /^r-[a-z0-9-]+$/u;

export type WorkflowMcpState = {
  begun: boolean;
  source_count: number;
  anchor_count: number;
};

export type WorkflowCompleteness = {
  brief: boolean;
  all_claims_classified: boolean;
  sealed: boolean;
  outbound_handoff: boolean;
};

export type WorkflowSeal = {
  seal: string;
  mutation_revision: number;
  at: string;
};

export type WorkflowOutboundHandoff = {
  handoff_path: string;
  prompt_path: string;
  at: string;
  prompt_sha256_prefix: string;
};

export type ResearchWorkflow = {
  schema: string;
  run_id: string;
  phase: string;
  question: string;
  scope: string;
  as_of: string;
  prompt_epoch: number;
  opened_at: string;
  source_plan_path: string;
  mcp: WorkflowMcpState;
  completeness: WorkflowCompleteness;
  seal: WorkflowSeal | null;
  outbound_handoff: WorkflowOutboundHandoff | null;
  non_goals?: string;
  decision?: string;
};

export type DefaultWorkflowInput = {
  runId: string;
  question?: string;
  scope?: string;
  asOf?: string;
  promptEpoch?: number;
};

export type SkillTraceEntry = {
  phase: string;
  skill: string;
  mode: string;
  notes?: string;
  artifact_paths?: string[];
};

export type ResearchPathClass = "seal" | "workflow" | "outbound" | "orchestration" | "other";

export function runsRoot(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), ".research", "runs");
}

export function runDir(workspaceRoot: string, runId: string): string {
  if (!RUN_ID.test(runId)) throw new Error(`invalid run id: ${runId}`);
  return join(runsRoot(workspaceRoot), runId);
}

export function workflowPath(workspaceRoot: string, runId: string): string {
  return join(runDir(workspaceRoot, runId), "workflow.json");
}

function atomicWriteSync(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(temporary, content, { encoding: "utf8", mode: 0o644, flag: "wx" });
  renameSync(temporary, path);
}

export function defaultWorkflow({ runId, question = "", scope = "", asOf = "", promptEpoch = 0 }: DefaultWorkflowInput): ResearchWorkflow {
  return {
    schema: WORKFLOW_SCHEMA,
    run_id: runId,
    phase: "open",
    question,
    scope,
    as_of: asOf,
    prompt_epoch: promptEpoch,
    opened_at: new Date().toISOString(),
    source_plan_path: "source-plan.md",
    mcp: { begun: false, source_count: 0, anchor_count: 0 },
    completeness: {
      brief: false,
      all_claims_classified: false,
      sealed: false,
      outbound_handoff: false,
    },
    seal: null,
    outbound_handoff: null,
  };
}

export function readWorkflowFile(path: string): ResearchWorkflow | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(raw) || raw.schema !== WORKFLOW_SCHEMA || !RUN_ID.test(String(raw.run_id ?? ""))) return null;
    return raw as ResearchWorkflow;
  } catch {
    return null;
  }
}

export function writeWorkflow(workspaceRoot: string, workflow: ResearchWorkflow): string {
  const path = workflowPath(workspaceRoot, workflow.run_id);
  atomicWriteSync(path, `${JSON.stringify(workflow, null, 2)}\n`);
  return path;
}

export function ensureRunSkeleton(workspaceRoot: string, runId: string): string {
  const root = runDir(workspaceRoot, runId);
  for (const part of ["", "handoffs/outbound"]) {
    mkdirSync(part ? join(root, part) : root, { recursive: true, mode: 0o755 });
  }
  return root;
}

export function listWorkflows(workspaceRoot: string): ResearchWorkflow[] {
  const root = runsRoot(workspaceRoot);
  if (!existsSync(root)) return [];
  const out: ResearchWorkflow[] = [];
  for (const name of readdirSync(root)) {
    if (!RUN_ID.test(name)) continue;
    const path = join(root, name, "workflow.json");
    const workflow = readWorkflowFile(path);
    if (workflow) out.push(workflow);
  }
  return out;
}

export function findActiveWorkflow(workspaceRoot: string): ResearchWorkflow | null {
  const open = listWorkflows(workspaceRoot).filter((item) => OPEN_PHASES.has(item.phase) && !TERMINAL_PHASES.has(item.phase));
  if (open.length === 0) return null;
  open.sort((a, b) => String(b.opened_at).localeCompare(String(a.opened_at)));
  return open[0] ?? null;
}

export function isActivePhase(phase: string): boolean {
  return OPEN_PHASES.has(phase) && !TERMINAL_PHASES.has(phase);
}

export function appendSkillTrace(workspaceRoot: string, runId: string, entry: SkillTraceEntry): void {
  const path = join(runDir(workspaceRoot, runId), "skill-trace.jsonl");
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
  writeFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, { encoding: "utf8", flag: "a" });
}

/** Relative path from workspace root using forward slashes, or null if outside. */
export function workspaceRelative(workspaceRoot: string, candidate: string): string | null {
  const root = resolve(workspaceRoot);
  const target = resolve(candidate);
  const rel = relative(root, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.replaceAll("\\", "/");
}

/**
 * Classify a path relative to workspace for write policy.
 * @returns {"seal"|"workflow"|"outbound"|"orchestration"|"other"}
 */
export function classifyResearchPath(relPath: string): ResearchPathClass {
  const path = String(relPath ?? "").replaceAll("\\", "/");
  if (!path.startsWith(".research/runs/")) return "other";
  const parts = path.split("/");
  // .research/runs/<id>/...
  if (parts.length < 4) return "orchestration";
  const rest = parts.slice(3).join("/");
  if (rest === "research.json" || rest === "report.md") return "seal";
  if (rest === "workflow.json") return "workflow";
  if (rest.startsWith("handoffs/outbound/") || rest === "handoffs/outbound") return "outbound";
  return "orchestration";
}

export function pathLooksLikeResearchWrite(serialized: string): boolean {
  return /(?:^|[\s'"=:\\/])\.research(?:[\\/]|$)/u.test(String(serialized ?? ""));
}

export function extractResearchRelativePaths(serialized: string): string[] {
  const text = String(serialized ?? "");
  const found = new Set<string>();
  const re = /\.research\/runs\/(r-[a-z0-9-]+)\/([^\s'"\\]+)/giu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const runId = match[1];
    const rest = match[2];
    if (!runId || !rest) continue;
    found.add(`.research/runs/${runId}/${rest.replace(/[),.;]+$/u, "")}`);
  }
  if (/\.research(?:\/|\\|$)/u.test(text) && found.size === 0) {
    found.add(".research/");
  }
  return [...found];
}

export function generateRunId(now: () => Date = () => new Date()): string {
  return `r-${now().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-${randomBytes(5).toString("hex")}`;
}

export function terminalizeWorkflow(workspaceRoot: string, runId: string, phase: string): boolean {
  if (!TERMINAL_PHASES.has(phase)) throw new Error(`invalid terminal workflow phase: ${phase}`);
  const workflow = readWorkflowFile(workflowPath(workspaceRoot, runId));
  if (!workflow) return false;
  if (workflow.phase === phase) return true;
  if (TERMINAL_PHASES.has(workflow.phase)) return false;
  if (phase === "complete" && workflow.completeness?.sealed !== true) return false;
  workflow.phase = phase;
  writeWorkflow(workspaceRoot, workflow);
  try {
    const notes = phase === "aborted" ? "exact user abort" : "validated Stop";
    appendSkillTrace(workspaceRoot, runId, {
      phase,
      skill: "research-evidence-workflow",
      mode: "hook",
      notes,
    });
  } catch {}
  return true;
}

export function assertDirWritable(path: string): void {
  const info = statSync(path, { throwIfNoEntry: false });
  if (info && !info.isDirectory()) throw new Error(`${path} is not a directory`);
}
