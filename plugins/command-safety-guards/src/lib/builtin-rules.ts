/**
 * Built-in declarative command rules.
 *
 * Principles:
 * - one id / one narrow semantic; no overlapping double-hits
 * - match against the (already sanitized) command string
 * - only pure command-text checks; cwd/event/content → engines/
 */

import { createHash } from "node:crypto";
import { shellCommandInvocations, tokenizeShell, type ShellInvocation } from "./shell-parse.js";

export type RuleMode = "deny" | "report" | "allow";

export type CommandMatcher = RegExp | { test: (command: string) => boolean };

export type SafetyRule = {
  id: string;
  title?: string | undefined;
  mode: RuleMode;
  match: CommandMatcher;
  reason?: string | undefined;
  resolveReason?: ((command: string) => string) | undefined;
  recovery?: string | undefined;
  observedFacts?: string | undefined;
  harm?: string | undefined;
  unblockWhen?: string | undefined;
  formatMessage?: ((command: string) => string) | undefined;
  sensitive?: boolean | undefined;
};

const SQL_CLIENTS = new Set([
  "mysql",
  "mariadb",
  "mysqlsh",
  "mycli",
  "psql",
  "pgcli",
  "cockroach",
  "sqlite3",
  "litecli",
  "duckdb",
  "clickhouse",
  "clickhouse-client",
  "sqlcmd",
  "usql",
  "snowsql",
  "trino",
  "presto",
  "mongosh",
  "mongo",
]);

function programInvocations(command: string, programs: ReadonlySet<string>): ShellInvocation[] {
  return shellCommandInvocations(command).filter((invocation) =>
    programs.has(invocation.executable.toLowerCase()),
  );
}

function digest(command: string): string {
  return createHash("sha256").update(command).digest("hex").slice(0, 16);
}

function cleanedSql(command: string): string {
  return tokenizeShell(command)
    .join(" ")
    .replace(/--(?=\s|$)[^\n]*/gu, "")
    .replace(/\/\*[\s\S]*?\*\//gu, "");
}

// ── temporary paths (shared by sed / cat) ─────────────────────

/** Absolute temp file tokens only — relative paths never count as temp. */
function isTempPathOperand(token: string): boolean {
  const value = String(token ?? "");
  return /^(?:\/tmp\/|\/private\/tmp\/|\$\{?TMPDIR\}?\/)/u.test(value);
}

/**
 * File operands for `sed [options] script [file...]` after inplace flags.
 * Skips options and the script expression so `s/a/b/` is not treated as a path.
 */
function sedFileOperands(args: readonly string[]): string[] {
  const files: string[] = [];
  let sawExpression = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--") {
      files.push(...args.slice(index + 1));
      break;
    }
    if (
      argument === "-e" ||
      argument === "--expression" ||
      argument === "-f" ||
      argument === "--file"
    ) {
      sawExpression = true;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) continue;
    // First non-option is the script unless -e/-f already supplied one.
    if (!sawExpression) {
      sawExpression = true;
      continue;
    }
    files.push(argument);
  }
  return files;
}

function sedHasUnbackedInplace(args: readonly string[]): boolean {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--in-place") return true;
    if (argument.startsWith("--in-place=")) continue;
    const short = argument.match(/^-[A-Za-z]*i(.*)$/u);
    if (!short) continue;
    if (short[1]) continue;
    // macOS empty backup suffix: sed -i '' 's/a/b/' file
    if (args[index + 1] === "") continue;
    return true;
  }
  return false;
}

// ── sed -i (no backup) ───────────────────────────────────────

function sedInplaceReason(command: string): string | null {
  const invocations = programInvocations(command, new Set(["sed"]));
  for (const { args } of invocations) {
    if (!sedHasUnbackedInplace(args)) continue;
    const files = sedFileOperands(args);
    // Allow unbacked -i only when every edited operand is under a temp dir.
    // No file operands (stdin-only) stay deny — still unrecoverable rewrite UX.
    if (files.length > 0 && files.every((file) => isTempPathOperand(file))) {
      continue;
    }
    return "sed -i modifies files in place without a backup and cannot be rolled back";
  }
  return null;
}

// ── cat heredoc write ────────────────────────────────────────

const CAT_HEREDOC_WRITE_RE =
  /\bcat\s*(?:>|>>)\s*\S+[^|]*<<|cat\s*<<-?\s*['"]?\w+['"]?\s*(?:>|>>)\s*\S+/;

function isCatHeredocWrite(command: string): boolean {
  return CAT_HEREDOC_WRITE_RE.test(command);
}

function isCatPipeInput(command: string): boolean {
  return /<<-?\s*['"]?\w+['"]?\s*\|/.test(command);
}

function isCatTmpRedirect(command: string): boolean {
  return /(?:>|>>)\s*(?:\/tmp\/\S+|\/private\/tmp\/\S+|\$TMPDIR\/\S+)/.test(
    command,
  );
}

// ── redis ────────────────────────────────────────────────────

function redisOperation(command: string): string | null {
  const invocations = programInvocations(command, new Set(["redis-cli"]));
  for (const { args } of invocations) {
    const match = args.join(" ").match(
      /\b(?:KEYS|MONITOR|FLUSHALL|FLUSHDB|DEL|RANDOMKEY|SETBIT|BGSAVE|BGREWRITEAOF)\b/iu,
    );
    const operation = match?.[0];
    if (operation) return operation.toUpperCase();
  }
  return null;
}

// ── sql ──────────────────────────────────────────────────────

function sqlDestructiveReason(command: string): string | null {
  const blocks: Array<readonly [RegExp, string]> = [
    [/\bDROP\s+(?:DATABASE|TABLE|SCHEMA|INDEX|VIEW)\b/iu, "DROP permanently deletes a database object"],
    [/\bTRUNCATE\s+(?:TABLE\s+)?\w/iu, "TRUNCATE removes all table data"],
    [/\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/iu, "DROP COLUMN permanently deletes column data"],
    [/\bDELETE\s+FROM\b(?![^;]*\bWHERE\b)/iu, "DELETE is missing WHERE"],
    [/\bUPDATE\s+[^;]+\s+SET\b(?![^;]*\bWHERE\b)/iu, "UPDATE is missing WHERE"],
  ];
  for (const { args } of programInvocations(command, SQL_CLIENTS)) {
    const cleaned = cleanedSql(args.join(" "));
    for (const [pattern, reason] of blocks) {
      if (pattern.test(cleaned)) return reason;
    }
  }
  return null;
}

function sqlPrivilegeHit(command: string): boolean {
  return programInvocations(command, SQL_CLIENTS).some(({ args }) =>
    /\b(?:GRANT|REVOKE)\b/iu.test(cleanedSql(args.join(" "))),
  );
}

// ── active security test ─────────────────────────────────────

function activeTestReason(command: string): string | null {
  for (const { executable, args } of shellCommandInvocations(command)) {
    const program = executable.toLowerCase();
    const subject = args.join(" ");
    if (["masscan", "zmap"].includes(program)) {
      return "the high-speed internet-wide scanner has no auditable boundary";
    }
    if (["hping", "hping3"].includes(program) && /--flood\b/u.test(subject)) {
      return "flood mode is prohibited";
    }
    if (program === "nmap") {
      const cidr = subject.match(/\S+\/(\d{1,2})\b/u);
      const cidrBits = cidr?.[1];
      if (cidrBits !== undefined && Number(cidrBits) <= 20) {
        return `target range /${cidrBits} exceeds the /21 limit`;
      }
      if (
        /(?:^|\s)-p-(?:\s|$)/u.test(subject) &&
        !/--max-rate(?:=|\s+)\d+/u.test(subject)
      ) {
        return "the all-port scan is missing --max-rate";
      }
    }
    if (
      ["ffuf", "gobuster", "feroxbuster"].includes(program) &&
      !/(?:^|\s)(?:-rate|--rate|-t|--threads)(?:=|\s+)\d+/u.test(subject)
    ) {
      return "content enumeration is missing a rate or thread limit";
    }
  }
  return null;
}

// ── secret leak ──────────────────────────────────────────────

function secretLeakHit(command: string): boolean {
  return shellCommandInvocations(command).some(secretLeakInvocationHit);
}

function secretLeakInvocationHit({ executable, args }: ShellInvocation): boolean {
  const program = executable.toLowerCase();
  const subject = args.join(" ");
  if (["cat", "head", "tail", "less", "more", "bat"].includes(program)) {
    return /(?:\.pem|\.key|\.p12|\.pfx|id_rsa|id_ed25519|\.jks|\.keystore|\.env\b|credentials\.json|\.aws\/credentials|\.netrc|\.git-credentials)/iu.test(
      subject,
    );
  }
  if (["curl", "wget", "http"].includes(program)) {
    return /(?:--data(?:-raw|-binary)?|--form|-d|-F)\s[^;|&]*(?:\$(?:\{)?(?:PRIVATE_KEY|SECRET_KEY|API_SECRET|AWS_SECRET_ACCESS_KEY|DATABASE_PASSWORD|DB_PASSWORD)|\$\(\s*cat\s+[^)]*(?:\.pem|\.key|id_rsa|id_ed25519))/iu.test(
      subject,
    );
  }
  if (program === "apksigner") {
    return /(?:--ks-pass|--key-pass)(?:=|\s+)pass:/iu.test(subject);
  }
  if (program === "base64") {
    return /(?:\.pem|\.key|id_rsa|id_ed25519|PRIVATE)/iu.test(subject);
  }
  if (program === "echo") {
    return /\$(?:\{)?(?:PRIVATE_KEY|SECRET_KEY|TOKEN|API_KEY)/iu.test(subject);
  }
  return false;
}

export const BUILTIN_RULES: SafetyRule[] = [
  {
    id: "sed-inplace",
    title: "sed -i Guard",
    mode: "deny",
    match: { test: (command) => Boolean(sedInplaceReason(command)) },
    resolveReason: (command) =>
      sedInplaceReason(command) ?? "sed in-place editing has no recoverable backup",
    recovery:
      "Use Edit/apply_patch for replacements; if sed is required, create an explicit recoverable backup first. Unbacked sed -i under /tmp, /private/tmp, or $TMPDIR/ is allowed.",
    observedFacts:
      "The Bash input contains sed --in-place or bare sed -i without a backup suffix on a non-temporary path.",
    harm: "In-place rewrites are difficult to review or recover and bypass file-aware editing hooks.",
    unblockWhen:
      "Target only temporary paths (/tmp/…, $TMPDIR/…), use a backup suffix, or use a file-aware editing tool.",
  },
  {
    id: "cat-heredoc-repo-write",
    title: "Cat Write Guard",
    mode: "deny",
    match: {
      test: (command) =>
        isCatHeredocWrite(command) &&
        !isCatPipeInput(command) &&
        !isCatTmpRedirect(command),
    },
    reason: "Writing a file through a Bash cat heredoc bypasses all PostToolUse hooks",
    recovery: "Use Write for new files and Edit/apply_patch for existing files.",
    observedFacts: "The Bash input contains a cat heredoc redirected to a non-temporary file.",
    harm: "The write bypasses file-aware target checks, change hooks, and post-write verification.",
    unblockWhen:
      "The heredoc is used only as pipeline input, writes only to an allowed temporary directory, or is replaced with a file-aware editing tool.",
    formatMessage: (command) =>
      [
        "[Cat Write Guard] cat heredoc file write blocked",
        "",
        "Writing a file through a Bash cat heredoc bypasses all PostToolUse hooks:",
        "  • syntax checkers do not run",
        "  • file-line-budget-guard does not check line budgets",
        "  • encoding guards do not check encoding",
        "  • path guards do not check the write target",
        "",
        `Command: ${command}`,
        "",
        "Alternative: use Write for new files and Edit/apply_patch for existing files.",
        "",
        "blockingContract:",
        "  observedFacts: The Bash input contains a cat heredoc redirected to a non-temporary file.",
        "  harm: The write bypasses file-aware target checks, change hooks, and post-write verification.",
        "  unblockWhen: The heredoc is used only as pipeline input, writes only to an allowed temporary directory, or is replaced with a file-aware editing tool.",
        "  recovery: Apply content with Write, Edit, or apply_patch so path guards and verification hooks can observe the change.",
      ].join("\n"),
  },
  {
    id: "cat-heredoc-tmp-write",
    title: "Cat Write Guard",
    mode: "report",
    match: {
      test: (command) =>
        isCatHeredocWrite(command) &&
        !isCatPipeInput(command) &&
        isCatTmpRedirect(command),
    },
    reason: "Writing a temporary file with a Bash cat heredoc does not trigger file-aware PostToolUse checks",
    recovery: "Temporary scripts may proceed, but prefer the Write tool.",
    formatMessage: (command) =>
      [
        "[Cat Write Guard] cat heredoc temporary-file write detected",
        "",
        "Writing a file with a Bash cat heredoc does not trigger file-aware PostToolUse checks.",
        "Temporary scripts may proceed, but prefer the Write tool.",
        `Command: ${command}`,
      ].join("\n"),
  },
  {
    id: "redis-cli-risk",
    title: "Redis CLI Risk",
    mode: "deny",
    match: {
      test: (command) => {
        const op = redisOperation(command);
        return Boolean(
          op && ["KEYS", "MONITOR", "FLUSHALL", "FLUSHDB"].includes(op),
        );
      },
    },
    resolveReason: (command) => {
      const op = redisOperation(command);
      return `${op} scans, blocks, or clears Redis data`;
    },
    recovery: "Confirm the target instance, data scope, and recoverable alternative first",
    observedFacts: "The command matches a high-risk Redis CLI operation.",
    harm: "It may cause data loss or block the instance.",
    unblockWhen: "Use an auditable narrow-scope operation or declare a precise allow rule in configuration.",
  },
  {
    id: "redis-cli-pressure",
    title: "Redis CLI Risk",
    mode: "report",
    match: {
      test: (command) => {
        const op = redisOperation(command);
        return Boolean(
          op &&
            ["DEL", "RANDOMKEY", "SETBIT", "BGSAVE", "BGREWRITEAOF"].includes(
              op,
            ),
        );
      },
    },
    resolveReason: (command) => {
      const op = redisOperation(command);
      return `${op} may block the main thread or increase instance resource pressure`;
    },
    recovery: "Confirm the target instance, data scope, and recoverable alternative first",
  },
  {
    id: "sql-destructive",
    title: "Dangerous SQL",
    mode: "deny",
    match: { test: (command) => Boolean(sqlDestructiveReason(command)) },
    resolveReason: (command) =>
      sqlDestructiveReason(command) ?? "dangerous SQL",
    recovery: "Add an explicit WHERE clause or complete backup, authorization, and recovery verification first",
    observedFacts: "The SQL client command matches a destructive change or a mutation without WHERE.",
    harm: "It may permanently delete database objects or remove data in bulk.",
    unblockWhen: "Add WHERE, backup, and authorization before executing.",
  },
  {
    id: "sql-privilege",
    title: "SQL Notice",
    mode: "report",
    match: { test: (command) => sqlPrivilegeHit(command) },
    reason: "database privileges will change",
    recovery: "Confirm the target user, least-privilege scope, and rollback statement",
  },
  {
    id: "active-test-unbounded",
    title: "Security Active Test Scope Guard",
    mode: "deny",
    match: { test: (command) => Boolean(activeTestReason(command)) },
    resolveReason: (command) =>
      activeTestReason(command) ?? "active security testing lacks an auditable boundary",
    recovery: "Use an explicit target and bounded rate",
    observedFacts: "The active security testing command lacks an auditable boundary.",
    harm: "It may scan outside the authorized scope or overload resources.",
    unblockWhen: "Declare the target scope and rate or thread limit.",
  },
  {
    id: "secret-leak",
    title: "Secret Leak Notice",
    mode: "report",
    match: { test: (command) => secretLeakHit(command) },
    resolveReason: (command) =>
      `The command may read, print, or transmit sensitive credentials (digest ${digest(command)})`,
    recovery:
      "Read only required fields, never echo or exfiltrate them, and use environment references and secure credential channels",
    sensitive: true,
  },
  {
    id: "lark-yes",
    title: "Lark CLI Confirmation Audit",
    mode: "report",
    match: {
      test: (command) =>
        programInvocations(command, new Set(["lark-cli"])).some(({ args }) =>
          args.includes("--yes"),
        ),
    },
    reason: "non-interactive --yes confirmation detected",
    recovery: "Confirm the target resource, write/delete scope, recoverable copy, and read-back verification",
    sensitive: true,
  },
];
