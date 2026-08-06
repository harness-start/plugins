import { execFile } from "node:child_process";
import { access, appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HOUR = 60 * 60 * 1000;
const PROMPT_COOLDOWN = 20 * 60 * 1000;
const MAX_CONTEXT_BYTES = 32 * 1024;
const MAX_TELEMETRY_BYTES = 512 * 1024;

function cwdOf(event) { return resolve(event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd()); }
function promptOf(event) { return String(event?.prompt ?? event?.user_prompt ?? event?.userPrompt ?? "").trim(); }
function sessionIdOf(event) { return String(event?.session_id ?? event?.sessionId ?? event?.sessionID ?? "global"); }
function dataRoot() { const root = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA; return root ? join(root, "context-rules-inline") : null; }
function statePath() { const root = dataRoot(); return root ? join(root, "state.json") : null; }
function telemetryPath() { const root = dataRoot(); return root ? join(root, "telemetry.jsonl") : null; }
async function exists(path) { try { await access(path); return true; } catch { return false; } }

async function loadState() {
  const path = statePath();
  if (!path) return { cooldowns: {} };
  try { return { cooldowns: {}, ...JSON.parse(await readFile(path, "utf8")) }; } catch { return { cooldowns: {} }; }
}

async function saveState(state) {
  const path = statePath();
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state)}\n`, "utf8");
}

async function reserveCooldown(key, durationMs) {
  const state = await loadState();
  const now = Date.now();
  if (now - Number(state.cooldowns?.[key] ?? 0) < durationMs) return false;
  state.cooldowns = { ...state.cooldowns, [key]: now };
  await saveState(state);
  return true;
}

async function recordTelemetry(kind, details = {}) {
  const path = telemetryPath();
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify({ at: new Date().toISOString(), kind, ...details })}\n`, "utf8");
  const info = await stat(path).catch(() => null);
  if (!info || info.size <= MAX_TELEMETRY_BYTES) return;
  const text = await readFile(path, "utf8");
  const tail = text.slice(-Math.floor(MAX_TELEMETRY_BYTES / 2));
  await writeFile(path, tail.slice(tail.indexOf("\n") + 1), "utf8");
}

async function recentTelemetry() {
  const path = telemetryPath();
  if (!path) return [];
  try {
    const cutoff = Date.now() - 24 * HOUR;
    return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).flatMap((line) => {
      try { const item = JSON.parse(line); return Date.parse(item.at) >= cutoff ? [item] : []; } catch { return []; }
    });
  } catch { return []; }
}

async function flushTelemetry() {
  const endpoint = process.env.AI_EXPERTS_TELEMETRY_ENDPOINT;
  if (!endpoint || !telemetryPath()) return;
  const state = await loadState();
  if (Date.now() - Number(state.lastUpload ?? 0) < 6 * HOUR) return;
  const records = (await recentTelemetry()).slice(-100);
  if (!records.length) return;
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ records }), signal: AbortSignal.timeout(1500) });
    if (response.ok) { state.lastUpload = Date.now(); await saveState(state); }
  } catch { /* Optional telemetry is fail-open. */ }
}

async function git(cwd, args) {
  try { return (await execFileAsync("git", args, { cwd, timeout: 2000, maxBuffer: 128 * 1024 })).stdout.trim(); } catch { return ""; }
}

async function designDoc(root, cwd) {
  for (const candidate of [...new Set([join(cwd, "DESIGN.md"), join(root, "DESIGN.md")])]) {
    if (!(await exists(candidate))) continue;
    const text = (await readFile(candidate, "utf8")).slice(0, 8192);
    const frontmatter = text.startsWith("---") ? text.split("---", 3)[1] ?? "" : "";
    const groups = [...frontmatter.matchAll(/^([A-Za-z][\w-]*):/gmu)].map((match) => match[1]).slice(0, 12);
    return `Design contract: ${relative(root, candidate) || "DESIGN.md"}${groups.length ? `; token groups: ${groups.join(", ")}` : ""}. Read it before visual implementation.`;
  }
  return "";
}

export async function sessionContext(event) {
  const cwd = cwdOf(event);
  const root = await git(cwd, ["rev-parse", "--show-toplevel"]);
  await flushTelemetry();
  if (!root || !(await reserveCooldown(`session:${root}`, 10 * 60 * 1000))) return null;
  const [branch, status, lastCommit] = await Promise.all([
    git(root, ["branch", "--show-current"]),
    git(root, ["status", "--short"]),
    git(root, ["log", "-1", "--pretty=%h %s"]),
  ]);
  const surfaces = [];
  const oversized = [];
  for (const name of ["AGENTS.md", "CLAUDE.md", "MEMORY.md", ".cursorrules"]) {
    const path = join(root, name);
    if (!(await exists(path))) continue;
    surfaces.push(name);
    const info = await stat(path).catch(() => null);
    if (info?.size > 128 * 1024) oversized.push(`${name} (${Math.ceil(info.size / 1024)} KiB)`);
  }
  const lines = [
    "[Session Context]",
    `Repository: ${root}`,
    `Branch: ${branch || "detached/unknown"}`,
    `Last commit: ${lastCommit || "unavailable"}`,
    `Working tree: ${status ? `${status.split("\n").length} changed path(s); ${status.split("\n").slice(0, 10).join(" | ")}` : "clean"}`,
    surfaces.length ? `Instruction surfaces present: ${surfaces.join(", ")} (presence only; read matching instructions before edits).` : "Instruction surfaces: none detected at repository root.",
  ];
  const design = await designDoc(root, cwd);
  if (design) lines.push(design);
  if (oversized.length) lines.push(`[Memory Audit] Large instruction surface(s): ${oversized.join(", ")}; review for stale or duplicated guidance.`);
  if (await exists(join(root, ".agents", "plugins", "marketplace.json")) && await exists(join(root, "plugins"))) {
    lines.push("[Harness Overview] Plugins run checked-in Node.js .mjs files directly; keep manifests, hooks, runtime checks, tests, and acceptance cases platform-scoped. There is no install, compile, bundle, or vendored-source stage.");
  }
  lines.push("[Subagent Contract] When delegation is explicitly requested: dispatch only bounded scope; preserve constraints; return changes, evidence, verification, gaps, and file:line conclusions; do not recursively delegate.");
  await recordTelemetry("context_injection", { hook: "session", sessionId: sessionIdOf(event) });
  return lines.join("\n").slice(0, MAX_CONTEXT_BYTES);
}

function toolInput(event) { return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {}; }
function writeTargets(event) {
  const input = toolInput(event);
  const targets = [input.file_path, input.filePath, input.path, input.target_file].filter((value) => typeof value === "string");
  const patch = [input.patch, input.input, input.command].filter((value) => typeof value === "string").join("\n");
  for (const match of patch.matchAll(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/gmu)) targets.push(match[1].trim());
  return [...new Set(targets)];
}

function globRegex(glob) {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") { source += glob[index + 2] === "/" ? "(?:.*/)?" : ".*"; index += glob[index + 2] === "/" ? 2 : 1; continue; }
    if (char === "*") { source += "[^/]*"; continue; }
    if (char === "?") { source += "[^/]"; continue; }
    if (char === "{") {
      const end = glob.indexOf("}", index + 1);
      if (end !== -1) { source += `(?:${glob.slice(index + 1, end).split(",").map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|")})`; index = end; continue; }
    }
    source += char.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  }
  return new RegExp(`^${source}$`, "u");
}

function parseIndex(text) {
  return text.split("\n").flatMap((line) => {
    const match = line.match(/^- \[([^\]]+)\]\(([^)]+)\):\s*(.+)$/u);
    if (!match) return [];
    return [{ id: match[1], file: match[2], globs: [...match[3].matchAll(/`([^`]+)`/gu)].map((item) => item[1]) }];
  });
}

function ruleMetadata(text) {
  const title = text.match(/^#\s+(.+)$/mu)?.[1] ?? "Context rule";
  const description = text.match(/^description:\s*["']?([^"'\n]+)["']?$/mu)?.[1] ?? "Read before editing matched files.";
  const extendsIds = text.match(/^extends:\s*\n((?:\s+-\s+[^\n]+\n?)*)/mu)?.[1]?.match(/-\s+["']?([^"'\n]+)["']?/gu)?.map((line) => line.replace(/^-\s+["']?|["']?$/gu, "")) ?? [];
  return { title, description, extendsIds };
}

export async function contextRuleContext(event) {
  const targets = writeTargets(event);
  if (!targets.length) return null;
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  const rulesRoot = join(codexHome, "context-rules");
  let entries;
  try { entries = parseIndex(await readFile(join(rulesRoot, "index.md"), "utf8")); } catch { return null; }
  const cwd = cwdOf(event);
  const normalized = targets.map((target) => (isAbsolute(target) ? relative(cwd, target) : target).replaceAll("\\", "/").replace(/^\.\//u, ""));
  const matched = [];
  for (const entry of entries) {
    if (!entry.globs.some((glob) => normalized.some((target) => globRegex(glob).test(target) || (!glob.includes("/") && basename(target) === glob)))) continue;
    try { matched.push({ ...entry, ...ruleMetadata(await readFile(join(rulesRoot, entry.file), "utf8")) }); } catch { /* Ignore stale index entries. */ }
  }
  const selected = matched.filter((candidate) => !matched.some((other) => other.id !== candidate.id && other.extendsIds.includes(candidate.id)));
  if (!selected.length) return null;
  const key = `rules:${selected.map((item) => item.id).sort().join(",")}`;
  if (!(await reserveCooldown(key, 8 * HOUR))) return null;
  const lines = ["[Matched Context Rules]", ...selected.map((item) => `- ${item.id}: ${item.title} — ${item.description} (${join(rulesRoot, item.file)})`)];
  await recordTelemetry("context_injection", { hook: "context-rule", rules: selected.map((item) => item.id), sessionId: sessionIdOf(event) });
  return lines.join("\n").slice(0, MAX_CONTEXT_BYTES);
}

function stripQuotes(prompt) { return prompt.replace(/```[\s\S]*?```|`[^`]*`|“[^”]*”|"[^"]*"|'[^']*'/gu, " "); }
function technicalAction(prompt) { return /修复|实现|迁移|重构|修改|新增|删除|排查|优化|部署|测试|审查|代码|脚本|配置|接口|数据库|build|fix|implement|migrat|refactor|debug|deploy|test|review|code|script|config|API/iu.test(prompt); }
function nonEngineering(prompt) { return /营销文案|广告文案|诗歌|小说|朋友圈|小红书文案|translate this|翻译这段/iu.test(prompt); }
function hasDesignDoc(cwd) { return Promise.any([access(join(cwd, "DESIGN.md")), access(join(dirname(cwd), "DESIGN.md"))]).then(() => true, () => false); }

async function guidanceItems(event, prompt) {
  const clean = stripQuotes(prompt);
  const items = [];
  const add = async (id, condition, message, cooldown = PROMPT_COOLDOWN) => {
    if (condition && await reserveCooldown(`primer:${id}`, cooldown)) items.push({ id, message });
  };
  await add("distributed-design-primer", /分布式|跨服务|消息队列|事件驱动|outbox|saga|幂等|distributed|cross-service|event-driven/iu.test(clean), "Use `distributed-event-driven-design`; define ownership, delivery semantics, idempotency, ordering, retries, and failure recovery before implementation.");
  await add("comment-discipline-primer", /注释|workaround|兼容说明|并发契约|comment|document the workaround/iu.test(clean), "Use `code-comment-discipline`; comments should preserve contracts, invariants, rationale, and removal conditions instead of restating code.");
  await add("debug-methodology-primer", /bug|报错|故障|回归|间歇|偶现|flaky|stale runtime|排查|debug|investigat/iu.test(clean), "Use `debug-methodology`; reproduce, localize the failing layer, test one hypothesis at a time, then verify recurrence and runtime/deployment state.");
  await add("docs-visual-structure-primer", /架构|链路|流程|迁移方案|方案对比|风险矩阵|architecture|flow|migration|comparison|risk matrix/iu.test(clean), "Use `structured-technical-writing`; choose the smallest useful table, flow, timeline, or tree when relationships are otherwise hard to scan.");
  await add("over-engineering-primer", !/必须兼容|保留兼容|backward compatibility required/iu.test(clean) && /兼容层|fallback|双轨|抽象层|防御性|feature flag|compatibility layer|dual[- ]track/iu.test(clean), "Use `engineering-simplicity-discipline`; justify every compatibility path, fallback, abstraction, and feature flag with a live requirement and deletion condition.");
  await add("completion-status-protocol", technicalAction(clean) && !nonEngineering(clean), "For technical delivery, end with exactly one truthful status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT; tie it to verification evidence.");
  await add("confusion-protocol", /哪个方案|怎么选|随便|都行|范围不明|不确定目标|批量删除|清空|覆盖全部|choose which|ambiguous|delete all|overwrite all/iu.test(clean), "Use `ambiguity-resolution-protocol` only if the unresolved choice changes implementation or destructive scope; otherwise record an assumption and continue.");
  await add("feedback-detector", /不要这样|不是这个意思|你又犯了|又犯同样|以后记住|我刚才纠正|我已经纠正|别再这样|下次都要/iu.test(clean), "Use `feedback-reflection-workflow`: state the corrected rule, repair current artifacts, and prevent recurrence without defending the previous approach.");
  await add("investigation-primer", technicalAction(clean), "Before editing, inspect the exact scope, matching project instructions, dependencies, tests, and nearby implementation pattern.");
  await add("reasoning-discipline-primer", /证明|保证|必然|最坏情况|复杂度|精确|逻辑|数学|proof|guarantee|worst[- ]case|complexity|exact/iu.test(clean), "Use `reasoning-discipline`: separate facts, inferences, and falsifiable assumptions; seek an independent check and an adversarial counterexample.");
  await add("long-task-context-primer", /批量|逐个|挨个|\d{2,}\s*(?:个|条|项|份|篇)|继续上次|接着做|恢复之前|多阶段|分阶段|分批|resume|one by one|phased/iu.test(clean), "Use `long-task-context-governance`; shard the work, persist a task ledger, and make resume points explicit.");
  await add("frontend-visual-brief-concretizer-primer", /设计|视觉|界面|页面|海报|品牌|layout|visual|website/iu.test(clean) && /大气|高级|专业|科技感|未来感|品牌感|质感|premium|polished|futuristic|wow factor/iu.test(clean), "Use `visual-brief-concretizer`; translate abstract aesthetic words into audience, brand intent, observable visual signals, and anti-patterns.");
  await add("subagent-spawn-budget-primer", /多.?agent|多智能体|并行代理|subagents?|delegate in parallel|parallel agents?/iu.test(clean), "For explicit multi-agent work, assign bounded independent artifacts, cap active companions, wait for evidence, and avoid recursive/no-op delegation.");
  const visualImplementation = /重新设计|设计并实现|实现.{0,12}(?:页面|界面|组件|样式)|redesign|implement.{0,16}(?:page|screen|interface|component|styles?)/iu.test(clean);
  if (visualImplementation && !(await hasDesignDoc(cwdOf(event)))) await add("design-doc-primer", true, "Project has no DESIGN.md; use `design-doc-protocol` to reconstruct and validate the visual contract before implementation.");
  if (/eslint|linting|static analysis|security audit|安全审查|静态分析|代码审计/iu.test(clean)) {
    const cwd = cwdOf(event);
    const configNames = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", ".eslintrc", ".eslintrc.json"];
    const config = (await Promise.all(configNames.map(async (name) => await exists(join(cwd, name)) ? join(cwd, name) : null))).find(Boolean);
    if (config) {
      const combined = `${await readFile(config, "utf8").catch(() => "")} ${await readFile(join(cwd, "package.json"), "utf8").catch(() => "")}`;
      const missing = ["eslint-plugin-security", "eslint-plugin-promise", "eslint-plugin-no-unsanitized"].filter((name) => !combined.includes(name));
      await add("eslint-security-coverage-primer", missing.length > 0, `ESLint static-rule coverage is missing: ${missing.join(", ")}. Review the JavaScript, Node.js, frontend, and security rule gaps.`, 24 * HOUR);
    }
  }
  return items;
}

async function telemetryAdvice() {
  const records = await recentTelemetry();
  const counts = records.reduce((result, item) => ({ ...result, [item.kind]: (result[item.kind] ?? 0) + 1 }), {});
  if ((counts.error ?? 0) || (counts.block ?? 0) >= 3 || (counts.missing_route ?? 0) >= 2 || (counts.routed_not_used ?? 0) >= 2 || (counts.skill_audit ?? 0) >= 8) {
    if (await reserveCooldown("telemetry-advisor", 6 * HOUR)) return "[Skill Telemetry Advisor] Recent local telemetry shows routing or execution friction; inspect the bounded JSONL record and adjust routing metadata or reminders from evidence.";
  }
  return "";
}

export async function promptContext(event) {
  const prompt = promptOf(event);
  if (prompt.length < 10 || prompt.startsWith("/")) return null;
  const messages = [];
  const feedback = /不要这样|不是这个意思|你又犯了|又犯同样|以后记住|我刚才纠正|我已经纠正|别再这样|下次都要/u.test(stripQuotes(prompt));
  if (feedback && await reserveCooldown("feedback-reminder", PROMPT_COOLDOWN)) messages.push("[Feedback Reflection] Capture the correction as a concrete rule, repair current work, and verify the confusing artifact is gone.");
  const primers = await guidanceItems(event, prompt);
  messages.push(...primers.map((item) => `[${item.id}] ${item.message}`));
  const explicitRoute = /\$[a-z][\w-]+|skill-route-lookup|using (?:the )?[\w-]+ skill|使用[“`]?[^”`\s]+[”`]?\s*skill/iu.test(prompt);
  const questionOnly = /[?？]$/u.test(prompt) && !/修复|实现|修改|迁移|删除|执行|fix|implement|change|migrate|delete|run/iu.test(prompt);
  if (prompt.length >= 12 && technicalAction(prompt) && !questionOnly && !explicitRoute && await reserveCooldown("skill-routing-reminder", PROMPT_COOLDOWN)) {
    messages.push("[Skill Routing] Run the platform route lookup first; honor `noMatch`, and activate only the highest-relevance skill(s) needed for the next action.");
  }
  const advice = await telemetryAdvice();
  if (advice) messages.push(advice);
  if (!messages.length) return null;
  const selected = messages.slice(0, 6);
  await recordTelemetry("context_injection", { hook: "prompt", primers: primers.map((item) => item.id), sessionId: sessionIdOf(event) });
  return ["[Prompt Guidance]", ...selected].join("\n").slice(0, MAX_CONTEXT_BYTES);
}

function activeSkills(event) {
  const raw = event?.active_skill_ids ?? event?.activeSkillIds ?? event?.skills ?? [];
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
}

export async function stopContext(event) {
  const prompt = promptOf(event);
  const active = activeSkills(event);
  const routed = Array.isArray(event?.routed_skill_ids) ? event.routed_skill_ids.map(String) : [];
  const roles = event?.skill_roles && typeof event.skill_roles === "object" ? Object.values(event.skill_roles).map(String) : [];
  const missingRoute = technicalAction(prompt) && !active.length && !routed.length;
  const routedNotUsed = routed.some((id) => !active.includes(id));
  const roleViolation = roles.length > 0 && (roles.filter((role) => role === "primary").length !== 1 || roles.filter((role) => role === "companion").length > 3 || roles.some((role) => !["primary", "companion"].includes(role)));
  await recordTelemetry("skill_audit", { sessionId: sessionIdOf(event), active, routed, missingRoute, routedNotUsed, roleViolation });
  if (missingRoute) await recordTelemetry("missing_route", { sessionId: sessionIdOf(event) });
  if (routedNotUsed) await recordTelemetry("routed_not_used", { sessionId: sessionIdOf(event), routed, active });
  if (roleViolation) await recordTelemetry("error", { sessionId: sessionIdOf(event), reason: "skill-role-constraint" });
  await flushTelemetry();
  if (process.env.AI_EXPERTS_TELEMETRY_ENDPOINT) return null;
  const records = await recentTelemetry();
  const actionable = records.filter((item) => ["error", "block", "missing_route", "routed_not_used"].includes(item.kind));
  if (!actionable.length || !(await reserveCooldown("runtime-feedback", 6 * HOUR))) return null;
  return "[Session Runtime Feedback] Local telemetry found routing or execution friction. Use `session-runtime-feedback` for a read-only report of evidence, likely cause, and the smallest harness improvement.";
}
