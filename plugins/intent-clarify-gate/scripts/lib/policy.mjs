/**
 * Pure policy for intent-clarify-gate (grill-me hooks design v3.1).
 * No host I/O — safe to unit-test directly.
 */

const FULLWIDTH_DIGITS = {
  "１": "1",
  "２": "2",
  "３": "3",
};

export function normalizeFullwidthDigits(text) {
  return String(text ?? "").replace(/[１２３]/gu, (ch) => FULLWIDTH_DIGITS[ch] ?? ch);
}

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
    if (/^\s*(?:[•*-]\s*)?(?:SessionStart|UserPromptSubmit|PreToolUse|PostToolUse|Stop|SubagentStop|Notification)\s+hook\b/iu.test(line)) {
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
export function matchEntry(prompt, entryTokens = ["/grill-me", "$grill-me", "/grilling", "$grilling"]) {
  const head = actionablePrompt(prompt);
  if (!head) return null;
  const lower = head.toLowerCase();
  const tokens = [...entryTokens].sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const t = String(token).toLowerCase();
    if (!lower.startsWith(t)) continue;
    const rest = head.slice(token.length);
    if (rest === "" || /^[\s:：—–-]/u.test(rest)) {
      const topic = rest.replace(/^[\s:：—–-]+/u, "").trim();
      return { token, topic };
    }
  }
  return null;
}

/**
 * Parse complete-option lines from assistant text.
 * @returns {{ completeOffered: boolean, completeChoice: string|null, multiComplete: boolean }}
 */
export function parseCompleteOptions(assistantText) {
  const text = String(assistantText ?? "");
  const found = [];
  for (const line of text.split(/\r?\n/u)) {
    const m = line.match(/^\s*([123])\.\s*完成(?:\s|[—\-–:：]|$)/u);
    if (m) found.push(m[1]);
  }
  if (found.length === 0) {
    return { completeOffered: false, completeChoice: null, multiComplete: false };
  }
  const unique = [...new Set(found)].sort();
  return {
    completeOffered: true,
    completeChoice: unique[0],
    multiComplete: unique.length > 1,
  };
}

/**
 * Classify user message while phase is open (not the entry turn itself).
 * @param {string} prompt
 * @param {{ completeOffered?: boolean, completeChoice?: string|null }} state
 * @param {{ donePhrases?: string[], enableEngineeringBypass?: boolean }} config
 */
export function classifyUserInput(prompt, state = {}, config = {}) {
  const donePhrases = config.donePhrases ?? ["完成"];
  const enableBypass = config.enableEngineeringBypass !== false;
  let t = normalizeFullwidthDigits(String(prompt ?? "")).trim();
  if (!t) return { class: "ignore" };

  // First line drives structure; remaining lines join note.
  const lines = t.split(/\r?\n/u);
  const first = lines[0].trim();
  const restLines = lines.slice(1).join("\n").trim();

  if (enableBypass && /(?:^|\s)#\s*grill-abort\b/iu.test(t)) {
    return { class: "abort", closeReason: "aborted" };
  }

  for (const phrase of donePhrases) {
    if (first === phrase) {
      const note = [restLines].filter(Boolean).join("\n").trim();
      return { class: "done", closeReason: "completed", note: note || null, via: "meta" };
    }
    const prefix = new RegExp(
      `^${escapeRegExp(phrase)}(?:[\\s,，:：]+([\\s\\S]*))?$`,
      "u",
    );
    const dm = first.match(prefix);
    if (dm) {
      const note = [dm[1]?.trim(), restLines].filter(Boolean).join("\n").trim();
      return { class: "done", closeReason: "completed", note: note || null, via: "meta" };
    }
  }

  let choice = null;
  let note = "";
  const only = first.match(/^([123])$/u);
  if (only) {
    choice = only[1];
    note = restLines;
  } else {
    const withSep = first.match(/^([123])(?:\s*[.、:：]\s*|\s+)([\s\S]*)$/u);
    if (withSep) {
      choice = withSep[1];
      note = [withSep[2]?.trim(), restLines].filter(Boolean).join("\n").trim();
    }
  }

  if (choice) {
    if (state.completeOffered && String(state.completeChoice) === choice) {
      return {
        class: "done",
        closeReason: "completed",
        note: note || null,
        via: "choice",
        choice,
      };
    }
    if (!note) {
      return { class: "choice", choice };
    }
    return { class: "choice_note", choice, note };
  }

  return { class: "constraint", text: t };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Glob-ish match for ledger allow: supports `**` and trailing `/**`.
 * Paths are POSIX relative to repo root.
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
      .map((part) => part.replace(/[.+^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, "[^/]*"))
      .join(".*");
    return new RegExp(`^${escaped}$`, "u").test(path);
  }
  if (pat.endsWith("/*")) {
    const prefix = pat.slice(0, -2);
    return path.startsWith(`${prefix}/`) && !path.slice(prefix.length + 1).includes("/");
  }
  return path === pat || path.endsWith(`/${pat}`);
}

export function isLedgerPath(relPath, config) {
  const writeBlock = config?.writeBlock ?? {};
  const allows = writeBlock.ledgerAllow ?? [".grill-ledgers/**", "docs/decisions/**"];
  if (allows.some((pattern) => pathMatchesGlob(relPath, pattern))) return true;
  if (writeBlock.allowSpecMd !== false) {
    const path = String(relPath ?? "").replaceAll("\\", "/");
    if (/(?:^|\/)spec\.md$/iu.test(path)) return true;
  }
  return false;
}

/**
 * Detect shell commands that mutate the workspace (best-effort).
 */
export function shellLooksMutating(command) {
  const cmd = String(command ?? "");
  if (!cmd.trim()) return false;
  if (/(?:^|[\s;|&])(?:cat|tee)\s+.*>/u.test(cmd)) return true;
  if (/(?:^|[\s;|&])(?:rm|mv|cp|chmod|chown|mkdir|touch|install)\b/u.test(cmd)) return true;
  if (/(?:^|[\s;|&])(?:sed|perl|ruby|python3?)\s+[^\n]*\s-i\b/u.test(cmd)) return true;
  if (/(?:^|[\s;|&])(?:npm|pnpm|yarn|pip|cargo|go)\s+(?:install|add|remove|uninstall)\b/u.test(cmd)) return true;
  if (/>\s*[^|&\s]/u.test(cmd) && !/\|\s*(?:head|tail|less|more|wc|rg|grep)\b/u.test(cmd)) return true;
  if (/\bgit\s+(?:commit|add|checkout|merge|rebase|reset|push|tag)\b/u.test(cmd)) return true;
  return false;
}

export function writeBlockActive(phase, config) {
  return phase === "open" && (config?.writeBlock?.mode ?? "block") === "block";
}

export function shouldReportWrite(phase, config) {
  return phase === "open" && config?.writeBlock?.mode === "report";
}

/**
 * Apply classification to phase state (pure transition).
 */
export function applyClassification(state, classification, now = Date.now()) {
  const next = { ...state, updatedAt: now };
  switch (classification.class) {
    case "ignore":
      return next;
    case "choice":
      next.lastUserClass = "choice";
      next.lastChoice = classification.choice;
      next.lastNote = null;
      next.turnIndex = Number(next.turnIndex || 0) + 1;
      next.phase = "open";
      return next;
    case "choice_note":
      next.lastUserClass = "choice_note";
      next.lastChoice = classification.choice;
      next.lastNote = classification.note;
      next.turnIndex = Number(next.turnIndex || 0) + 1;
      next.phase = "open";
      return next;
    case "constraint":
      next.lastUserClass = "constraint";
      next.lastChoice = null;
      next.lastNote = null;
      next.turnIndex = Number(next.turnIndex || 0) + 1;
      next.phase = "open";
      return next;
    case "done":
      next.phase = "closed";
      next.closeReason = classification.closeReason || "completed";
      next.lastUserClass = "done";
      next.lastChoice = classification.choice ?? next.lastChoice ?? null;
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
    topicPreview: String(entry.topic || "").slice(0, 80),
    turnIndex: 0,
    lastUserClass: "entry",
    lastChoice: null,
    lastNote: null,
    completeOffered: false,
    completeChoice: null,
    closeReason: null,
    skillReady: true,
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

export function protocolInjectText() {
  return [
    "[intent-clarify-gate] 访谈/意图澄清模式已开启（业务写入已拦截）。",
    "",
    "【agent】",
    "1. 每轮一题，恰好 3 个选项，标记 1. 2. 3.；可标注推荐。",
    "2. 关键路径大致摸清后，必须把其中一项写成：",
    "   N. 完成 — <锁定说明>",
    "   供用户选 N 或直接回「完成」结束。",
    "3. 用户「N」或「N + 说明」：接受选项 N，说明为附加约束；复述后继续。",
    "4. 用户纯文本（无 1/2/3/完成 前缀）：条件变更，重出 1/2/3，不结束。",
    "5. 用户「完成」或选中完成项：输出已选决策摘要，停止访谈；未完成前不改业务代码。",
    "",
    "【user 合法输入】",
    "- 1 / 2 / 3",
    "- 1 但是… / 2：…（选题+附加说明）",
    "- 完成 或 完成 + 说明",
    "- 其它文字 = 条件变更",
    "- 逃生 # grill-abort",
  ].join("\n");
}

export function classifyInjectText(classification) {
  switch (classification.class) {
    case "choice":
      return `[intent-clarify-gate] 用户已选 ${classification.choice}。请记入决策并给出下一题的 1/2/3（路径摸清时包含「N. 完成 — …」）。`;
    case "choice_note":
      return [
        `[intent-clarify-gate] 用户已选 ${classification.choice}，附加说明：${classification.note}`,
        "请复述理解后继续：若说明修正本题则重出 1/2/3，否则进入下一决策点。",
      ].join("\n");
    case "constraint":
      return [
        "[intent-clarify-gate] 用户输入为条件/偏好变更（未选题、未结束）。",
        "请合并约束后重新给出本题 1/2/3；不要结束访谈，不要改业务代码。",
      ].join("\n");
    case "done":
      return [
        "[intent-clarify-gate] 访谈已结束（写屏障已解除）。",
        classification.note ? `收束附加说明：${classification.note}` : null,
        "请输出已选决策摘要；等待用户后续实现/规划指令。",
      ].filter(Boolean).join("\n");
    case "abort":
      return "[intent-clarify-gate] 用户中止访谈（写屏障已解除）。可处理后续普通开发任务。";
    default:
      return null;
  }
}

export function writeDenyMessage() {
  return [
    "[intent-clarify-gate] 当前处于意图澄清/访谈模式，业务写入已拦截。",
    "",
    "blockingContract:",
    "  observedFacts: session phase 为 open，目标路径不在台账白名单。",
    "  harm: 关键歧义未收敛前改代码会导致错误实现与返工。",
    "  unblockWhen: 用户整段回复「完成」、选中「N. 完成 — …」选项，或 # grill-abort。",
    "  recovery: 继续 1/2/3 选题；条件变更请直接说明；台账可写 docs/decisions/ 与 .grill-ledgers/。",
  ].join("\n");
}
