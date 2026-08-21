// harness-source-hash: sha256:34e5dc850a6f350d58162220ca73769b7f74dd5e7dd94cf9712f747b0f94a0f1

// core/src/hook-event.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}
function nestedRecord(event, key) {
  const value = event[key];
  return isRecord(value) ? value : null;
}
async function readStdinJson(input = process.stdin) {
  let raw = "";
  for await (const chunk of input) raw += chunk.toString();
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : { __parseError: true };
  } catch {
    return { __parseError: true };
  }
}
function eventSessionId(event) {
  const context = nestedRecord(event, "context");
  return firstString(
    event.session_id,
    event.sessionId,
    event.sessionID,
    event.conversation_id,
    event.conversationId,
    context?.session_id
  );
}
function eventCwd(event) {
  return firstString(event.cwd, event.working_directory, event.workingDirectory) || process.cwd();
}
function eventToolName(event) {
  const tool = nestedRecord(event, "tool");
  return firstString(event.tool_name, event.toolName, tool?.name);
}
function eventToolInput(event) {
  const tool = nestedRecord(event, "tool");
  const value = event.tool_input ?? event.toolInput ?? tool?.input ?? event.input;
  return isRecord(value) ? value : {};
}
function eventToolResponse(event) {
  const tool = nestedRecord(event, "tool");
  return event.tool_response ?? event.toolResponse ?? event.tool_result ?? event.toolResult ?? event.response ?? tool?.response ?? null;
}
function eventPrompt(event) {
  return firstString(event.prompt, event.user_prompt, event.userPrompt, event.message);
}
function eventAssistantMessage(event) {
  return firstString(
    event.last_assistant_message,
    event.lastAssistantMessage,
    event.assistant_message,
    event.assistant_text,
    event.assistantText
  );
}

// plugins/evidence-based-research/src/lib/workflow-fs.ts
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
    if (!isRecord(raw) || raw.schema !== WORKFLOW_SCHEMA || !RUN_ID.test(String(raw.run_id ?? ""))) return null;
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
  return open[0] ?? null;
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
    const notes = phase === "aborted" ? "exact user abort" : "validated Stop";
    appendSkillTrace(workspaceRoot, runId, {
      phase,
      skill: "research-evidence-workflow",
      mode: "hook",
      notes
    });
  } catch {
  }
  return true;
}

export {
  isRecord,
  readStdinJson,
  eventSessionId,
  eventCwd,
  eventToolName,
  eventToolInput,
  eventToolResponse,
  eventPrompt,
  eventAssistantMessage,
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
