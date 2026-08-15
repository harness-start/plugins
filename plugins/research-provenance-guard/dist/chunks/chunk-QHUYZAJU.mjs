// harness-source-hash: sha256:e135a9d3aa608f5f15f040e311aab5ea1eb67716b0d39bac38b0c614bfe29ffa

// plugins/research-provenance-guard/src/lib/workflow-fs.ts
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";
var WORKFLOW_SCHEMA = "research-workflow/v1";
var OPEN_PHASES = /* @__PURE__ */ new Set(["open", "briefed", "discovering", "capturing", "claims_drafted", "sealed", "handed_off"]);
var TERMINAL_PHASES = /* @__PURE__ */ new Set(["aborted", "complete"]);
var SEALED_OR_LATER = /* @__PURE__ */ new Set(["sealed", "handed_off", "complete"]);
var RUN_ID = /^r-[a-z0-9-]+$/u;
function runsRoot(workspaceRoot) {
  return join(resolve(workspaceRoot), ".research", "runs");
}
function runDir(workspaceRoot, runId) {
  if (!RUN_ID.test(runId)) throw new Error(`invalid run id: ${runId}`);
  return join(runsRoot(workspaceRoot), runId);
}
function workflowPath(workspaceRoot, runId) {
  return join(runDir(workspaceRoot, runId), "workflow.json");
}
function atomicWriteSync(path, content) {
  mkdirSync(dirname(path), { recursive: true, mode: 493 });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(temporary, content, { encoding: "utf8", mode: 420, flag: "wx" });
  renameSync(temporary, path);
}
function defaultWorkflow({ runId, question = "", scope = "", asOf = "", promptEpoch = 0 }) {
  return {
    schema: WORKFLOW_SCHEMA,
    run_id: runId,
    phase: "open",
    question,
    scope,
    as_of: asOf,
    prompt_epoch: promptEpoch,
    opened_at: (/* @__PURE__ */ new Date()).toISOString(),
    source_plan_path: "source-plan.md",
    mcp: { begun: false, source_count: 0, anchor_count: 0 },
    completeness: {
      brief: false,
      all_claims_classified: false,
      sealed: false,
      outbound_handoff: false
    },
    seal: null,
    outbound_handoff: null
  };
}
function readWorkflowFile(path) {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || raw.schema !== WORKFLOW_SCHEMA || !RUN_ID.test(raw.run_id ?? "")) return null;
    return raw;
  } catch {
    return null;
  }
}
function writeWorkflow(workspaceRoot, workflow) {
  const path = workflowPath(workspaceRoot, workflow.run_id);
  atomicWriteSync(path, `${JSON.stringify(workflow, null, 2)}
`);
  return path;
}
function ensureRunSkeleton(workspaceRoot, runId) {
  const root = runDir(workspaceRoot, runId);
  for (const part of ["", "handoffs/outbound"]) {
    mkdirSync(part ? join(root, part) : root, { recursive: true, mode: 493 });
  }
  return root;
}
function listWorkflows(workspaceRoot) {
  const root = runsRoot(workspaceRoot);
  if (!existsSync(root)) return [];
  const out = [];
  for (const name of readdirSync(root)) {
    if (!RUN_ID.test(name)) continue;
    const path = join(root, name, "workflow.json");
    const workflow = readWorkflowFile(path);
    if (workflow) out.push(workflow);
  }
  return out;
}
function findActiveWorkflow(workspaceRoot) {
  const open = listWorkflows(workspaceRoot).filter((item) => OPEN_PHASES.has(item.phase) && !TERMINAL_PHASES.has(item.phase));
  if (open.length === 0) return null;
  open.sort((a, b) => String(b.opened_at).localeCompare(String(a.opened_at)));
  return open[0];
}
function isActivePhase(phase) {
  return OPEN_PHASES.has(phase) && !TERMINAL_PHASES.has(phase);
}
function appendSkillTrace(workspaceRoot, runId, entry) {
  const path = join(runDir(workspaceRoot, runId), "skill-trace.jsonl");
  mkdirSync(dirname(path), { recursive: true, mode: 493 });
  writeFileSync(path, `${JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), ...entry })}
`, { encoding: "utf8", flag: "a" });
}
function classifyResearchPath(relPath) {
  const path = String(relPath ?? "").replaceAll("\\", "/");
  if (!path.startsWith(".research/runs/")) return "other";
  const parts = path.split("/");
  if (parts.length < 4) return "orchestration";
  const rest = parts.slice(3).join("/");
  if (rest === "research.json" || rest === "report.md") return "seal";
  if (rest === "workflow.json") return "workflow";
  if (rest.startsWith("handoffs/outbound/") || rest === "handoffs/outbound") return "outbound";
  return "orchestration";
}
function pathLooksLikeResearchWrite(serialized) {
  return /(?:^|[\s'"=:\\/])\.research(?:[\\/]|$)/u.test(String(serialized ?? ""));
}
function extractResearchRelativePaths(serialized) {
  const text = String(serialized ?? "");
  const found = /* @__PURE__ */ new Set();
  const re = /\.research\/runs\/(r-[a-z0-9-]+)\/([^\s'"\\]+)/giu;
  let match;
  while (match = re.exec(text)) {
    found.add(`.research/runs/${match[1]}/${match[2].replace(/[),.;]+$/u, "")}`);
  }
  if (/\.research(?:\/|\\|$)/u.test(text) && found.size === 0) {
    found.add(".research/");
  }
  return [...found];
}
function generateRunId(now = () => /* @__PURE__ */ new Date()) {
  return `r-${now().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-${randomBytes(5).toString("hex")}`;
}
function terminalizeWorkflow(workspaceRoot, runId, phase) {
  if (!TERMINAL_PHASES.has(phase)) throw new Error(`invalid terminal workflow phase: ${phase}`);
  const workflow = readWorkflowFile(workflowPath(workspaceRoot, runId));
  if (!workflow) return false;
  if (workflow.phase === phase) return true;
  if (TERMINAL_PHASES.has(workflow.phase)) return false;
  if (phase === "complete" && workflow.completeness?.sealed !== true) return false;
  workflow.phase = phase;
  writeWorkflow(workspaceRoot, workflow);
  try {
    appendSkillTrace(workspaceRoot, runId, {
      phase,
      skill: "research-evidence-workflow",
      mode: "hook",
      notes: phase === "aborted" ? "exact user abort" : "validated Stop"
    });
  } catch {
  }
  return true;
}

export {
  SEALED_OR_LATER,
  workflowPath,
  defaultWorkflow,
  readWorkflowFile,
  writeWorkflow,
  ensureRunSkeleton,
  listWorkflows,
  findActiveWorkflow,
  isActivePhase,
  appendSkillTrace,
  classifyResearchPath,
  pathLooksLikeResearchWrite,
  extractResearchRelativePaths,
  generateRunId,
  terminalizeWorkflow
};
