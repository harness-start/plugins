import { commandInvocation, tokenizeShell } from "../lib/shell-parse.js";
import { sanitizeCommand } from "../lib/sanitize-command.js";

export type VerificationIntegrityFinding = {
  operator: "pipeline" | "fallback" | "sequence" | "background";
  verifier: string;
};

type Segment = {
  tokens: string[];
  next: string | null;
};

const SEPARATORS = new Set(["&&", "||", ";", "|", "&"]);
const DIRECT_VERIFIERS = new Set([
  "ava", "bats", "behat", "cypress", "go-test", "jest", "karma", "mocha",
  "nose", "nosetests", "nox", "phpunit", "playwright", "pytest", "py.test",
  "rspec", "tox", "vitest",
]);

function shellSegments(command: string): Segment[] {
  const normalized = sanitizeCommand(command)
    .replace(/\b\d*>\s*&\s*\d+\b/gu, " __FD_REDIRECT__ ")
    .replace(/(?:^|\s)&>\s*\S+/gu, " __FD_REDIRECT__ ");
  const tokens = tokenizeShell(normalized);
  const segments: Segment[] = [];
  let current: string[] = [];
  for (const token of tokens) {
    if (!SEPARATORS.has(token)) {
      current.push(token);
      continue;
    }
    segments.push({ tokens: current, next: token });
    current = [];
  }
  segments.push({ tokens: current, next: null });
  return segments;
}

function isVerificationInvocation(executable: string, args: readonly string[]): boolean {
  const program = executable.toLowerCase();
  if (DIRECT_VERIFIERS.has(program)) return true;
  if (program === "python" || /^python\d+(?:\.\d+)?$/u.test(program)) {
    if (args.some((arg) => /(?:^|\/)runtests\.py$/iu.test(arg))) return true;
    const moduleIndex = args.findIndex((arg) => arg === "-m");
    return moduleIndex >= 0 && /^(?:pytest|unittest|nose|tox)$/iu.test(args[moduleIndex + 1] ?? "");
  }
  if (program === "node") return args.includes("--test");
  if (["npm", "pnpm", "yarn", "bun"].includes(program)) {
    const positional = args.filter((arg) => !arg.startsWith("-"));
    return positional[0] === "test" || (positional[0] === "run" && /^test(?::|$)/u.test(positional[1] ?? ""));
  }
  if (program === "go") return args[0] === "test";
  if (program === "cargo" || program === "dotnet" || program === "swift" || program === "mix") {
    return args[0] === "test";
  }
  if (["gradle", "gradlew", "mvn", "mvnw", "make"].includes(program)) {
    return args.some((arg) => /^(?:check|test)(?::|$)/iu.test(arg));
  }
  return false;
}

function nestedShellFinding(tokens: string[]): VerificationIntegrityFinding | null {
  const invocation = commandInvocation(tokens);
  if (!invocation || !["bash", "sh", "zsh", "dash", "ksh"].includes(invocation.executable.toLowerCase())) return null;
  const commandIndex = invocation.args.findIndex((arg) => arg === "-c" || arg === "-lc");
  if (commandIndex < 0 || !invocation.args[commandIndex + 1]) return null;
  const pipefail = invocation.args.some((arg, index) => arg === "pipefail" && invocation.args[index - 1] === "-o");
  const errexit = invocation.args.includes("-e") || invocation.args.some((arg, index) => arg === "errexit" && invocation.args[index - 1] === "-o");
  return analyze(invocation.args[commandIndex + 1] ?? "", { pipefail, errexit });
}

function analyze(
  command: string,
  inherited: { pipefail?: boolean; errexit?: boolean } = {},
): VerificationIntegrityFinding | null {
  const segments = shellSegments(command);
  let pipefail = Boolean(inherited.pipefail);
  let errexit = Boolean(inherited.errexit);

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    const joined = segment.tokens.join(" ");
    if (/^set\s+(?:-[^\s]*e[^\s]*|-o\s+errexit)\b/u.test(joined)) errexit = true;
    if (/^set\s+-o\s+pipefail\b/u.test(joined)) pipefail = true;

    const nested = nestedShellFinding(segment.tokens);
    if (nested) return nested;

    const invocation = commandInvocation(segment.tokens);
    if (!invocation || !isVerificationInvocation(invocation.executable, invocation.args)) continue;
    const verifier = invocation.executable;
    let end = index;
    while (segments[end]?.next === "|") end += 1;
    const piped = end > index;
    if (piped && !pipefail) return { operator: "pipeline", verifier };
    const outgoing = segments[end]?.next;
    if (outgoing === "||") return { operator: "fallback", verifier };
    if (outgoing === "&") return { operator: "background", verifier };
    if (outgoing === ";" && !errexit) return { operator: "sequence", verifier };
    if (outgoing === "&&") {
      let cursor = end;
      while (segments[cursor]?.next === "&&") cursor += 1;
      if (segments[cursor]?.next === "||") return { operator: "fallback", verifier };
    }
  }
  return null;
}

export function verificationIntegrityFinding(command: string): VerificationIntegrityFinding | null {
  if (typeof command !== "string" || !command.trim()) return null;
  return analyze(command);
}

export function verificationIntegrityDenyMessage(
  finding: VerificationIntegrityFinding,
  command: string,
): string {
  return [
    "[Verification Integrity Guard] Blocked",
    "",
    `Reason: the ${finding.verifier} verification is followed by a shell ${finding.operator} that can replace or hide its exit status.`,
    "Recovery/alternative: run the verification command directly. If output must be piped, enable pipefail in the same shell (for example `set -o pipefail; <test> | tee /tmp/test.log`). Chain later inspection with `&&`, or preserve and re-exit the original status explicitly.",
    `Command: ${command}`,
    "",
    "blockingContract:",
    "  observedFacts: a test or verification command is composed so the shell can report a later command's status instead of the verifier's status.",
    "  harm: a failing test can be recorded as successful evidence and support a false completion claim.",
    "  unblockWhen: the verifier's native nonzero status is the status observed by the host, including through any output pipeline.",
    "  recovery: rerun directly, use `set -o pipefail` for a pipeline, use `&&` for success-only follow-up, or explicitly exit with the captured verifier status.",
  ].join("\n");
}
