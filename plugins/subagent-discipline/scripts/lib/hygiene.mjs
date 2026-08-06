import { detectBriefEcho } from "./echo.mjs";

export const DEFAULT_HYGIENE = {
  mode: "soft", // soft | block | off
  maxFenceLines: 80,
  minReturnChars: 40,
  minCitations: 1,
  echoThreshold: 0.72,
  maxAttempts: 2,
  ledgerTtlHours: 24,
  storeBriefExcerpt: false,
  injectPathHints: true,
};

const CITE_RE = /([\w@./+-]+\.[A-Za-z0-9]+):(\d{1,6})\b/gu;
const GAP_RE =
  /\bgap\b|no findings|nothing (?:new|found)|未找到|无匹配|no match/iu;
const VERIFY_RE =
  /\b(?:exit(?:\s+code)?\s*[:=]?\s*\d+|passed\s+\d+|failed\s+\d+|\bpytest\b|\bnpm\s+test\b|\bgo\s+test\b|\bcargo\s+test\b|\bvitest\b|\bjest\b).{0,40}\b(?:pass|fail|ok|error)?/iu;

/**
 * @param {string} text
 */
export function extractFencedBlocks(text) {
  if (typeof text !== "string" || !text) return [];
  const blocks = [];
  const re = /```[^\n]*\n([\s\S]*?)(?:```|$)/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = m[1] ?? "";
    const lines = body === "" ? 0 : body.split(/\r?\n/u).length;
    blocks.push({ body, lines });
  }
  return blocks;
}

/**
 * @param {string} text
 */
export function extractCitations(text) {
  if (typeof text !== "string" || !text) return [];
  const out = [];
  for (const m of text.matchAll(CITE_RE)) {
    out.push({ path: m[1], line: Number(m[2]), raw: m[0] });
  }
  return out;
}

/**
 * @param {object} args
 * @param {string} args.message
 * @param {string} [args.parentBrief]
 * @param {string} [args.taskClass]
 * @param {"true"|"false"|"unknown"|boolean} [args.diffStatus]
 * @param {Partial<typeof DEFAULT_HYGIENE>} [args.cfg]
 */
export function analyzeReturn({
  message,
  parentBrief = "",
  taskClass = "general",
  diffStatus = "unknown",
  cfg = {},
}) {
  const conf = { ...DEFAULT_HYGIENE, ...cfg };
  const text = typeof message === "string" ? message : "";
  const trimmed = text.trim();
  const fences = extractFencedBlocks(text);
  const citations = extractCitations(text);
  const maxFence = fences.reduce((n, b) => Math.max(n, b.lines), 0);
  const hasSummaryOutsideFence =
    text.replace(/```[\s\S]*?(?:```|$)/gu, "").trim().length >= 20;

  const C_empty =
    trimmed.length < conf.minReturnChars && fences.length === 0;
  const C_dump = maxFence > conf.maxFenceLines && !hasSummaryOutsideFence;
  const echoInfo = detectBriefEcho(text, parentBrief, conf.echoThreshold);
  const C_echo = Boolean(parentBrief) && echoInfo.echo;

  const D_cite = citations.length >= conf.minCitations;
  const E_diff =
    diffStatus === true ||
    diffStatus === "true" ||
    (typeof diffStatus === "string" && diffStatus === "true");
  const E_diffFeature =
    diffStatus === true || diffStatus === "true"
      ? true
      : diffStatus === false || diffStatus === "false"
        ? false
        : "unknown";
  const F_verify = VERIFY_RE.test(text);
  const G_gap = GAP_RE.test(text);

  const reasons = [];
  if (C_empty) reasons.push("empty-return");
  if (C_dump) reasons.push("whole-file-dump");
  if (C_echo) reasons.push("brief-echo");

  const hardFail = reasons.length > 0;

  const gapOkClasses = new Set(["explore", "general", "plan"]);
  const qualityPass =
    D_cite ||
    E_diff ||
    F_verify ||
    (G_gap && !C_empty && gapOkClasses.has(taskClass));

  return {
    hardFail,
    qualityPass,
    features: {
      C_empty,
      C_dump,
      C_echo,
      D_cite,
      E_diff: E_diffFeature,
      F_verify,
      G_gap,
    },
    diagnostics: {
      citationCount: citations.length,
      maxFenceLines: maxFence,
      echoRatio: echoInfo.echoRatio,
      msgLen: trimmed.length,
      taskClass,
    },
    reasons,
  };
}

export function formatBlockReason(analysis) {
  const reasons =
    analysis?.reasons?.length > 0 ? analysis.reasons.join("|") : "hard-fail";
  return [
    `[Subagent Hygiene] Return rejected: ${reasons}.`,
    "Fix: avoid empty replies; do not paste whole files; do not restate the parent brief.",
    "Add a short conclusion with path:line citations and/or describe files you changed or checks you ran.",
  ].join("\n");
}

/**
 * Whether Stop should emit decision:block.
 */
export function shouldBlock(mode, analysis, { stopHookActive, attempt, maxAttempts }) {
  if (mode !== "block") return false;
  if (stopHookActive) return false;
  if (!analysis?.hardFail) return false;
  const max = Number.isFinite(maxAttempts) ? maxAttempts : DEFAULT_HYGIENE.maxAttempts;
  const n = Number.isFinite(attempt) ? attempt : 0;
  if (n >= max) return false;
  return true;
}
