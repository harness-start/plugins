/**
 * Built-in declarative command rules.
 *
 * Principles:
 * - one id / one narrow semantic; no overlapping double-hits
 * - match against the (already sanitized) command string
 * - only pure command-text checks; cwd/event/content → engines/
 */

import { createHash } from "node:crypto";
import { splitShellLogicalLines, tokenizeShell } from "./shell-parse.mjs";

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

function hasProgram(command, programs) {
  return splitShellLogicalLines(command).some((line) =>
    tokenizeShell(line).some((token) =>
      programs.has(token.split("/").at(-1)?.toLowerCase()),
    ),
  );
}

function digest(command) {
  return createHash("sha256").update(command).digest("hex").slice(0, 16);
}

function cleanedSql(command) {
  return tokenizeShell(command)
    .join(" ")
    .replace(/--(?=\s|$)[^\n]*/gu, "")
    .replace(/\/\*[\s\S]*?\*\//gu, "");
}

// ── sed -i (no backup) ───────────────────────────────────────

function sedInplaceReason(command) {
  const short = /\bsed\s+(?:-[A-Za-z]*i)(?=[^A-Za-z]|$)/g;
  let match;
  while ((match = short.exec(command)) !== null) {
    const after = command.slice(match.index + match[0].length);
    if (/^[.'"]\S*/.test(after)) continue; // -i.bak / -i'.bak'
    if (/^\s+(?:''|"")(?:\s|$)/.test(after)) continue; // macOS empty suffix
    return "sed -i 会原地修改文件且不创建备份，无法回滚";
  }
  if (/\bsed\s+[^|;]*--in-place(?!=)\b/.test(command)) {
    return "sed --in-place 会原地修改文件且不创建备份，无法回滚";
  }
  return null;
}

// ── cat heredoc write ────────────────────────────────────────

const CAT_HEREDOC_WRITE_RE =
  /\bcat\s*(?:>|>>)\s*\S+[^|]*<<|cat\s*<<-?\s*['"]?\w+['"]?\s*(?:>|>>)\s*\S+/;

function isCatHeredocWrite(command) {
  return CAT_HEREDOC_WRITE_RE.test(command);
}

function isCatPipeInput(command) {
  return /<<-?\s*['"]?\w+['"]?\s*\|/.test(command);
}

function isCatTmpRedirect(command) {
  return /(?:>|>>)\s*(?:\/tmp\/\S+|\/private\/tmp\/\S+|\$TMPDIR\/\S+)/.test(
    command,
  );
}

// ── redis ────────────────────────────────────────────────────

function redisOperation(command) {
  if (!hasProgram(command, new Set(["redis-cli"]))) return null;
  const match = command.match(
    /\b(?:KEYS|MONITOR|FLUSHALL|FLUSHDB|DEL|RANDOMKEY|SETBIT|BGSAVE|BGREWRITEAOF)\b/iu,
  );
  return match ? match[0].toUpperCase() : null;
}

// ── sql ──────────────────────────────────────────────────────

function sqlDestructiveReason(command) {
  if (!hasProgram(command, SQL_CLIENTS)) return null;
  const cleaned = cleanedSql(command);
  const blocks = [
    [/\bDROP\s+(?:DATABASE|TABLE|SCHEMA|INDEX|VIEW)\b/iu, "DROP 会永久删除数据库对象"],
    [/\bTRUNCATE\s+(?:TABLE\s+)?\w/iu, "TRUNCATE 会清空表数据"],
    [/\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/iu, "DROP COLUMN 会永久删除列数据"],
    [/\bDELETE\s+FROM\b(?![^;]*\bWHERE\b)/iu, "DELETE 缺少 WHERE"],
    [/\bUPDATE\s+[^;]+\s+SET\b(?![^;]*\bWHERE\b)/iu, "UPDATE 缺少 WHERE"],
  ];
  for (const [pattern, reason] of blocks) {
    if (pattern.test(cleaned)) return reason;
  }
  return null;
}

function sqlPrivilegeHit(command) {
  if (!hasProgram(command, SQL_CLIENTS)) return false;
  return /\b(?:GRANT|REVOKE)\b/iu.test(cleanedSql(command));
}

// ── active security test ─────────────────────────────────────

function activeTestReason(command) {
  if (hasProgram(command, new Set(["masscan", "zmap"]))) {
    return "高速全网扫描工具没有可审计边界";
  }
  if (
    hasProgram(command, new Set(["hping", "hping3"])) &&
    /--flood\b/u.test(command)
  ) {
    return "禁止 flood 模式";
  }
  if (hasProgram(command, new Set(["nmap"]))) {
    const cidr = command.match(/\S+\/(\d{1,2})\b/u);
    if (cidr && Number(cidr[1]) <= 20) {
      return `目标范围 /${cidr[1]} 超过 /21 上限`;
    }
    if (
      /\s-p-(?:\s|$)/u.test(command) &&
      !/--max-rate(?:=|\s+)\d+/u.test(command)
    ) {
      return "全端口扫描缺少 --max-rate";
    }
  }
  if (
    hasProgram(command, new Set(["ffuf", "gobuster", "feroxbuster"])) &&
    !/(?:^|\s)(?:-rate|--rate|-t|--threads)(?:=|\s+)\d+/u.test(command)
  ) {
    return "内容枚举缺少 rate 或 threads 上限";
  }
  return null;
}

// ── secret leak ──────────────────────────────────────────────

function secretLeakHit(command) {
  const sensitiveRead =
    /\b(?:cat|head|tail|less|more|bat)\b[^\n;&|]*(?:\.pem|\.key|\.p12|\.pfx|id_rsa|id_ed25519|\.jks|\.keystore|\.env\b|credentials\.json|\.aws\/credentials|\.netrc|\.git-credentials)/iu.test(
      command,
    );
  const upload =
    /\b(?:curl|wget|http)\b[^;|&]*(?:--data(?:-raw|-binary)?|--form|-d|-F)\s[^;|&]*(?:\$(?:\{)?(?:PRIVATE_KEY|SECRET_KEY|API_SECRET|AWS_SECRET_ACCESS_KEY|DATABASE_PASSWORD|DB_PASSWORD)|\$\(\s*cat\s+[^)]*(?:\.pem|\.key|id_rsa|id_ed25519))/iu.test(
      command,
    );
  const other =
    /\bapksigner\b[^;\n]*(?:--ks-pass|--key-pass)(?:=|\s+)pass:|\bbase64\b[^;|&]*(?:\.pem|\.key|id_rsa|id_ed25519|PRIVATE)|\becho\b[^;|&]*\$(?:\{)?(?:PRIVATE_KEY|SECRET_KEY|TOKEN|API_KEY)/iu.test(
      command,
    );
  return sensitiveRead || upload || other;
}

/**
 * @typedef {object} BuiltinRule
 * @property {string} id
 * @property {string} title
 * @property {"deny"|"report"|"allow"} mode
 * @property {RegExp|{test:(command:string)=>boolean}} match
 * @property {string} [reason]
 * @property {(command:string)=>string} [resolveReason]
 * @property {string} [recovery]
 * @property {string} [observedFacts]
 * @property {string} [harm]
 * @property {string} [unblockWhen]
 * @property {(command:string)=>string} [formatMessage]  full custom message
 * @property {boolean} [sensitive]
 */

/** @type {BuiltinRule[]} */
export const BUILTIN_RULES = [
  {
    id: "sed-inplace",
    title: "sed -i Guard",
    mode: "deny",
    match: { test: (command) => Boolean(sedInplaceReason(command)) },
    resolveReason: (command) =>
      sedInplaceReason(command) ?? "sed 原地修改没有可恢复的备份",
    recovery:
      "使用 Edit/apply_patch 应用替换；确需 sed 时先建立明确、可恢复的备份。",
    observedFacts:
      "Bash 输入包含 sed --in-place 或未指定备份后缀的裸 sed -i。",
    harm: "原地改写难以审查或恢复，并绕过文件感知的编辑 hook。",
    unblockWhen:
      "命令不再执行无备份原地编辑，或改用文件感知编辑工具。",
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
    reason: "通过 Bash 的 cat heredoc 写文件会绕过所有 PostToolUse hook",
    recovery: "新建文件使用 Write，修改文件使用 Edit/apply_patch。",
    observedFacts: "Bash 输入包含重定向到非临时文件的 cat heredoc。",
    harm: "该写入会绕过文件感知的目标检查、变更钩子与写后验证。",
    unblockWhen:
      "heredoc 仅作为管道输入、仅写入允许的临时目录，或改用文件感知编辑工具。",
    formatMessage: (command) =>
      [
        "[Cat Write Guard] 已拦截 cat heredoc 写文件",
        "",
        "通过 Bash 的 cat heredoc 写文件会绕过所有 PostToolUse hook：",
        "  • 语法检查器不会执行",
        "  • file-line-budget-guard 不会检查行数预算",
        "  • encoding guards 不会检查编码",
        "  • 路径守卫不会检查写入目标",
        "",
        `命令：${command}`,
        "",
        "替代方案：新建文件使用 Write，修改文件使用 Edit/apply_patch。",
        "",
        "blockingContract:",
        "  observedFacts: Bash 输入包含重定向到非临时文件的 cat heredoc。",
        "  harm: 该写入会绕过文件感知的目标检查、变更钩子与写后验证。",
        "  unblockWhen: heredoc 仅作为管道输入、仅写入允许的临时目录，或改用文件感知编辑工具。",
        "  recovery: 使用 Write、Edit 或 apply_patch 应用内容，使路径守卫与验证 hook 能观察变更。",
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
    reason: "Bash cat heredoc 写临时文件不会触发文件感知的 PostToolUse 检查",
    recovery: "临时脚本可以继续，但建议优先使用 Write 工具。",
    formatMessage: (command) =>
      [
        "[Cat Write Guard] 检测到 cat heredoc 写入临时文件",
        "",
        "Bash cat heredoc 写文件不会触发文件感知的 PostToolUse 检查。",
        "临时脚本可以继续，但建议优先使用 Write 工具。",
        `命令：${command}`,
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
      return `${op} 会扫描、阻塞或清空 Redis 数据`;
    },
    recovery: "先确认目标实例、数据范围和可恢复替代方案",
    observedFacts: "命令命中高风险 Redis CLI 操作。",
    harm: "可能造成数据丢失或实例阻塞。",
    unblockWhen: "改用可审计的窄范围操作，或在配置中声明精确 allow。",
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
      return `${op} 可能阻塞主线程或增加实例资源压力`;
    },
    recovery: "先确认目标实例、数据范围和可恢复替代方案",
  },
  {
    id: "sql-destructive",
    title: "Dangerous SQL",
    mode: "deny",
    match: { test: (command) => Boolean(sqlDestructiveReason(command)) },
    resolveReason: (command) =>
      sqlDestructiveReason(command) ?? "危险 SQL",
    recovery: "添加明确 WHERE 或先完成备份、授权和恢复验证",
    observedFacts: "SQL 客户端命令命中破坏性或不带 WHERE 的变更。",
    harm: "可能永久删除数据库对象或批量清空数据。",
    unblockWhen: "补齐 WHERE、备份与授权后再执行。",
  },
  {
    id: "sql-privilege",
    title: "SQL Notice",
    mode: "report",
    match: { test: (command) => sqlPrivilegeHit(command) },
    reason: "数据库权限将发生变化",
    recovery: "确认目标用户、最小权限范围和回滚语句",
  },
  {
    id: "active-test-unbounded",
    title: "Security Active Test Scope Guard",
    mode: "deny",
    match: { test: (command) => Boolean(activeTestReason(command)) },
    resolveReason: (command) =>
      activeTestReason(command) ?? "主动安全测试缺少可审计边界",
    recovery: "改用明确目标和有界速率",
    observedFacts: "主动安全测试命令缺少可审计边界。",
    harm: "可能造成越界扫描或资源冲击。",
    unblockWhen: "声明目标范围、速率或线程上限。",
  },
  {
    id: "secret-leak",
    title: "Secret Leak Notice",
    mode: "report",
    match: { test: (command) => secretLeakHit(command) },
    resolveReason: (command) =>
      `命令可能读取、输出或传输敏感凭据（摘要 ${digest(command)}）`,
    recovery:
      "只读取必要字段，禁止回显或外传；用环境引用和安全凭据通道",
    sensitive: true,
  },
  {
    id: "lark-yes",
    title: "Lark CLI Confirmation Audit",
    mode: "report",
    match: {
      test: (command) =>
        hasProgram(command, new Set(["lark-cli"])) &&
        /(?:^|\s)--yes(?:\s|$)/u.test(command),
    },
    reason: "检测到 --yes 非交互确认",
    recovery: "确认目标资源、写入/删除范围、可恢复副本和回读验证",
    sensitive: true,
  },
];
