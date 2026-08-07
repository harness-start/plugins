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
    const m = line.match(/^\s*([123])\.\s*done(?:\s|[—\-–:：]|$)/iu);
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
  const donePhrases = config.donePhrases ?? ["done"];
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
    "[intent-clarify-gate] Interview and intent-clarification mode is open; business writes are blocked.",
    "",
    "[agent]",
    "1. Ask one question per turn with exactly three options labeled 1, 2, and 3; one may be marked recommended.",
    "2. Once the critical path is sufficiently clear, one option must be:",
    "   N. Done — <locked-scope summary>",
    "   The user may select N or reply `done` directly to finish.",
    "3. For `N` or `N + note`, accept option N and treat the note as an added constraint; restate it, then continue.",
    "4. Plain text without a 1/2/3/done prefix changes the constraints; present 1/2/3 again without closing.",
    "5. When the user replies `done` or selects the Done option, summarize selected decisions and end the interview; do not modify business code before then.",
    "",
    "[valid user input]",
    "- 1 / 2 / 3",
    "- 1 with a note / 2: note (selection plus constraint)",
    "- done or done + note",
    "- other text = constraint change",
    "- escape hatch: # grill-abort",
  ].join("\n");
}

export function classifyInjectText(classification) {
  switch (classification.class) {
    case "choice":
      return `[intent-clarify-gate] The user selected ${classification.choice}. Record the decision and ask the next 1/2/3 question; include \`N. Done — …\` once the path is clear.`;
    case "choice_note":
      return [
        `[intent-clarify-gate] The user selected ${classification.choice} with this note: ${classification.note}`,
        "Restate your understanding, then continue: present the current 1/2/3 again if the note changes this question; otherwise move to the next decision point.",
      ].join("\n");
    case "constraint":
      return [
        "[intent-clarify-gate] The user's input changes a constraint or preference; it does not select an option or end the interview.",
        "Merge the constraint and present this question's 1/2/3 again; do not end the interview or modify business code.",
      ].join("\n");
    case "done":
      return [
        "[intent-clarify-gate] The interview is closed; the write barrier is released.",
        classification.note ? `Closing note: ${classification.note}` : null,
        "Summarize the selected decisions and wait for the user's implementation or planning instruction.",
      ].filter(Boolean).join("\n");
    case "abort":
      return "[intent-clarify-gate] The user aborted the interview; the write barrier is released and ordinary development tasks may proceed.";
    default:
      return null;
  }
}

export function writeDenyMessage() {
  return [
    "[intent-clarify-gate] Intent-clarification interview mode is open; business writes are blocked.",
    "",
    "blockingContract:",
    "  observedFacts: The session phase is open and the target path is outside the ledger allowlist.",
    "  harm: Modifying code before critical ambiguities converge can cause an incorrect implementation and rework.",
    "  unblockWhen: The user replies `done`, selects the `N. Done — …` option, or sends # grill-abort.",
    "  recovery: Continue with 1/2/3 questions; state constraint changes directly. Ledger writes are allowed under docs/decisions/ and .grill-ledgers/.",
  ].join("\n");
}
