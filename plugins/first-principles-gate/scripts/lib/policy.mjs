/**
 * Pure policy for first-principles-gate.
 * No host I/O — safe to unit-test directly.
 */

/**
 * Strip skill blocks, fenced code, and hook re-injection noise for entry matching.
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

/**
 * @returns {{ token: string, topic: string } | null}
 */
export function matchEntry(
  prompt,
  entryTokens = ["/first-principles", "$first-principles"],
) {
  const head = actionablePrompt(prompt);
  if (!head) return null;
  const lower = head.toLowerCase();
  const tokens = [...entryTokens].sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const t = String(token).toLowerCase();
    if (!lower.startsWith(t)) continue;
    const rest = head.slice(token.length);
    // Delimiters: EOS, whitespace, colon. Em/en dash only when followed by space.
    // Bare hyphen is NOT a delimiter so "/first-principles-extra" cannot open mode.
    if (
      rest === "" ||
      /^[\s:：]/u.test(rest) ||
      /^(?:—|–)\s+/u.test(rest)
    ) {
      const topic = rest.replace(/^(?:[\s:：]+|(?:—|–)\s+)/u, "").trim();
      return { token, topic };
    }
  }
  return null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Classify user message while phase is open (not the entry turn itself).
 */
export function classifyUserInput(prompt, state = {}, config = {}) {
  const donePhrases = config.donePhrases ?? ["done"];
  const enableBypass = config.enableEngineeringBypass !== false;
  const abortToken = config.abortToken ?? "# first-principles-abort";
  const t = String(prompt ?? "").trim();
  if (!t) return { class: "ignore" };

  const lines = t.split(/\r?\n/u);
  const first = lines[0].trim();
  const restLines = lines.slice(1).join("\n").trim();

  if (enableBypass) {
    const abortRe = new RegExp(
      `(?:^|\\s)${escapeRegExp(abortToken).replace(/\\ /gu, "\\s+")}\\b`,
      "iu",
    );
    // Accept configured abort token, plus explicit full-name form on first line.
    if (
      abortRe.test(t) ||
      /^#\s*first-principles-abort\b/iu.test(first)
    ) {
      return { class: "abort", closeReason: "aborted" };
    }
  }

  for (const phrase of donePhrases) {
    if (first === phrase) {
      const note = restLines || null;
      return { class: "done", closeReason: "completed", note, via: "meta" };
    }
    const prefix = new RegExp(
      `^${escapeRegExp(phrase)}(?:[\\s,，:：]+([\\s\\S]*))?$`,
      "iu",
    );
    const dm = first.match(prefix);
    if (dm) {
      const note = [dm[1]?.trim(), restLines].filter(Boolean).join("\n").trim();
      return {
        class: "done",
        closeReason: "completed",
        note: note || null,
        via: "meta",
      };
    }
  }

  return {
    class: "continue",
    text: t,
    turnHint: state.turnIndex ?? 0,
  };
}

/**
 * Glob-ish match for ledger allow: supports `**` and trailing `/**`.
 */
export function pathMatchesGlob(relPath, pattern) {
  const path = String(relPath ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");
  const pat = String(pattern ?? "").replaceAll("\\", "/");
  if (!path || !pat) return false;
  if (pat.endsWith("/**")) {
    const prefix = pat.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (pat.includes("**")) {
    const escaped = pat
      .split("**")
      .map((part) =>
        part.replace(/[.+^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, "[^/]*"),
      )
      .join(".*");
    return new RegExp(`^${escaped}$`, "u").test(path);
  }
  if (pat.endsWith("/*")) {
    const prefix = pat.slice(0, -2);
    return (
      path.startsWith(`${prefix}/`) && !path.slice(prefix.length + 1).includes("/")
    );
  }
  return path === pat || path.endsWith(`/${pat}`);
}

function normalizeRel(relPath) {
  return String(relPath ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");
}

/**
 * Collapse `.` / `..` segments so allowlist checks cannot be bypassed with
 * `docs/decisions/../../src/app.js` style paths.
 */
export function normalizeRelPath(relPath) {
  const parts = [];
  for (const seg of normalizeRel(relPath).split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("/");
}

function pathUnderTree(path, prefix) {
  const p = normalizeRelPath(path);
  const root = normalizeRelPath(prefix).replace(/\/+$/u, "");
  if (!root || root === ".") return false;
  if (p === root || p.startsWith(`${root}/`)) return true;
  const nested = `/workspace/${root}`;
  return p.includes(`${nested}/`) || p.endsWith(nested);
}

export const STATE_DIR_RELATIVE = ".first-principles/.state";

/**
 * Plugin-owned session files. These live under the ledger tree but must never
 * be treated as writable ledger artifacts.
 */
export function isProtectedStatePath(relPath) {
  const path = normalizeRelPath(relPath);
  return path === STATE_DIR_RELATIVE || pathUnderTree(path, STATE_DIR_RELATIVE);
}

/**
 * True when a path is an allowlisted *ledger artifact file* (not a bare directory).
 * Used so mkdir on `.first-principles` cannot credit session ledger revision.
 */
export function isLedgerArtifactPath(relPath, config) {
  const path = normalizeRelPath(relPath);
  if (!isLedgerPath(path, config)) return false;
  const primary = normalizeRelPath(
    config?.ledger?.primaryRelativePath ?? ".first-principles/ledger.json",
  );
  if (path === primary || path.endsWith(`/workspace/${primary}`)) return true;
  return /\.(json|md)$/iu.test(path);
}

/**
 * True when relPath is under an allowlisted tree.
 * Also matches when the workspace is nested under a monorepo git root
 * (e.g. plugins/.../workspace/.first-principles/ledger.json).
 * Always allows the configured primary ledger path and its parent directory.
 */
export function isLedgerPath(relPath, config) {
  if (isProtectedStatePath(relPath)) return false;
  const writeBlock = config?.writeBlock ?? {};
  const allows = writeBlock.ledgerAllow ?? [
    ".first-principles/**",
    "docs/decisions/**",
  ];
  const path = normalizeRelPath(relPath);
  if (allows.some((pattern) => pathMatchesGlob(path, pattern))) return true;
  if (
    allows.some((pattern) => {
      const pat = String(pattern ?? "").replaceAll("\\", "/");
      if (pat.endsWith("/**")) {
        const prefix = pat.slice(0, -3);
        return pathUnderTree(path, prefix);
      }
      return path === pat || path.endsWith(`/workspace/${pat}`) || path.includes(`/workspace/${pat}/`);
    })
  ) {
    return true;
  }

  // Configured primary ledger file + parent dir (mkdir -p parent must be allowed).
  const primary = normalizeRelPath(
    config?.ledger?.primaryRelativePath ?? ".first-principles/ledger.json",
  );
  if (primary) {
    if (path === primary || path.endsWith(`/workspace/${primary}`)) {
      return true;
    }
    const slash = primary.lastIndexOf("/");
    if (slash > 0) {
      const parent = primary.slice(0, slash);
      if (pathUnderTree(path, parent)) return true;
    }
  }

  if (writeBlock.allowSpecMd !== false) {
    if (/(?:^|\/)spec\.md$/iu.test(path)) return true;
  }
  return false;
}

export function shellLooksMutating(command) {
  const cmd = String(command ?? "");
  if (!cmd.trim()) return false;
  if (/(?:^|[\s;|&])(?:cat|tee|printf|dd)\b/u.test(cmd) && /(?:^|[\s;|&])(?:\d*)>{1,2}|of=/u.test(cmd)) {
    return true;
  }
  if (/(?:^|[\s;|&])(?:cat|tee)\s+.*>/u.test(cmd)) return true;
  if (/(?:^|[\s;|&])dd\b[^\n]*\bof=/u.test(cmd)) return true;
  if (/(?:^|[\s;|&])(?:rm|mv|cp|chmod|chown|mkdir|touch|install)\b/u.test(cmd)) {
    return true;
  }
  if (/(?:^|[\s;|&])(?:sed|perl|ruby|python3?)\s+[^\n]*\s-i\b/u.test(cmd)) {
    return true;
  }
  if (
    /(?:^|[\s;|&])(?:npm|pnpm|yarn|pip|cargo|go)\s+(?:install|add|remove|uninstall)\b/u.test(
      cmd,
    )
  ) {
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
  if (/\bgit\s+(?:commit|add|checkout|merge|rebase|reset|push|tag)\b/u.test(cmd)) {
    return true;
  }
  return false;
}

/**
 * Best-effort extraction of shell mutation targets (relative or absolute paths).
 * Returns [] when mutating but targets cannot be resolved (caller must fail closed).
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
    // Drop flags mistaken as paths
    if (value.startsWith("-") && !value.startsWith("./") && value !== "-") return;
    if (!value) return;
    found.push(value);
  };

  // Redirects: > path, >> path, 2> path (not 2>&1)
  for (const m of cmd.matchAll(/(?:^|[\s;|&])(?:\d*)>{1,2}\s*([^\s|&;]+)/gu)) {
    if (m[1] && !m[1].startsWith("&")) push(m[1]);
  }

  // tee path
  for (const m of cmd.matchAll(/(?:^|[\s;|&])tee\s+(?:-a\s+)?([^\s|&;]+)/gu)) {
    push(m[1]);
  }

  // mkdir / touch / rm / rmdir (non-flag args). Do not treat `npm install pkg` as paths.
  for (const m of cmd.matchAll(
    /(?:^|[\s;|&])(?:mkdir|touch|rm|rmdir)\b([^|&;]*)/gu,
  )) {
    const args = String(m[1] ?? "").trim().split(/\s+/u).filter(Boolean);
    for (const arg of args) {
      if (arg.startsWith("-")) continue;
      push(arg);
    }
  }

  // mv/cp sources+dest: take last non-flag as dest, also earlier non-flags as targets
  for (const m of cmd.matchAll(/(?:^|[\s;|&])(?:mv|cp)\b([^|&;]*)/gu)) {
    const args = String(m[1] ?? "").trim().split(/\s+/u).filter(Boolean);
    const paths = args.filter((arg) => !arg.startsWith("-"));
    for (const arg of paths) push(arg);
  }

  // python/node open('path','w'|...)
  for (const m of cmd.matchAll(
    /\bopen\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"](?:w|a|x|r\+)[^'"]*['"]/giu,
  )) {
    push(m[1]);
  }

  // writeFileSync('path' / writeFile('path'
  for (const m of cmd.matchAll(
    /\bwriteFile(?:Sync)?\s*\(\s*['"]([^'"]+)['"]/gu,
  )) {
    push(m[1]);
  }

  // pathlib Path('p').write_text / write_bytes ; File.write('p'
  for (const m of cmd.matchAll(
    /\bPath\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.write_(?:text|bytes)\s*\(/gu,
  )) {
    push(m[1]);
  }
  for (const m of cmd.matchAll(/\bFile\.write\s*\(\s*['"]([^'"]+)['"]/gu)) {
    push(m[1]);
  }

  // dd ... of=path
  for (const m of cmd.matchAll(/(?:^|[\s;|&])dd\b[^\n]*?\bof=([^\s|&;]+)/gu)) {
    push(m[1]);
  }

  // sed -i ... file (last arg after -i)
  for (const m of cmd.matchAll(
    /(?:^|[\s;|&])sed\s+(?:-i(?:''|""|\.bak)?\s+)+(?:'[^']*'|"[^"]*"|[^\s]+)\s+([^\s|&;]+)/gu,
  )) {
    push(m[1]);
  }

  return [...new Set(found)];
}

/**
 * Decide whether a shell command should be denied while write-block is active.
 * @returns {{ deny: boolean, reasons: string[] }}
 */
export function shellWriteDecision(command, config, resolveRelative) {
  const cmd = String(command ?? "");
  if (!shellLooksMutating(cmd)) {
    return { deny: false, reasons: [] };
  }
  const targets = extractShellMutationTargets(cmd);
  if (targets.length === 0) {
    return {
      deny: true,
      reasons: [
        `mutating shell without resolvable path (fail-closed): ${cmd.slice(0, 120)}`,
      ],
    };
  }
  const reasons = [];
  for (const target of targets) {
    const rel =
      typeof resolveRelative === "function" ? resolveRelative(target) : target;
    if (!isLedgerPath(rel, config)) {
      reasons.push(rel);
    }
  }
  return { deny: reasons.length > 0, reasons };
}

/**
 * Ledger must be structurally valid AND produced/updated in this open session.
 * Accepts: mtime after enteredAt, or PostToolUse revision bump this session.
 */
export function isSessionBoundLedger(check, state, now = Date.now()) {
  if (!check?.valid) return false;
  const enteredAt = Number(state?.enteredAt || 0);
  if (!enteredAt) return false;
  const revision = Number(state?.ledgerRevision || 0);
  if (revision > 0) return true;
  const mtimeMs = Number(check.mtimeMs || 0);
  if (mtimeMs > 0 && mtimeMs + 1000 >= enteredAt) return true;
  // Defensive: if clock skew made mtime slightly in the future beyond now+skew, still ok if after enter
  if (mtimeMs > now + 60_000) return false;
  return false;
}

export function sessionBoundFindings(check, state) {
  if (!check?.valid) return check?.findings ?? ["missing ledger"];
  if (isSessionBoundLedger(check, state)) return [];
  return [
    "ledger is structurally valid but stale for this session (mtime predates open, and no in-session ledger write was observed); rewrite `.first-principles/ledger.json` during the active session",
  ];
}

export function writeBlockActive(phase, config) {
  return phase === "open" && (config?.writeBlock?.mode ?? "block") === "block";
}

export function shouldReportWrite(phase, config) {
  return phase === "open" && config?.writeBlock?.mode === "report";
}

export function applyClassification(state, classification, now = Date.now()) {
  const next = { ...state, updatedAt: now };
  switch (classification.class) {
    case "ignore":
      return next;
    case "continue":
      next.lastUserClass = "continue";
      next.lastNote = null;
      next.turnIndex = Number(next.turnIndex || 0) + 1;
      next.phase = "open";
      return next;
    case "done":
      next.phase = "closed";
      next.closeReason = classification.closeReason || "completed";
      next.lastUserClass = "done";
      next.lastNote = classification.note ?? null;
      return next;
    case "abort":
      next.phase = "closed";
      next.closeReason = "aborted";
      next.lastUserClass = "abort";
      return next;
    default:
      return next;
  }
}

export function openFromEntry(state, entry, now = Date.now()) {
  return {
    ...state,
    phase: "open",
    enteredAt: now,
    updatedAt: now,
    entryToken: entry.token,
    topicPreview: String(entry.topic || "").slice(0, 120),
    turnIndex: 0,
    lastUserClass: "entry",
    lastNote: null,
    closeReason: null,
    ledgerPath: null,
    ledgerRevision: 0,
    ledgerValid: false,
    stopAttempts: 0,
  };
}

export function isExpired(state, ttlHours, now = Date.now()) {
  if (!state || state.phase !== "open") return false;
  const updated = Number(state.updatedAt || state.enteredAt || 0);
  if (!updated) return false;
  return now - updated > ttlHours * 3600_000;
}

const IMPLEMENT_CLAIM =
  /(?:开始实现|开始写代码|我来改代码|我先改|直接实现|着手实现|let me (?:implement|start coding)|i(?:'| a)?m going to (?:implement|edit|write the code))/iu;

export function looksLikeImplementClaim(assistantText) {
  return IMPLEMENT_CLAIM.test(String(assistantText ?? ""));
}

/**
 * Positive completion claims about first-principles analysis.
 * Does not match mere discussion of the method.
 */
const COMPLETION_CLAIM =
  /(?:第一性原理(?:分析|拆解)?已完成|已(?:完成|写好|落盘)(?:第一性原理)?(?:台账|ledger)|ledger\s+(?:is\s+)?(?:complete|ready|valid)|first[- ]principles\s+(?:analysis\s+)?(?:is\s+)?(?:complete|done)|已拆到基本事实|atoms?\s+and\s+rebuild\s+(?:are\s+)?(?:ready|complete)|基本事实与重建已就绪)/iu;

export function looksLikeCompletionClaim(assistantText) {
  return COMPLETION_CLAIM.test(String(assistantText ?? ""));
}

export function protocolInjectText(topic = "") {
  const topicLine = topic ? `Topic: ${topic}` : null;
  return [
    "[first-principles-gate] First-principles mode is open; business writes are blocked.",
    topicLine,
    "",
    "[agent]",
    "1. State the question to decide and the current default approach.",
    "2. List implicit conventional assumptions.",
    "3. Reduce the problem to irreducible facts and constraints (atoms).",
    "4. Derive alternatives only from atoms (rebuild.options; every derived_from must reference an atom id).",
    "5. Record uncertainties and next_actions.",
    "6. Write the structured ledger to `.first-principles/ledger.json` (schema: first-principles/v1).",
    "7. Dispatch a read-only subagent with only `FP_REVIEW_REQUEST challenger` before asking the user for `done`.",
    "8. Do not modify business code until the user replies `done`; escape hatch: `# first-principles-abort`.",
    "",
    "[user]",
    "- Continue analysis: state constraints or feedback directly",
    "- Finish and release the write barrier: done",
    "- Abort: # first-principles-abort",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function classifyInjectText(classification) {
  switch (classification.class) {
    case "continue":
      return [
        "[first-principles-gate] Continue the first-principles analysis.",
        "Update `.first-principles/ledger.json` (question / assumptions / atoms / rebuild / uncertainties).",
        "Do not modify business code before completion. The user can release the write barrier with `done` or `# first-principles-abort`.",
      ].join("\n");
    case "done":
      return [
        "[first-principles-gate] The first-principles session is closed; the write barrier is released.",
        classification.note ? `Closing note: ${classification.note}` : null,
        "If no valid ledger has been written, Stop will still require the missing structured fields before completion can be claimed.",
      ]
        .filter(Boolean)
        .join("\n");
    case "abort":
      return "[first-principles-gate] The user aborted first-principles mode; the write barrier is released and ordinary development tasks may proceed.";
    default:
      return null;
  }
}

export function stateProtectMessage() {
  return [
    "[first-principles-gate] Session state under `.first-principles/.state/` is plugin-owned.",
    "Write the ledger to `.first-principles/ledger.json`; do not edit hook state files.",
  ].join("\n");
}

export function writeDenyMessage() {
  return [
    "[first-principles-gate] First-principles mode is open; business writes are blocked.",
    "",
    "blockingContract:",
    "  observedFacts: The session phase is open and the target path is outside the ledger allowlist.",
    "  harm: Modifying code before persisting the structured analysis can cause an incorrect implementation and rework.",
    "  unblockWhen: The user replies `done` or sends # first-principles-abort; TTL expiry also releases the barrier.",
    "  recovery: Write the ledger to `.first-principles/ledger.json`; ledger and docs/decisions/ paths remain writable.",
  ].join("\n");
}

export function ledgerBlockMessage(findings) {
  const list = (findings ?? []).map((item) => `- ${item}`).join("\n");
  return [
    "[first-principles-gate] Completion or closure requires a valid on-disk first-principles ledger.",
    "",
    "findings:",
    list || "- missing ledger",
    "",
    "blockingContract:",
    "  observedFacts: The final response claims completion, or phase=closed(completed), but the ledger structure is incomplete.",
    "  harm: Without a machine-verifiable intermediate artifact, downstream work cannot inherit the assumptions and foundational facts.",
    "  unblockWhen: Write `.first-principles/ledger.json` and pass schema validation.",
    "  recovery: See the bundled first-principles-ledger Skill; minimum fields are question, assumptions, atoms, rebuild.options[].derived_from, and uncertainties.",
  ].join("\n");
}

export function softLedgerReport(findings) {
  const list = (findings ?? []).map((item) => `- ${item}`).join("\n");
  return [
    "[first-principles-gate] The ledger is still incomplete; this is a soft report and does not create a permanent lock.",
    list || "- missing ledger",
    "Continue writing `.first-principles/ledger.json`; validation becomes mandatory after a completion claim or the user's `done` response.",
  ].join("\n");
}
