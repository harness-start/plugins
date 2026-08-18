# command-safety

为 Claude Code 和 Codex 提供确定性的 `PreToolUse` 与 `PostToolUse` 守卫，检查高风险命令和敏感源码模式。

## 规则系统

与 `engineering-quality` 同构：**项目配置前置 + 内置默认 + 先命中先生效**。

- **用户配置**：项目根 `.command-safety.mjs`（或 `.cjs` / `.js`）
- **内置规则**：sed 原地写、cat heredoc、Redis/SQL、主动测试边界、凭据泄露、lark `--yes`
- **引擎**（不可仅靠正则）：危险 `rm`、MySQL 复制 preflight、Read 敏感路径、写后 TLS/PII、deny 升级

### 默认拦截清单（零配置）

无项目配置时，下列 **deny** 会阻断命令执行（`permissionDecision: deny`）。来源列为规则 `id` 或引擎名；完整实现见 `src/lib/builtin-rules.ts` 与 `src/engines/*`。

| 来源 | 模式 | 拦截什么 | 典型触发 |
| --- | --- | --- | --- |
| `dangerousRm`（引擎） | Deny | 递归删除过宽目标 | `rm -r /`、`rm -rf ~`、`rm -r .`、`rm -r /tmp` 等顶层目录；`xargs … rm -r`；嵌套 `sh -c` 过深 |
| `denyEscalation`（引擎） | Deny | 同目标短时多次 deny 升级 | 默认约 10 分钟内对同一目标累计 ≥3 次本插件 deny |
| `sed-inplace` | Deny | 无备份的 sed 原地写（**非**临时路径） | `sed -i` / `sed --in-place` 作用于仓库等路径；`/tmp/…`、`/private/tmp/…`、`$TMPDIR/…` 上的无备份 `-i` **放行** |
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
| `fileSafety`（引擎，PostToolUse） | Report | 写后内容风险 | 新增 TLS 校验绕过、日志直打 PII |

`mode: "allow"` 可覆盖后续声明式 deny/report，**不能**绕过 `dangerousRm` 与 `denyEscalation`。

### 配置示例

```js
// .command-safety.mjs
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

使用插件自带 skill **`command-safety-config`**（`skills/command-safety-config/SKILL.md`）初始化、维护和诊断配置文件：在已启用本插件的会话中按 description 自动触发，或显式调用该 skill。

### 故障模式：fail-open

Hook 自身出错（超时、异常、无效 JSON、配置加载失败）时放行，不阻塞用户操作。坏规则条目被跳过并写 stderr 警告。

## 执行顺序

| 顺序 | 检查 | 结果 |
| --- | --- | --- |
| 1 | Read 敏感路径（engine） | Report |
| 2 | 同目标短时多次 deny（engine） | Deny |
| 3 | 递归 `rm` 宽目标（engine） | Deny |
| 4 | 声明式规则（用户 → 内置）：sed / cat / Redis / SQL / 主动测试 / 凭据 / lark | Deny / Report / Allow |
| 5 | MySQL 复制切换缺 preflight（engine） | Deny |
| 6 | 写后 TLS bypass / PII（engine） | PostToolUse report |

安全命令不产生 stdout。拒绝结果以状态 0 退出，并返回两个宿主共同使用的 `permissionDecision: deny` JSON 契约。

## 配置设计

项目根通过 `git rev-parse --show-toplevel` 定位，按以下顺序加载，找到第一个文件后停止。配置通过 `import()` 加载：

```text
<project-root>/.command-safety.mjs
<project-root>/.command-safety.cjs
<project-root>/.command-safety.js
```

用户 `rules` 会由 `resolveRules` 放到 `BUILTIN_RULES` 前面，`matchRule` 从头遍历并通过 `.test()` 在首次命中时停止。用户规则的 `match` 只接受 `RegExp`；内置规则还可使用 `{ test(command) }`。

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `match` | `RegExp` | 是 | 匹配命令；此前会剥离 Git commit message 和内嵌 heredoc 字面量 |
| `mode` | `"deny"`、`"report"`、`"allow"` | 否 | 默认 `"deny"` |
| `id` | `string` | 推荐 | 稳定标识，缺省为 `user-rule[i]` |
| `title` | `string` | 否 | 消息标题 |
| `reason` | `string` | deny/report 推荐 | 命中原因 |
| `recovery` | `string` | deny 推荐 | 恢复或替代路径 |

声明式规则遵循“一条规则一个窄语义”，互斥类别使用互斥 tester；依赖 cwd、event 或文件内容的逻辑只进入引擎。声明式规则与引擎不得复制同一策略。

配置不存在时使用内置规则和默认引擎。`import()` 失败、字段非法或匹配器抛错时，插件写一行 stderr 警告、跳过坏项并 fail-open；Git 根定位失败时不加载用户配置；Hook 自身异常也以状态 0 放行。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `src/lib/builtin-rules.ts` | 内置声明式规则的唯一来源 |
| `src/lib/rule-engine.ts` | 配置加载、合并、匹配与格式化 |
| `src/lib/sanitize-command.ts` | 匹配前剥离 commit/heredoc 字面量 |
| `src/engines/dangerous-rm.ts` | `dangerousRm` 引擎 |
| `src/engines/mysql-preflight.ts` | MySQL replication preflight 引擎 |
| `src/engines/secret-read.ts` | Read 敏感路径引擎 |
| `src/engines/file-safety.ts` | `PostToolUse` TLS/PII 内容扫描引擎 |
| `src/lib/deny-state.ts` | deny 升级状态 |
| `skills/command-safety-config/` | 配置初始化、编辑与诊断 Skill |

## 迁移来源

| 来源 | 目标 |
| --- | --- |
| `skills/command-safety-governance/src/hooks/dangerous-command-guard.ts` | `src/engines/dangerous-rm.ts` |
| `skills/command-safety-governance/src/hooks/sed-inplace-guard.ts` | `src/lib/builtin-rules.ts` (`sed-inplace`) |
| `skills/command-safety-governance/src/hooks/cat-write-guard.ts` | `src/lib/builtin-rules.ts` (`cat-heredoc-*`) |
| `core/hook-support/src/hook-bash-git-shell-utils.ts` | `src/lib/shell-parse.ts` 中的最小 tokenizer |

插件完全自包含，没有 `@harness/*` 运行时依赖。升级状态只统计本插件产生的拒绝，JSONL 写在当前工作目录的 `.command-safety/.state/`，`.command-safety/.gitignore` 忽略该工作目录的全部内容，不会写入插件安装目录。

## 验证

在 marketplace 根目录运行：

```bash
find plugins/command-safety/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
npx tsx --test plugins/command-safety/tests/*.test.ts
./scripts/acceptance/run.sh --plugin command-safety
```

单元测试只执行纯检查和本地 Node.js Hook 子进程。Claude Code 与 Codex 的实时验收仅在 Docker 中运行，并要求仓库 `.env` 提供 [host acceptance](../../docs/host-acceptance.md) 所述配置。

拒绝信息中的恢复建议按宿主能力生成：Claude Code 使用 `Write` / `Edit`，Codex 使用 `apply_patch`；两端共享相同的风险判定与放行条件。

版本：`0.5.0`

## 版本沿革

| 版本 | 变更 |
| --- | --- |
| `0.5.0` | SQL encoding 检查迁移到独立 `source-integrity`，`fileSafety` 保留 TLS / PII |
| `0.4.0` | 增加 `command-safety-config` Skill 管理项目配置 |
| `0.3.0` | 引入声明式规则、项目配置和引擎开关，默认行为兼容 0.2.x 关键路径 |
| `0.2.0` | 增加数据库、Redis、主动测试、凭据和升级计数规则 |
| `0.1.0` | 增加危险删除、`sed -i` 和 `cat` heredoc 检查 |
