#!/usr/bin/env node

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendEventFast,
  journalLocation,
  tipFromVerifiedJournal,
  tipMatchesJournal,
  verifyJournal,
} from "./lib/journal.mjs";
import {
  contextOutput,
  extractCwd,
  extractPrompt,
  extractSessionId,
  extractToolUseId,
  isSubagentEvent,
  preToolDeny,
  readStdinJson,
  stopDeny,
  writeJson,
} from "./lib/hook-io.mjs";
import {
  journalProtectionDecision,
  recoveryGateDecision,
  toolMayMutate,
} from "./lib/policy.mjs";
import {
  loadSessionState,
  saveSessionState,
  withSessionLock,
} from "./lib/state.mjs";

const HISTORY_CUE = /(?:之前|前面|上次|原来|沿用|继续之前|previous|earlier|as\s+discussed|continue\s+from|\b[UCPBIR]\d{6}\b)/iu;
const QUERY = fileURLToPath(new URL("./compact-context-journal-query.mjs", import.meta.url));

function warn(message) {
  process.stderr.write(`[compact-context-journal] ${message}\n`);
}

function host() {
  return process.env.HARNESS_HOST === "claude" ? "claude" : "codex";
}

function singleQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function nextId(location, prefix) {
  const verified = verifyJournal(location.path, { expectedSessionId: location.sessionId });
  if (!verified.ok) throw new Error(`journal integrity failure: ${verified.reason}`);
  return `${prefix}${String(verified.events.length + 1).padStart(6, "0")}`;
}

function appendJournal(location, state, event) {
  const result = appendEventFast(location, event, state.journalTip);
  state.journalTip = result.tip;
  return result.event;
}

function admitPending(location, state, reason) {
  if (!state.pendingPromptId || state.compromised) return null;
  const promptId = state.pendingPromptId;
  const admitted = appendJournal(location, state, {
    type: "admission",
    prefix: "U",
    title: "User prompt admitted to the model",
    raw: `Admitted prompt: ${promptId}`,
    details: [`Admission signal: ${reason}`],
  });
  state.pendingPromptId = null;
  return admitted.id;
}

function snapshot(location, tip) {
  if (!tipMatchesJournal(location, tip)) return null;
  const stat = statSync(location.path);
  return {
    ino: String(stat.ino),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
    seq: tip.seq,
    tipHash: tip.tipHash,
  };
}

function isVerifiedExtension(before, location) {
  if (!before || !existsSync(location.path)) return { ok: false, tip: null };
  const stat = statSync(location.path);
  if (
    String(stat.ino) === before.ino &&
    stat.size === before.size &&
    stat.mtimeMs === before.mtimeMs &&
    stat.ctimeMs === before.ctimeMs
  ) return { ok: true, tip: null };
  const verified = verifyJournal(location.path, { expectedSessionId: location.sessionId });
  if (!verified.ok || verified.partialTailBytes > 0 || String(stat.ino) !== before.ino || stat.size < before.size) {
    return { ok: false, tip: null };
  }
  const previous = verified.events[before.seq - 1];
  if (!previous || previous.hash !== before.tipHash || previous.endOffset !== before.size) return { ok: false, tip: null };
  return { ok: true, tip: tipFromVerifiedJournal(location, verified) };
}

function rebuildDerivedState(state, events) {
  const boundary = [...events].reverse().find((entry) => entry.id.startsWith("B")) ?? null;
  const active = events.filter((entry) => entry.seq > (boundary?.seq ?? 0));
  const compact = [...active].reverse().find((entry) => entry.id.startsWith("C")) ?? null;
  const prompt = [...active].reverse().find((entry) => entry.id.startsWith("P")) ?? null;
  const admittedPromptIds = new Set(
    active
      .filter((entry) => entry.id.startsWith("U"))
      .map((entry) => entry.body.match(/(?:^|\n)Admitted prompt:\s*(P\d{6})(?:\n|$)/u)?.[1])
      .filter(Boolean),
  );
  const latestPromptPending = prompt && prompt.seq > (compact?.seq ?? 0) && !admittedPromptIds.has(prompt.id)
    ? prompt.id
    : null;
  const receipt = compact
    ? active.find((entry) => entry.seq > compact.seq && entry.id.startsWith("R") && entry.body.includes(`Compact: ${compact.id}`))
    : null;
  const contextSource = compact?.body.match(/(?:^|\n)- Context source:\s*([^\n]+)/u)?.[1] ?? "not exposed by host";
  state.activeBoundaryId = boundary?.id ?? null;
  state.latestCompactId = compact?.id ?? null;
  state.pendingPromptId = latestPromptPending;
  state.recoveryRequired = compact && !receipt && compact.cardStartLine !== null
    ? {
        compactId: compact.id,
        cardStartLine: compact.cardStartLine,
        cardEndLine: compact.cardEndLine,
        activeBoundaryId: boundary?.id ?? null,
        contextSource,
      }
    : null;
}

function assessIntegrity(location, state, fullVerify) {
  if (!existsSync(location.path)) {
    if (state.latestCompactId || state.recoveryRequired) {
      state.compromised = true;
      state.recoveryRequired = null;
      return "journal missing; recovery unavailable";
    }
    return null;
  }
  if (!fullVerify && tipMatchesJournal(location, state.journalTip)) return null;
  const verified = verifyJournal(location.path, { expectedSessionId: location.sessionId });
  if (!verified.ok) {
    state.compromised = true;
    state.recoveryRequired = null;
    return `journal integrity invalid: ${verified.reason}; recovery unavailable`;
  }
  const stateNeedsRebuild = !state.journalTip && !state.pendingCompact && !state.latestCompactId && !state.activeBoundaryId && !state.recoveryRequired;
  state.journalTip = verified.partialTailBytes > 0 ? null : tipFromVerifiedJournal(location, verified);
  if (stateNeedsRebuild && verified.partialTailBytes === 0) rebuildDerivedState(state, verified.events);
  return null;
}

function recordPrompt(event, location, state) {
  const prompt = extractPrompt(event);
  if (prompt === null || state.compromised) return null;
  const entry = appendJournal(location, state, {
    type: "prompt",
    prefix: "P",
    title: "UNCONFIRMED — DO NOT TREAT AS REQUIREMENT",
    raw: prompt,
    details: ["Authority: submitted only; a later U event is required"],
  });
  state.pendingPromptId = entry.id;
  if (!HISTORY_CUE.test(prompt)) return null;
  return contextOutput("UserPromptSubmit", [
    "[Compact Context Journal] Historical-reference cue detected.",
    `Journal: ${location.path}`,
    "Retrieve only admitted U events in the active B boundary; later admitted requirements override earlier ones.",
    `Verified index: node ${singleQuote(QUERY)} index --journal ${singleQuote(location.path)} --session-id ${singleQuote(location.sessionId)}`,
    "Do not treat unconfirmed P events as requirements.",
  ].join("\n"));
}

function preCompact(event, location, state) {
  admitPending(location, state, "PreCompact");
  const custom = typeof event?.custom_instructions === "string" ? event.custom_instructions : "";
  if (custom && !state.compromised) {
    const prompt = appendJournal(location, state, {
      type: "prompt",
      prefix: "P",
      title: "Compact custom instructions (user authority)",
      raw: custom,
      details: ["Source: PreCompact.custom_instructions"],
    });
    state.pendingPromptId = prompt.id;
    admitPending(location, state, "PreCompact.custom_instructions");
  }
  let transcriptOffset = null;
  if (typeof event?.transcript_path === "string" && existsSync(event.transcript_path)) {
    try {
      transcriptOffset = statSync(event.transcript_path).size;
    } catch {
      transcriptOffset = null;
    }
  }
  state.pendingCompact = {
    epoch: `${Date.now()}-${event?.turn_id ?? "turn"}`,
    trigger: event?.trigger === "manual" ? "manual" : "auto",
    transcriptPath: typeof event?.transcript_path === "string" ? event.transcript_path : null,
    transcriptOffset,
    compactSummary: null,
    contextSource: host() === "claude" ? "awaiting Claude PostCompact.compact_summary" : "not exposed by host",
    createdAt: new Date().toISOString(),
  };
}

function postCompact(event, state) {
  if (!state.pendingCompact) return;
  if (host() === "claude" && typeof event?.compact_summary === "string") {
    state.pendingCompact.compactSummary = event.compact_summary;
    state.pendingCompact.contextSource = "Claude PostCompact.compact_summary";
  }
}

function compactRanges(events, activeBoundaryId) {
  const boundarySeq = events.find((entry) => entry.id === activeBoundaryId)?.seq ?? 0;
  const compacts = events.filter((entry) => entry.id.startsWith("C") && entry.seq > boundarySeq);
  const previous = compacts.at(-1) ?? null;
  const admitted = events.filter((entry) => entry.id.startsWith("U") && entry.seq > boundarySeq);
  const sincePrevious = admitted.filter((entry) => entry.seq > (previous?.seq ?? boundarySeq));
  const earlier = admitted.filter((entry) => entry.seq <= (previous?.seq ?? boundarySeq));
  const range = (items) => items.length === 0 ? "none" : `${items[0].id}..${items.at(-1).id}`;
  return { previousCompact: previous?.id ?? "none", sincePrevious: range(sincePrevious), earlier: range(earlier) };
}

function recoveryContext(location, recovery) {
  const command = `sed -n '${recovery.cardStartLine},${recovery.cardEndLine}p' -- ${singleQuote(location.path)}`;
  return [
    "[Compact Context Journal] Compact recovery is active.",
    `Journal: ${location.path}`,
    `Compact: ${recovery.compactId}`,
    "Read the current Recovery Card successfully before any mutation, dispatch, external effect, or Stop:",
    command,
    `Raw session ID (JSON): ${JSON.stringify(location.sessionId)}`,
    `Active boundary: ${recovery.activeBoundaryId ?? "none"}`,
    `Recovery Card: lines ${recovery.cardStartLine}-${recovery.cardEndLine}`,
    `Context source: ${recovery.contextSource}`,
    "Integrity: verified",
    `After the receipt, inspect the verified admitted index on demand: node ${singleQuote(QUERY)} index --journal ${singleQuote(location.path)} --session-id ${singleQuote(location.sessionId)}`,
    "The successful read creates a durable R receipt. Retrieve older details on demand from admitted U events only; later U wins. Never edit this journal.",
  ].join("\n").slice(0, 3500);
}

function finalizeCompact(location, state) {
  if (state.compromised) return contextOutput("SessionStart", "[Compact Context Journal] Journal integrity is compromised; recovery is unavailable. Do not rely on journal contents.");
  if (!existsSync(location.path)) {
    appendJournal(location, state, { type: "integrity", prefix: "I", title: "Journal initialized", raw: "Initialized at compact recovery boundary." });
  }
  if (!state.pendingCompact && state.recoveryRequired) return contextOutput("SessionStart", recoveryContext(location, state.recoveryRequired));
  const pending = state.pendingCompact ?? {
    trigger: "auto",
    compactSummary: null,
    contextSource: host() === "codex" ? "not exposed by host" : "not exposed by host",
  };
  const verified = verifyJournal(location.path, { expectedSessionId: location.sessionId });
  if (!verified.ok) throw new Error(`journal integrity failure: ${verified.reason}`);
  const compactId = nextId(location, "C");
  const ranges = compactRanges(verified.events, state.activeBoundaryId);
  const contextSource = host() === "codex" ? "not exposed by host" : pending.contextSource;
  const summary = host() === "claude" && pending.compactSummary !== null
    ? pending.compactSummary
    : "(summary not exposed by host)";
  const card = [
    "### Recovery Card",
    `- Compact: ${compactId}`,
    `- Active boundary: ${state.activeBoundaryId ?? "none"}`,
    `- Admitted user range since previous compact: ${ranges.sincePrevious}`,
    `- Earlier active user range: ${ranges.earlier}`,
    `- Previous compact: ${ranges.previousCompact}`,
    `- Context source: ${contextSource}`,
    "- Integrity: verified",
    "- Retrieval: admitted U only; later U wins",
    "",
    "### Host compact summary",
    summary,
  ].join("\n");
  const compact = appendJournal(location, state, {
    type: "compact",
    prefix: "C",
    title: `Compact checkpoint (${pending.trigger})`,
    raw: card,
    details: [`Trigger: ${pending.trigger}`, `Context source: ${contextSource}`],
  });
  if (compact.id !== compactId || compact.cardStartLine === null || compact.cardEndLine === null) {
    throw new Error("compact checkpoint/card mismatch");
  }
  state.latestCompactId = compact.id;
  state.pendingCompact = null;
  state.stopReminders = 0;
  state.recoveryRequired = {
    compactId: compact.id,
    cardStartLine: compact.cardStartLine,
    cardEndLine: compact.cardEndLine,
    activeBoundaryId: state.activeBoundaryId,
    contextSource,
  };
  return contextOutput("SessionStart", recoveryContext(location, state.recoveryRequired));
}

function sessionStart(event, location, state) {
  const source = event?.source ?? "startup";
  if (source === "clear" && !state.compromised) {
    const boundary = appendJournal(location, state, {
      type: "boundary",
      prefix: "B",
      title: "Active history boundary (/clear)",
      raw: "Default recovery excludes admitted requirements before this boundary.",
    });
    state.activeBoundaryId = boundary.id;
    state.pendingPromptId = null;
    state.pendingCompact = null;
    state.recoveryRequired = null;
    return null;
  }
  if (source === "compact") return finalizeCompact(location, state);
  return null;
}

function preTool(event, location, state) {
  admitPending(location, state, "PreToolUse");
  const protection = journalProtectionDecision(event, location);
  if (protection.deny) return preToolDeny(protection.reason);
  const recovery = recoveryGateDecision(event, location, state.recoveryRequired);
  if (recovery.deny) return preToolDeny(recovery.reason);
  if (recovery.candidate) state.receiptCandidates[recovery.candidate.toolUseId] = recovery.candidate;
  if (toolMayMutate(event)) state.mutationSentinels[extractToolUseId(event) ?? "__single"] = snapshot(location, state.journalTip);
  return null;
}

function postTool(event, location, state) {
  const toolUseId = extractToolUseId(event);
  const candidate = toolUseId ? state.receiptCandidates[toolUseId] : null;
  if (candidate && state.recoveryRequired?.compactId === candidate.compactId) {
    appendJournal(location, state, {
      type: "receipt",
      prefix: "R",
      title: "Recovery Card read receipt",
      raw: `Compact: ${candidate.compactId}\nTool use: ${candidate.toolUseId}\nCovered lines: ${candidate.start}-${candidate.end}\nRead kind: ${candidate.kind}`,
    });
    state.recoveryRequired = null;
    state.receiptCandidates = {};
    state.stopReminders = 0;
  }
  const sentinelKey = toolUseId ?? "__single";
  const sentinel = state.mutationSentinels[sentinelKey];
  if (sentinel) {
    const integrity = isVerifiedExtension(sentinel, location);
    if (!integrity.ok) {
      state.compromised = true;
      state.recoveryRequired = null;
      warn("journal changed during an observed mutation; session marked compromised");
    } else if (integrity.tip) state.journalTip = integrity.tip;
    delete state.mutationSentinels[sentinelKey];
  }
}

function stop(event, location, state) {
  admitPending(location, state, "Stop");
  if (!state.recoveryRequired) return null;
  if (event?.stop_hook_active === true || event?.stopHookActive === true || state.stopReminders >= 2) {
    if (!state.compromised) {
      appendJournal(location, state, {
        type: "integrity",
        prefix: "I",
        title: "Recovery remains unconfirmed",
        raw: `recovery_unconfirmed: ${state.recoveryRequired.compactId}; pending receipt preserved.`,
      });
    }
    return null;
  }
  state.stopReminders += 1;
  return stopDeny([
    "[Compact Context Journal] Recovery receipt is still missing.",
    recoveryContext(location, state.recoveryRequired),
  ].join("\n\n"));
}

function runLocked(mode, event, location) {
  return withSessionLock(location, () => {
    const state = loadSessionState(location);
    const fullVerify = mode === "session-start" && event?.source === "compact";
    const integrityWarning = assessIntegrity(location, state, fullVerify);
    let result = null;
    if (mode === "user-prompt") result = recordPrompt(event, location, state);
    else if (mode === "pre-compact") preCompact(event, location, state);
    else if (mode === "post-compact") postCompact(event, state);
    else if (mode === "session-start") result = sessionStart(event, location, state);
    else if (mode === "pre-tool") result = preTool(event, location, state);
    else if (mode === "post-tool") postTool(event, location, state);
    else if (mode === "stop") result = stop(event, location, state);
    saveSessionState(location, state);
    if (!result && integrityWarning && ["session-start", "user-prompt", "pre-tool"].includes(mode)) {
      result = contextOutput(event?.hook_event_name ?? "SessionStart", `[Compact Context Journal] ${integrityWarning}. Do not rely on journal contents.`);
    }
    return result;
  });
}

export async function main(mode = process.argv[2]) {
  const event = await readStdinJson();
  if (event.__parseError || isSubagentEvent(event)) return;
  if (!["user-prompt", "pre-compact", "post-compact", "session-start", "pre-tool", "post-tool", "stop"].includes(mode)) return;
  const sessionId = extractSessionId(event);
  if (!sessionId) {
    warn("session_id missing; journal hook skipped");
    return;
  }
  const location = journalLocation({ cwd: extractCwd(event), host: host(), sessionId });
  writeJson(runLocked(mode, event, location));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    warn(error instanceof Error ? error.message : String(error));
    if (process.argv[2] === "pre-tool") {
      writeJson(preToolDeny("[Compact Context Journal] Internal protection check failed closed; retry after inspecting the hook error."));
    }
  });
}
