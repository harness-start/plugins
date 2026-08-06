# command-safety-guards

Deterministic PreToolUse and PostToolUse guards for high-risk commands and sensitive source patterns on Claude Code and Codex.

## 规则系统（v0.3.0）

与 `file-line-budget-guard` 同构：**项目配置前置 + 内置默认 + 先命中先生效**。

- **用户配置**：项目根 `.command-safety-guards.mjs`（或 `.cjs` / `.js`）
- **内置规则**：sed 原地写、cat heredoc、Redis/SQL、主动测试边界、凭据泄露、lark `--yes`
- **引擎**（不可仅靠正则）：危险 `rm`、MySQL 复制 preflight、Read 敏感路径、写后 TLS/PII、deny 升级

详见 [DESIGN.md](./DESIGN.md)。

### 默认拦截清单（零配置）

无项目配置时，下列 **deny** 会阻断命令执行（`permissionDecision: deny`）。来源列为规则 `id` 或引擎名；完整实现见 `scripts/lib/builtin-rules.mjs` 与 `scripts/engines/*`。

| 来源 | 模式 | 拦截什么 | 典型触发 |
| --- | --- | --- | --- |
| `dangerousRm`（引擎） | Deny | 递归删除过宽目标 | `rm -r /`、`rm -rf ~`、`rm -r .`、`rm -r /tmp` 等顶层目录；`xargs … rm -r`；嵌套 `sh -c` 过深 |
| `denyEscalation`（引擎） | Deny | 同目标短时多次 deny 升级 | 默认约 10 分钟内对同一目标累计 ≥3 次本插件 deny |
| `sed-inplace` | Deny | 无备份的 sed 原地写 | `sed -i`（无备份后缀）、`sed --in-place`（无 `=SUFFIX`） |
| `cat-heredoc-repo-write` | Deny | cat heredoc 写非临时文件 | `cat > path <<EOF` / `cat <<EOF > path`（非 `/tmp`、非管道输入） |
| `redis-cli-risk` | Deny | 高风险 Redis CLI | `redis-cli` 的 `KEYS` / `MONITOR` / `FLUSHALL` / `FLUSHDB` |
| `sql-destructive` | Deny | 破坏性或不带 WHERE 的 SQL | 经 mysql/psql 等客户端：`DROP …`、`TRUNCATE`、`ALTER TABLE … DROP COLUMN`、无 `WHERE` 的 `DELETE`/`UPDATE` |
| `active-test-unbounded` | Deny | 无界主动安全测试 | `masscan`/`zmap`；`hping(3) --flood`；`nmap` 目标 ≤`/20` 或 `-p-` 无 `--max-rate`；`ffuf`/`gobuster`/`feroxbuster` 无 rate/threads 上限 |
| `mysqlReplicationPreflight`（引擎） | Deny | 复制切换缺 preflight 证据 | `mysql`/`mysqlsh` 中的 `RESET REPLICA ALL`、`CHANGE REPLICATION SOURCE TO`、`STOP REPLICA`、关闭 `read_only` 等 |

下列 **report** 默认只提示、不阻断；可用用户 `mode: "allow"` 短路，或关对应引擎：

| 来源 | 模式 | 提示什么 | 典型触发 |
| --- | --- | --- | --- |
| `secretRead`（引擎） | Report | Read 敏感路径 | `.env`、密钥、`.ssh`、credentials 等（测试/文档白名单除外） |
| `cat-heredoc-tmp-write` | Report | cat heredoc 写临时目录 | 重定向到 `/tmp`、`$TMPDIR` 等 |
| `redis-cli-pressure` | Report | 可能加压 Redis | `DEL` / `RANDOMKEY` / `SETBIT` / `BGSAVE` / `BGREWRITEAOF` |
| `sql-privilege` | Report | 权限变更 SQL | 客户端中的 `GRANT` / `REVOKE` |
| `secret-leak` | Report | 可能读出/外传凭据 | `cat`/… 敏感文件；`curl`/`wget` 带 secret 变量；`apksigner --ks-pass pass:`；`base64`/`echo` 涉密钥 |
| `lark-yes` | Report | 飞书 CLI 非交互确认 | `lark-cli … --yes` |
| `fileSafety`（引擎，PostToolUse） | Report | 写后内容风险 | 新增 TLS 校验绕过、日志直打 PII、SQL 文件 BOM/非法 UTF-8 |

`mode: "allow"` 可覆盖后续声明式 deny/report，**不能**绕过 `dangerousRm` 与 `denyEscalation`。

### 配置示例

```js
// .command-safety-guards.mjs
export default {
  rules: [
    {
      id: "allow-redis-flushdb-staging",
      match: /\bredis-cli\b[^\n]*\bFLUSHDB\b/iu,
      mode: "allow",
    },
    {
      id: "no-git-force-push",
      match: /\bgit\s+push\b[^\n]*--force\b/iu,
      mode: "deny",
      title: "Git Force Push Guard",
      reason: "force push 会改写远端历史",
      recovery: "改用受控流程或 --force-with-lease",
    },
  ],
  settings: {
    engines: {
      dangerousRm: true,
      mysqlReplicationPreflight: true,
      secretRead: true,
      fileSafety: true,
      denyEscalation: true,
    },
    escalation: { windowMinutes: 10, threshold: 3 },
  },
};
```

`mode: "allow"` 可覆盖后续内置声明式 deny/report，**不能**绕过危险 `rm` 引擎与 deny 升级。关闭某引擎请用 `settings.engines.* = false`。

使用插件自带 skill **`command-safety-guards-config`**（`skills/command-safety-guards-config/SKILL.md`）初始化、维护和诊断配置文件：在已启用本插件的会话中按 description 自动触发，或显式调用该 skill。

### 故障模式：fail-open

Hook 自身出错（超时、异常、无效 JSON、配置加载失败）时放行，不阻塞用户操作。坏规则条目被跳过并写 stderr 警告。

## Behavior

| Order | Check | Result |
| --- | --- | --- |
| 1 | Read 敏感路径（engine） | Report |
| 2 | 同目标短时多次 deny（engine） | Deny |
| 3 | 递归 `rm` 宽目标（engine） | Deny |
| 4 | 声明式规则（用户 → 内置）：sed / cat / Redis / SQL / 主动测试 / 凭据 / lark | Deny / Report / Allow |
| 5 | MySQL 复制切换缺 preflight（engine） | Deny |
| 6 | 写后 TLS bypass / PII / SQL encoding（engine） | PostToolUse report |

Clean commands produce no stdout. Denials exit with status 0 and return the shared `permissionDecision: deny` JSON contract expected by both hosts.

## Layout

| Path | Role |
| --- | --- |
| `scripts/lib/builtin-rules.mjs` | Built-in declarative rules (single source) |
| `scripts/lib/rule-engine.mjs` | Config load / merge / match / format |
| `scripts/engines/*` | Non-regex engines only (`dangerous-rm`, `mysql-preflight`, `secret-read`, `file-safety`) |
| `scripts/lib/deny-state.mjs` | Deny escalation state |
| `skills/command-safety-guards-config/` | Config init / edit / diagnose skill |

## Migrated from

| Source | Target |
| --- | --- |
| `skills/command-safety-governance/src/hooks/dangerous-command-guard.ts` | `scripts/engines/dangerous-rm.mjs` |
| `skills/command-safety-governance/src/hooks/sed-inplace-guard.ts` | `scripts/lib/builtin-rules.mjs` (`sed-inplace`) |
| `skills/command-safety-governance/src/hooks/cat-write-guard.ts` | `scripts/lib/builtin-rules.mjs` (`cat-heredoc-*`) |
| `core/hook-support/src/hook-bash-git-shell-utils.ts` | Minimal tokenizer in `scripts/lib/shell-parse.mjs` |

The plugin is self-contained and has no `@harness/*` runtime dependency. Escalation state deliberately counts only denials emitted by this plugin. State is JSONL under `PLUGIN_DATA` or `CLAUDE_PLUGIN_DATA`; nothing is written into the plugin installation directory.

## Verification

From the marketplace root:

```bash
find plugins/command-safety-guards/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
node --test plugins/command-safety-guards/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin command-safety-guards
```

The unit suite only runs pure checks and local Node.js hook subprocesses. Live Claude Code and Codex acceptance is Docker-only and requires the repository `.env` described in [host acceptance](../../docs/host-acceptance.md).

Version: `0.4.0`
