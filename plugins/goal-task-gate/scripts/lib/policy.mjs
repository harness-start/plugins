/**
 * Pure policy for goal-task-gate entry classification and protocol text.
 */

export const CLEAR_ALIASES = Object.freeze([
  "clear",
  "stop",
  "off",
  "reset",
  "none",
  "cancel",
]);

export const IGNORE_SUBCOMMANDS = Object.freeze([
  "status",
  "pause",
  "resume",
  "unpause",
]);

export const DECISION_KINDS = Object.freeze([
  "open",
  "plan",
  "explore",
  "implement",
  "verify",
  "pivot",
  "revert",
  "blocker",
  "checkpoint",
  "close",
]);

/**
 * Strip skill blocks and fenced code for entry matching.
 */
export function actionablePrompt(prompt) {
  let text = String(prompt ?? "");
  text = text.replace(/<skill\b[\s\S]*?<\/skill>/giu, "\n");
  text = text.replace(/(```|~~~)[\s\S]*?\1/gu, "\n");
  const lines = text.split(/\r?\n/u);
  const kept = [];
  let skippingHookBlock = false;
  for (const line of lines) {
    if (
      /^\s*(?:[•*-]\s*)?(?:SessionStart|UserPromptSubmit|PreToolUse|PostToolUse|Stop|SubagentStop|Notification)\s+hook\b/iu.test(
        line,
      )
    ) {
      skippingHookBlock = true;
      continue;
    }
    if (skippingHookBlock) {
      if (line.trim() === "") skippingHookBlock = false;
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/^\s+/u, "");
}

function firstLine(text) {
  return String(text ?? "")
    .split(/\r?\n/u)[0]
    .trim();
}

/**
 * Parse /goal … user input.
 * @returns {{ class: 'arm', objective: string } | { class: 'clear' } | { class: 'ignore' } | { class: 'abort' } | { class: 'other' }}
 */
export function classifyGoalPrompt(prompt, config = {}) {
  const head = actionablePrompt(prompt);
  if (!head) return { class: "other" };

  const abortToken = config.abortToken ?? "# goal-task-abort";
  if (
    new RegExp(
      `(?:^|\\s)${escapeRegExp(abortToken).replace(/\\ /gu, "\\s+")}\\b`,
      "iu",
    ).test(head) ||
    /^#\s*goal-task-abort\b/iu.test(firstLine(head))
  ) {
    return { class: "abort" };
  }

  const line = firstLine(head);
  const goalMatch = line.match(/^\/goal(?:\s+(.*))?$/iu);
  if (!goalMatch) return { class: "other" };

  const rest = (goalMatch[1] ?? "").trim();
  if (!rest) return { class: "ignore", reason: "bare" };

  const firstWord = rest.split(/\s+/u)[0].toLowerCase();
  if (CLEAR_ALIASES.includes(firstWord)) {
    return { class: "clear", alias: firstWord };
  }
  if (IGNORE_SUBCOMMANDS.includes(firstWord)) {
    return { class: "ignore", reason: firstWord };
  }

  // Control-only tokens without extra objective
  if (CLEAR_ALIASES.includes(rest.toLowerCase()) || IGNORE_SUBCOMMANDS.includes(rest.toLowerCase())) {
    return CLEAR_ALIASES.includes(rest.toLowerCase())
      ? { class: "clear", alias: rest.toLowerCase() }
      : { class: "ignore", reason: rest.toLowerCase() };
  }

  return { class: "arm", objective: rest };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function isExpired(state, ttlHours, now = Date.now()) {
  if (!state || state.phase !== "armed") return false;
  const hours = Number(ttlHours) || 48;
  const entered = Number(state.enteredAt) || 0;
  if (!entered) return false;
  return now - entered > hours * 3600 * 1000;
}

/**
 * Repo-relative path is under audit tree (decisions.tsv / work.jsonl / meta / CURRENT).
 */
export function isAuditRelativePath(relPath, auditRoot = ".goal-task") {
  const rel = String(relPath ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");
  const root = String(auditRoot ?? ".goal-task").replace(/\/+$/u, "");
  if (rel === root || rel === `${root}/CURRENT` || rel === `${root}/README.md`) {
    return true;
  }
  if (rel.startsWith(`${root}/`)) return true;
  // Nested monorepo workspace paths ending with the audit root
  if (rel.includes(`/${root}/`) || rel.endsWith(`/${root}`)) return true;
  return false;
}

export function stateDirRelative(auditRoot = ".goal-task") {
  return `${String(auditRoot ?? ".goal-task").replace(/\/+$/u, "")}/.state`;
}

export function isProtectedStatePath(relPath, auditRoot = ".goal-task") {
  const rel = String(relPath ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");
  const dir = stateDirRelative(auditRoot);
  if (rel === dir || rel.startsWith(`${dir}/`)) return true;
  return rel.includes(`/${dir}/`) || rel.endsWith(`/${dir}`);
}

export function isProtectedTrailFile(relPath, auditRoot = ".goal-task") {
  const rel = String(relPath ?? "").replaceAll("\\", "/");
  if (isProtectedStatePath(rel, auditRoot)) return true;
  if (!isAuditRelativePath(rel, auditRoot)) return false;
  return /(?:^|\/)(?:decisions\.tsv|work\.jsonl|CURRENT)$/u.test(rel);
}

export function looksLikeCompletionClaim(text) {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  if (/GOAL_TASK_DONE\b/u.test(t)) return true;
  return (
    /(?:任务|goal|目标).{0,12}(?:完成|已完成|达成)/iu.test(t) ||
    /(?:completed|done|finished).{0,20}(?:goal|objective|task)/iu.test(t) ||
    /(?:goal|objective|task).{0,20}(?:completed|achieved|done)/iu.test(t) ||
    /(?:全部完成|验收通过|可以收工)/u.test(t)
  );
}

export function protocolInjectText({
  runId,
  objective,
  auditRoot = ".goal-task",
  tipWindow = 3,
  pluginRootHint = "${PLUGIN_ROOT}",
  supersededFrom = null,
}) {
  const decisions = `${auditRoot}/runs/${runId}/decisions.tsv`;
  const work = `${auditRoot}/runs/${runId}/work.jsonl`;
  const trailer = `GOAL_TASK_DONE run_id=${runId} status=completed close_seq=<n> tip_hash=<hash>`;
  const lines = [
    `[goal-task-gate] armed run_id=${runId}`,
    `objective: ${truncate(objective, 400)}`,
    `audit: ${decisions}`,
    `work (optional): ${work}`,
    "",
    "Protocol:",
    `1. Log decisions via: node ${pluginRootHint}/scripts/log-decision.mjs --workspace <git-root> --phase <p> --kind <kind> --decision <d> --why <w> --evidence <e> --result <r> [--scope <paths>]`,
    `   kinds: open|plan|explore|implement|verify|pivot|revert|blocker|checkpoint|close`,
    `   Append-only; tip rewrite last ${tipWindow} rows only: --rewrite-tip <k>`,
    `   Optional work lines: node ${pluginRootHint}/scripts/log-work.mjs --workspace <git-root> --action <edit|write|shell|read|test|other> --targets a,b --summary <s> [--decision-seq N]`,
    "2. Do NOT Edit/Write decisions.tsv or work.jsonl directly.",
    "3. On true completion: append kind=close, then end the final reply with exactly one line:",
    `   ${trailer}`,
    "   close_seq and tip_hash must match the close row in decisions.tsv.",
    "4. Do not emit GOAL_TASK_DONE until trail close is written.",
  ];
  if (supersededFrom) {
    lines.push(
      `5. Previous run ${supersededFrom} is superseded; do not emit GOAL_TASK_DONE for that run_id.`,
    );
  }
  return lines.join("\n");
}

export function clearInjectText(runId) {
  return `[goal-task-gate] cleared run_id=${runId ?? "none"}. Audit trail kept on disk; plugin disarmed.`;
}

export function supersedeInjectText(oldRunId, newRunId) {
  return `[goal-task-gate] superseded run_id=${oldRunId} → ${newRunId}. Old trail retained under .goal-task/runs/${oldRunId}/.`;
}

function truncate(text, max) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function shellLooksMutating(command) {
  const cmd = String(command ?? "");
  if (!cmd.trim()) return false;
  if (/(?:^|[\s;|&])(?:cat|tee|printf|dd)\b/u.test(cmd) && /(?:^|[\s;|&])(?:\d*)>{1,2}|of=/u.test(cmd)) {
    return true;
  }
  if (/(?:^|[\s;|&])(?:cat|tee)\s+.*>/u.test(cmd)) return true;
  if (/(?:^|[\s;|&])dd\b[^\n]*\bof=/u.test(cmd)) return true;
  if (/(?:^|[\s;|&])(?:rm|mv|cp|chmod|chown|mkdir|touch|install|truncate)\b/u.test(cmd)) {
    return true;
  }
  // sed -i FILE and sed … -i … FILE
  if (/(?:^|[\s;|&])(?:sed|perl|ruby)\s+-i\b/u.test(cmd)) {
    return true;
  }
  if (/(?:^|[\s;|&])(?:sed|perl|ruby|python3?)\s+[^\n]*\s-i\b/u.test(cmd)) {
    return true;
  }
  // Python / Node / Ruby write patterns (common bypass of file tools).
  if (
    /\bopen\s*\(\s*['"][^'"]+['"]\s*,\s*['"](?:w|a|x|r\+)/iu.test(cmd) ||
    /\bwriteFile(?:Sync)?\s*\(/u.test(cmd) ||
    /\bfs\.write/u.test(cmd) ||
    /\.write_text\s*\(/u.test(cmd) ||
    /\.write_bytes\s*\(/u.test(cmd) ||
    /\bFile\.write\s*\(/u.test(cmd) ||
    /\bPath\s*\(\s*['"][^'"]+['"]\s*\)\s*\.write_/u.test(cmd)
  ) {
    return true;
  }
  if (/>\s*[^|&\s]/u.test(cmd) && !/\|\s*(?:head|tail|less|more|wc|rg|grep)\b/u.test(cmd)) {
    return true;
  }
  return false;
}

/**
 * Best-effort extraction of shell mutation targets.
 */
export function extractShellMutationTargets(command) {
  const cmd = String(command ?? "");
  if (!cmd.trim()) return [];
  const found = [];

  const push = (raw) => {
    if (raw == null) return;
    let value = String(raw).trim();
    if (!value || value === "/dev/null" || value.startsWith("/dev/")) return;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value.startsWith("-") && !value.startsWith("./") && value !== "-") return;
    if (!value) return;
    found.push(value);
  };

  for (const m of cmd.matchAll(/(?:^|[\s;|&])(?:\d*)>{1,2}\s*([^\s|&;]+)/gu)) {
    if (m[1] && !m[1].startsWith("&")) push(m[1]);
  }
  for (const m of cmd.matchAll(/(?:^|[\s;|&])tee\s+(?:-a\s+)?([^\s|&;]+)/gu)) {
    push(m[1]);
  }
  for (const m of cmd.matchAll(
    /(?:^|[\s;|&])(?:mkdir|touch|rm|rmdir|truncate)\b([^|&;]*)/gu,
  )) {
    const args = String(m[1] ?? "").trim().split(/\s+/u).filter(Boolean);
    for (const arg of args) {
      if (arg.startsWith("-")) continue;
      push(arg);
    }
  }
  for (const m of cmd.matchAll(/(?:^|[\s;|&])(?:mv|cp)\b([^|&;]*)/gu)) {
    const args = String(m[1] ?? "").trim().split(/\s+/u).filter(Boolean);
    for (const arg of args.filter((a) => !a.startsWith("-"))) push(arg);
  }
  for (const m of cmd.matchAll(
    /\bopen\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"](?:w|a|x|r\+)[^'"]*['"]/giu,
  )) {
    push(m[1]);
  }
  for (const m of cmd.matchAll(
    /\bwriteFile(?:Sync)?\s*\(\s*['"]([^'"]+)['"]/gu,
  )) {
    push(m[1]);
  }
  for (const m of cmd.matchAll(
    /\bPath\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.write_(?:text|bytes)\s*\(/gu,
  )) {
    push(m[1]);
  }
  for (const m of cmd.matchAll(/\bFile\.write\s*\(\s*['"]([^'"]+)['"]/gu)) {
    push(m[1]);
  }
  for (const m of cmd.matchAll(/(?:^|[\s;|&])dd\b[^\n]*?\bof=([^\s|&;]+)/gu)) {
    push(m[1]);
  }
  for (const m of cmd.matchAll(
    /(?:^|[\s;|&])sed\s+(?:-i(?:''|""|\.bak)?\s+)+(?:'[^']*'|"[^"]*"|[^\s]+)\s+([^\s|&;]+)/gu,
  )) {
    push(m[1]);
  }
  // sed -i 'expr' file
  for (const m of cmd.matchAll(
    /(?:^|[\s;|&])sed\s+-i(?:''|""|\.bak)?\s+(?:'[^']*'|"[^"]*"|[^\s]+)\s+([^\s|&;]+)/gu,
  )) {
    push(m[1]);
  }

  return [...new Set(found)];
}

/**
 * True only when the command is a pure invocation of log-decision/log-work
 * (no compound shell operators that could pair a helper name with other mutations).
 */
export function isPureLogHelperCommand(command) {
  const c = String(command ?? "").trim();
  if (!c) return false;
  // Reject compounds / subshells that can hide a second mutation.
  if (/[;&|`]|\$\(|\n/u.test(c)) return false;
  // Must invoke the helper as the node script (not only mention the name).
  return /(?:^|[\s/])node(?:\.js)?\s+[^\n]*\b(?:log-decision|log-work)\.mjs\b/u.test(
    c,
  );
}

/**
 * Detect shell commands that mutate protected trail files under auditRoot.
 * Pure helper invocations are allowed; helper name + other mutation is denied.
 */
export function shellTouchesProtectedTrail(command, auditRoot = ".goal-task") {
  const c = String(command ?? "");
  if (!c) return false;
  if (isPureLogHelperCommand(c)) return false;
  if (!shellLooksMutating(c)) return false;

  const targets = extractShellMutationTargets(c);
  if (targets.length === 0) {
    // Mutating command with unresolvable targets: fail closed if trail names appear.
    const root = String(auditRoot).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const re = new RegExp(
      `${root}[^\\s'"]*/(?:decisions\\.tsv|work\\.jsonl|\\.state(?:/|$))`,
      "iu",
    );
    return re.test(c);
  }

  for (const target of targets) {
    const rel = String(target).replaceAll("\\", "/").replace(/^\.\//u, "");
    if (isProtectedStatePath(rel, auditRoot)) return true;
    if (isProtectedTrailFile(rel, auditRoot)) return true;
    // Absolute or nested paths: check suffix under audit root
    if (isAuditRelativePath(rel, auditRoot) && /(?:decisions\.tsv|work\.jsonl)$/u.test(rel)) {
      return true;
    }
  }
  return false;
}

/** @deprecated use isPureLogHelperCommand — kept for tests/call sites */
export function isLogHelperCommand(command) {
  return isPureLogHelperCommand(command);
}
