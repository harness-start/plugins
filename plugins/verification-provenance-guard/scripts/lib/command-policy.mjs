import { createHash } from "node:crypto";

const CI_COMMAND = /\b(?:glab\s+(?:api|ci|mr\s+view)|gh\s+(?:run\s+view|pr\s+checks|api))\b/iu;
const TEST_COMMAND = /\b(?:node\s+--test|pytest|python(?:3)?\s+-m\s+pytest|phpunit|pest|jest|vitest|go\s+test|cargo\s+test|mvn\s+test|gradlew?\s+test|rspec|ctest|make\s+test|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+(?:run\s+)?test|bun\s+test)\b/iu;
const VERIFY_COMMAND = /\b(?:eslint|ruff\s+check|phpstan|tsc|shellcheck|actionlint|kubeconform|composer\s+validate|terraform\s+validate|tofu\s+validate|npm\s+(?:run\s+)?(?:lint|typecheck|check|build)|pnpm\s+(?:run\s+)?(?:lint|typecheck|check|build)|yarn\s+(?:run\s+)?(?:lint|typecheck|check|build)|cargo\s+(?:check|clippy)|go\s+vet)\b/iu;
const EXTERNAL_COMMAND = /^\s*(?:git\s+(?:commit|push|tag)|glab\s+(?:mr\s+(?:create|merge)|release\s+create)|gh\s+(?:pr\s+(?:create|merge)|release\s+create))\b/iu;
const READ_ONLY = /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*(?:pwd|ls|cat|head|tail|wc|stat|sha(?:1|256|512)sum|shasum|find|grep|rg|which|git\s+(?:status|diff|log|show|rev-parse|branch|ls-files)|jq\b)/iu;
const MASK_FAILURE = /(?:\|\|\s*(?:true|:)(?:\s|$)|;\s*true(?:\s|$)|\bset\s+\+e\b)/iu;
const MUTATING_VERIFY_FLAG = /(?:^|\s)(?:--fix(?:\s|=|$)|--write(?:\s|=|$)|-u(?:\s|$)|--updateSnapshot\b)/u;
const PIPE = /(^|[^|])\|([^|]|$)/u;
const OUTPUT_WRITE = /(?:^|[\s;&|])(?:\d*>{1,2}(?!&)|tee(?:\s|$))/iu;
const TRAILING_SHELL_COMMAND = /(?:&&|\|\||;|\n)\s*\S/u;

function matches(pattern, value) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function verificationTail(value) {
  const matches = [TEST_COMMAND, VERIFY_COMMAND].flatMap((pattern) => {
    pattern.lastIndex = 0;
    const match = pattern.exec(value);
    return match ? [{ index: match.index, end: match.index + match[0].length }] : [];
  });
  if (matches.length === 0) return "";
  const first = matches.sort((left, right) => left.index - right.index)[0];
  return value.slice(first.end);
}

export function normalizeCommand(command) {
  return String(command ?? "").trim().replace(/\s+/gu, " ").replace(/;+$/u, "").trim();
}

export function commandHash(command) {
  return createHash("sha256").update(normalizeCommand(command)).digest("hex");
}

export function classifyCommand(command, config = {}) {
  const value = normalizeCommand(command);
  if (!value) return "read";
  const additionalTests = config.testPatterns ?? [];
  const additionalVerification = config.verificationPatterns ?? [];
  if (CI_COMMAND.test(value)) return "ci";
  if (TEST_COMMAND.test(value) || additionalTests.some((pattern) => matches(pattern, value))) return "test";
  if (VERIFY_COMMAND.test(value) || additionalVerification.some((pattern) => matches(pattern, value))) return "verification";
  if (EXTERNAL_COMMAND.test(value)) return "external";
  if (READ_ONLY.test(value)) return "read";
  return "mutation";
}

export function commandReliability(command) {
  const value = String(command ?? "");
  const reasons = [];
  if (MASK_FAILURE.test(value)) reasons.push("failure masking");
  if (MUTATING_VERIFY_FLAG.test(value)) reasons.push("mutating verification flag");
  if (PIPE.test(value) && !/(?:set\s+-o\s+pipefail|set\s+-euo\s+pipefail)/u.test(value)) reasons.push("pipeline without pipefail");
  if (OUTPUT_WRITE.test(value)) reasons.push("verification output write");
  if (TRAILING_SHELL_COMMAND.test(verificationTail(value))) reasons.push("trailing compound command");
  const workspaceMutation = reasons.some((reason) => [
    "mutating verification flag",
    "verification output write",
    "trailing compound command",
  ].includes(reason));
  return { reliable: reasons.length === 0, reasons, workspaceMutation };
}

export function inferOutcome(response, forceFailure = false) {
  if (forceFailure) return "failure";
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (typeof code === "number") return code === 0 ? "success" : "failure";
    if (response.success === false || response.is_error === true || response.isError === true) return "failure";
  }
  const text = typeof response === "string" ? response : JSON.stringify(response ?? "");
  const codes = [...text.matchAll(/(?:Process exited with code|Exit code:?|exited with code)\s+(-?\d+)/giu)];
  if (codes.length > 0) return Number(codes.at(-1)[1]) === 0 ? "success" : "failure";
  return "success";
}

export function responseText(response) {
  if (typeof response === "string") return response;
  try { return JSON.stringify(response ?? ""); } catch { return String(response ?? ""); }
}

export function parseVerificationSummary(response) {
  const text = responseText(response).replace(/\u001b\[[0-9;]*m/gu, "");
  const result = {};
  const tapPass = text.match(/(?:^|\n)#\s*pass\s+(\d+)/iu);
  const tapFail = text.match(/(?:^|\n)#\s*fail\s+(\d+)/iu);
  const tapSkip = text.match(/(?:^|\n)#\s*skipped?\s+(\d+)/iu);
  if (tapPass) result.passed = Number(tapPass[1]);
  if (tapFail) result.failed = Number(tapFail[1]);
  if (tapSkip) result.skipped = Number(tapSkip[1]);
  if (Object.keys(result).length > 0) return result;
  const pytest = text.match(/(?:(\d+)\s+failed,?\s*)?(\d+)\s+passed(?:,\s*(\d+)\s+skipped)?/iu);
  if (pytest) {
    if (pytest[1]) result.failed = Number(pytest[1]);
    result.passed = Number(pytest[2]);
    if (pytest[3]) result.skipped = Number(pytest[3]);
    return result;
  }
  const phpunit = text.match(/OK\s*\((\d+)\s+tests?/iu);
  if (phpunit) return { passed: Number(phpunit[1]), failed: 0 };
  return null;
}

function findJson(text) {
  const trimmed = String(text ?? "").trim();
  try { return JSON.parse(trimmed); } catch {}
  for (const [open, close] of [["{", "}"], ["[", "]"]]) {
    const start = trimmed.indexOf(open);
    const end = trimmed.lastIndexOf(close);
    if (start >= 0 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)); } catch {}
    }
  }
  return null;
}

export function parseCiResult(response, providerHint = null) {
  const value = response && typeof response === "object" && !Array.isArray(response)
    ? response
    : findJson(responseText(response));
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") return null;
  const nested = candidate.head_pipeline ?? candidate.pipeline ?? candidate;
  const provider = providerHint ?? (nested.conclusion !== undefined || nested.headSha !== undefined ? "github" : "gitlab");
  const status = String(nested.status ?? nested.conclusion ?? "").toLowerCase();
  const success = status === "success" || (String(nested.status).toLowerCase() === "completed" && String(nested.conclusion).toLowerCase() === "success");
  const pipelineId = nested.id ?? nested.iid ?? nested.databaseId ?? nested.runId;
  const sha = nested.sha ?? nested.head_sha ?? nested.headSha;
  const url = nested.web_url ?? nested.url ?? nested.html_url;
  if (!success || pipelineId == null || !/^[a-f0-9]{40}$/u.test(String(sha ?? "")) || typeof url !== "string" || !/^https?:\/\//u.test(url)) return null;
  return { provider, pipelineId: String(pipelineId), status: "success", sha: String(sha), url };
}
