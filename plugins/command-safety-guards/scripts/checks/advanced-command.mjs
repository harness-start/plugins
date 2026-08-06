import { createHash } from "node:crypto";
import { splitShellLogicalLines, tokenizeShell } from "../lib/shell-parse.mjs";

function finding(action, id, reason, recovery, sensitive = false) { return { action, id, reason, recovery, sensitive }; }
function digest(command) { return createHash("sha256").update(command).digest("hex").slice(0, 16); }
function hasProgram(command, programs) { return splitShellLogicalLines(command).some((line) => tokenizeShell(line).some((token) => programs.has(token.split("/").at(-1)?.toLowerCase()))); }

function redis(command) {
  if (!hasProgram(command, new Set(["redis-cli"]))) return null;
  const match = command.match(/\b(?:KEYS|MONITOR|FLUSHALL|FLUSHDB|DEL|RANDOMKEY|SETBIT|BGSAVE|BGREWRITEAOF)\b/iu); if (!match) return null; const operation = match[0].toUpperCase();
  const blocked = new Set(["KEYS", "MONITOR", "FLUSHALL", "FLUSHDB"]); return finding(blocked.has(operation) ? "deny" : "report", "Redis CLI Risk", `${operation} ${blocked.has(operation) ? "会扫描、阻塞或清空 Redis 数据" : "可能阻塞主线程或增加实例资源压力"}`, "先确认目标实例、数据范围和可恢复替代方案");
}

function sql(command) {
  const clients = new Set(["mysql", "mariadb", "mysqlsh", "mycli", "psql", "pgcli", "cockroach", "sqlite3", "litecli", "duckdb", "clickhouse", "clickhouse-client", "sqlcmd", "usql", "snowsql", "trino", "presto", "mongosh", "mongo"]); if (!hasProgram(command, clients)) return null;
  const cleaned = tokenizeShell(command).join(" ").replace(/--(?=\s|$)[^\n]*/gu, "").replace(/\/\*[\s\S]*?\*\//gu, "");
  const blocks = [[/\bDROP\s+(?:DATABASE|TABLE|SCHEMA|INDEX|VIEW)\b/iu, "DROP 会永久删除数据库对象"], [/\bTRUNCATE\s+(?:TABLE\s+)?\w/iu, "TRUNCATE 会清空表数据"], [/\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/iu, "DROP COLUMN 会永久删除列数据"], [/\bDELETE\s+FROM\b(?![^;]*\bWHERE\b)/iu, "DELETE 缺少 WHERE"], [/\bUPDATE\s+[^;]+\s+SET\b(?![^;]*\bWHERE\b)/iu, "UPDATE 缺少 WHERE"]];
  for (const [pattern, reason] of blocks) if (pattern.test(cleaned)) return finding("deny", "Dangerous SQL", reason, "添加明确 WHERE 或先完成备份、授权和恢复验证");
  if (/\b(?:GRANT|REVOKE)\b/iu.test(cleaned)) return finding("report", "SQL Notice", "数据库权限将发生变化", "确认目标用户、最小权限范围和回滚语句"); return null;
}

function mysqlFailover(command, event) {
  if (!hasProgram(command, new Set(["mysql", "mysqlsh"]))) return null; const mutation = command.match(/\b(?:RESET\s+REPLICA\s+ALL|CHANGE\s+REPLICATION\s+SOURCE\s+TO|STOP\s+REPLICA|SET\s+(?:@@GLOBAL\.|GLOBAL\s+)(?:super_)?read_only\s*=\s*(?:0|OFF))\b/iu)?.[0]; if (!mutation) return null;
  const evidence = JSON.stringify(event); const preflight = /mysql-replication-preflight/u.test(evidence) && /(?:exit_code|exitCode)["']?\s*:\s*0/u.test(evidence) && !/(?:timed_out|timedOut)["']?\s*:\s*true/u.test(evidence);
  return preflight ? null : finding("deny", "MySQL Replication Failover Guard", `缺少成功复制 preflight 证据：${mutation}`, "先运行 mysql-replication-preflight 并验证复制线程、延迟和 GTID 覆盖");
}

function activeTest(command) {
  if (hasProgram(command, new Set(["masscan", "zmap"]))) return finding("deny", "Security Active Test Scope Guard", "高速全网扫描工具没有可审计边界", "改用明确目标和有界速率");
  if (hasProgram(command, new Set(["hping", "hping3"])) && /--flood\b/u.test(command)) return finding("deny", "Security Active Test Scope Guard", "禁止 flood 模式", "声明 count 和 interval 上限");
  if (hasProgram(command, new Set(["nmap"]))) { const cidr = command.match(/\S+\/(\d{1,2})\b/u); if (cidr && Number(cidr[1]) <= 20) return finding("deny", "Security Active Test Scope Guard", `目标范围 /${cidr[1]} 超过 /21 上限`, "缩小目标范围"); if (/\s-p-(?:\s|$)/u.test(command) && !/--max-rate(?:=|\s+)\d+/u.test(command)) return finding("deny", "Security Active Test Scope Guard", "全端口扫描缺少 --max-rate", "声明最大速率"); }
  if (hasProgram(command, new Set(["ffuf", "gobuster", "feroxbuster"])) && !/(?:^|\s)(?:-rate|--rate|-t|--threads)(?:=|\s+)\d+/u.test(command)) return finding("deny", "Security Active Test Scope Guard", "内容枚举缺少 rate 或 threads 上限", "声明速率或线程数"); return null;
}

function secretLeak(command) {
  const sensitiveRead = /\b(?:cat|head|tail|less|more|bat)\b[^\n;&|]*(?:\.pem|\.key|\.p12|\.pfx|id_rsa|id_ed25519|\.jks|\.keystore|\.env\b|credentials\.json|\.aws\/credentials|\.netrc|\.git-credentials)/iu.test(command);
  const upload = /\b(?:curl|wget|http)\b[^;|&]*(?:--data(?:-raw|-binary)?|--form|-d|-F)\s[^;|&]*(?:\$(?:\{)?(?:PRIVATE_KEY|SECRET_KEY|API_SECRET|AWS_SECRET_ACCESS_KEY|DATABASE_PASSWORD|DB_PASSWORD)|\$\(\s*cat\s+[^)]*(?:\.pem|\.key|id_rsa|id_ed25519))/iu.test(command);
  const other = /\bapksigner\b[^;\n]*(?:--ks-pass|--key-pass)(?:=|\s+)pass:|\bbase64\b[^;|&]*(?:\.pem|\.key|id_rsa|id_ed25519|PRIVATE)|\becho\b[^;|&]*\$(?:\{)?(?:PRIVATE_KEY|SECRET_KEY|TOKEN|API_KEY)/iu.test(command);
  return sensitiveRead || upload || other ? finding("report", "Secret Leak Notice", `命令可能读取、输出或传输敏感凭据（摘要 ${digest(command)}）`, "只读取必要字段，禁止回显或外传；用环境引用和安全凭据通道", true) : null;
}

function lark(command) { return hasProgram(command, new Set(["lark-cli"])) && /(?:^|\s)--yes(?:\s|$)/u.test(command) ? finding("report", "Lark CLI Confirmation Audit", "检测到 --yes 非交互确认", "确认目标资源、写入/删除范围、可恢复副本和回读验证", true) : null; }

export function advancedCommandFindings(command, event = {}) { return [redis(command), sql(command), mysqlFailover(command, event), activeTest(command), secretLeak(command), lark(command)].filter(Boolean); }
export function advancedMessage(item) { return [`[${item.id}] ${item.action === "deny" ? "已拦截" : "风险提示"}`, "", `原因：${item.reason}`, `恢复/替代：${item.recovery}`, ...(item.action === "deny" ? ["", "blockingContract:", "  observedFacts: 命令命中高风险数据库、安全测试或复制状态变更规则。", "  harm: 可能造成数据丢失、越界测试、凭据暴露或不可验证的主从切换。", "  unblockWhen: 补齐授权、范围、preflight 或安全替代方案。", `  recovery: ${item.recovery}`] : [])].join("\n"); }
