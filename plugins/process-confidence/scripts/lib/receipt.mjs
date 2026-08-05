/**
 * Receipt validation and issuance helpers.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { receiptsDir } from "./paths.mjs";

const SEVERITY_RANK = { fail: 0, warn: 1, pass: 2 };

export function severityMeets(outcome, minSeverity) {
  const got = SEVERITY_RANK[outcome] ?? -1;
  const need = SEVERITY_RANK[minSeverity] ?? SEVERITY_RANK.pass;
  return got >= need;
}

export function isValidReceipt(receipt, run, minSeverity = "pass") {
  if (!receipt || !run) return false;
  if (receipt.runId !== run.runId) return false;
  if (receipt.sessionId && receipt.sessionId !== run.sessionId) return false;
  if (receipt.kind !== "verify") return false;
  if (typeof receipt.exitCode !== "number") return false;
  if (receipt.exitCode !== 0 && receipt.outcome === "pass") {
    // inconsistent — still reject pass with non-zero
    return false;
  }
  if (!["pcf-hook", "pcf-tool"].includes(receipt.issuer)) return false;
  if (!severityMeets(receipt.outcome, minSeverity)) return false;
  return true;
}

export function buildReceipt({
  runId,
  sessionId,
  command,
  exitCode,
  summary = "",
  issuer = "pcf-hook",
  kind = "verify",
}) {
  const at = new Date().toISOString();
  const stamp = at.replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6);
  const outcome = exitCode === 0 ? "pass" : "fail";
  return {
    id: `receipt-${stamp}-${rand}`,
    runId,
    sessionId,
    kind,
    command: String(command || "").slice(0, 2000),
    exitCode,
    outcome,
    summary: String(summary || "").slice(0, 2000),
    at,
    issuer,
  };
}

export function writeReceipt(workspaceRoot, receipt) {
  const dir = receiptsDir(workspaceRoot, receipt.runId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${receipt.id}.json`);
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return path;
}

/** Default verify command heuristics when config has no hints. */
const DEFAULT_VERIFY_PATTERNS = [
  /\bnpm\s+(test|run\s+test)\b/i,
  /\bpnpm\s+(test|run\s+test)\b/i,
  /\byarn\s+(test|run\s+test)\b/i,
  /\bbun\s+test\b/i,
  /\bpytest\b/i,
  /\bpython\s+-m\s+pytest\b/i,
  /\bgo\s+test\b/i,
  /\bcargo\s+test\b/i,
  /\bmvn\s+test\b/i,
  /\bgradlew?\s+test\b/i,
  /\bjest\b/i,
  /\bvitest\b/i,
  /\bphpunit\b/i,
  /\brspec\b/i,
  /\bmake\s+test\b/i,
  /\bctest\b/i,
  /\bnpm\s+run\s+lint\b/i,
  /\beslint\b/i,
  /\bruff\s+check\b/i,
  /\btsc\b/i,
  /\bnode\s+--test\b/i,
];

/**
 * Decide whether a shell command counts as a verify attempt.
 */
export function isVerifyCommand(command, config = {}) {
  const cmd = String(command || "").trim();
  if (!cmd) return false;

  const exclude = config.verifyCommandExclude || [];
  for (const ex of exclude) {
    if (ex && cmd.includes(ex)) return false;
  }

  const hints = config.verifyCommandHints || [];
  if (hints.length > 0) {
    return hints.some((h) => h && cmd.includes(h));
  }

  return DEFAULT_VERIFY_PATTERNS.some((re) => re.test(cmd));
}

export function extractShellCommand(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== "object") return null;
  const name = String(toolName || "");
  if (
    /^(Bash|bash|Shell|shell|Execute|command)$/i.test(name) ||
    name === "Bash" ||
    name === "Shell"
  ) {
    return (
      toolInput.command ??
      toolInput.cmd ??
      toolInput.script ??
      null
    );
  }
  // Codex may use different tool names
  if (toolInput.command && typeof toolInput.command === "string") {
    return toolInput.command;
  }
  return null;
}

export function extractExitCode(event) {
  const r =
    event?.tool_response ??
    event?.toolResponse ??
    event?.response ??
    event?.tool_result ??
    null;
  if (r == null) return null;
  if (typeof r === "object") {
    if (typeof r.exit_code === "number") return r.exit_code;
    if (typeof r.exitCode === "number") return r.exitCode;
    if (typeof r.status === "number") return r.status;
    if (r.interrupted) return null;
  }
  if (typeof r === "string") {
    // Heuristic: look for Exit code: N
    const m = r.match(/exit code[:\s]+(-?\d+)/i);
    if (m) return Number(m[1]);
    // Claude often embeds "Exit code 0" or failure text
    if (/\bexit code 0\b/i.test(r) || /\bexited with code 0\b/i.test(r)) {
      return 0;
    }
    if (/\bexit code ([1-9]\d*)\b/i.test(r)) {
      return Number(RegExp.$1);
    }
  }
  return null;
}
