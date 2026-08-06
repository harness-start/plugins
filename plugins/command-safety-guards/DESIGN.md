# `.command-safety-guards` 配置文件设计文档

## 1. 动机

`command-safety-guards` 原先把危险命令、数据库、主动测试、凭据泄露等策略硬编码在多个 check 模块里，入口按固定顺序串联。不同仓库对「可接受命令」的边界不同：有的要放行 staging 的 `FLUSHDB`，有的要额外禁止 `git push --force`。

把可正则表达的拦截策略外置为声明式规则，并保留无法压成正则的引擎，使项目能在零配置默认安全基线之上做精确覆盖。

## 2. 设计目标

| 目标 | 说明 |
|------|------|
| **零配置可用** | 无配置文件时沿用内置规则 + 默认引擎，行为与 0.2.x 关键路径对齐 |
| **声明式规则** | 用 `RegExp`（用户）或内置 tester 表达「匹配哪些命令、deny/report/allow」 |
| **精确优先级** | 用户规则前置；先命中先生效 |
| **引擎边界清晰** | shell 路径解析、event 证据、Read 路径、写后内容扫描、升级计数不进 rules |
| **配置即文档** | 读 `.command-safety-guards.mjs` 即可理解本仓库的命令策略 |

## 3. 配置文件发现

加载顺序（找到第一个即停止）：

```text
<project-root>/.command-safety-guards.mjs   ← 优先
<project-root>/.command-safety-guards.cjs
<project-root>/.command-safety-guards.js
```

项目根通过 `git rev-parse --show-toplevel` 定位（cwd 取自 hook event）。配置通过 `import()` 动态加载。

## 4. 配置结构

```js
// .command-safety-guards.mjs
export default {
  rules: [
    // 误伤放行：用户规则优先于内置 deny
    {
      id: "allow-redis-flushdb-staging",
      match: /\bredis-cli\b[^\n]*\bFLUSHDB\b/iu,
      mode: "allow",
    },
    // 项目自定义拦截
    {
      id: "no-git-force-push",
      match: /\bgit\s+push\b[^\n]*--force\b/iu,
      mode: "deny",
      title: "Git Force Push Guard",
      reason: "force push 会改写远端历史",
      recovery: "改用受控流程或 --force-with-lease 并取得明确授权",
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
    escalation: {
      windowMinutes: 10,
      threshold: 3,
    },
  },
};
```

### 4.1 规则字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `match` | `RegExp` | 是（用户配置） | 对命令字符串做 `.test()`；匹配前会剥离 git commit message / 内嵌 heredoc 字面量 |
| `mode` | `"deny"` \| `"report"` \| `"allow"` | 否 | 默认 `"deny"` |
| `id` | `string` | 推荐 | 稳定标识；缺省为 `user-rule[i]` |
| `title` | `string` | 否 | 消息标题，如 `Dangerous SQL` |
| `reason` | `string` | deny/report 推荐 | 命中原因 |
| `recovery` | `string` | deny 推荐 | 恢复/替代路径 |

### 4.2 `mode` 语义

| mode | 行为 |
|------|------|
| `deny` | PreToolUse `permissionDecision: deny`，并记入本地 deny 计数（若 escalation 引擎开启） |
| `report` | 仅 `additionalContext` 提示，不阻断 |
| `allow` | 显式放行并短路后续**声明式规则**与 mysql preflight 引擎 |

### 4.3 `settings.engines`

| 键 | 默认 | 职责 |
|----|------|------|
| `dangerousRm` | `true` | tokenize + 路径解析递归删除守卫（在规则匹配**之前**执行） |
| `mysqlReplicationPreflight` | `true` | 复制切换需 event 内 preflight 证据 |
| `secretRead` | `true` | Read 工具敏感路径提示 |
| `fileSafety` | `true` | PostToolUse TLS / PII / SQL encoding |
| `denyEscalation` | `true` | 同目标短时多次 deny 升级 |

**说明：** `mode: "allow"` **不能**绕过 `dangerousRm` 与 `denyEscalation`。若需放行特定 `rm`，请关闭 `engines.dangerousRm` 或收窄删除目标；不要用 `/.*/` 式 allow。

## 5. 优先级

```text
denyEscalation（引擎）
    ↓
dangerousRm（引擎，先于规则，保证 `rm -rf /; …` 先按删除语义拦截）
    ↓
用户 rules ──→ allow → 放行（短路后续规则 + mysql）
用户 rules ──→ deny  → 拦截
用户 rules ──→ report → 提示并结束
内置 rules ──→ 同上
    ↓
mysqlReplicationPreflight（引擎）
```

实现：`resolveRules` 将用户 `rules` 拼在 `BUILTIN_RULES` 前面；`matchRule` 从头遍历，命中即停。

## 6. 内置规则原则（不冲突）

1. **一条规则一个窄语义**，固定 `id`，同一危险面不重复表达
2. **互斥分类**（如 cat 写 repo deny vs 写 tmp report）用互斥 tester，避免双命中
3. **依赖 cwd / event / 文件内容** 的逻辑一律进 engines

内置 id 一览：`sed-inplace`、`cat-heredoc-repo-write`、`cat-heredoc-tmp-write`、`redis-cli-risk`、`redis-cli-pressure`、`sql-destructive`、`sql-privilege`、`active-test-unbounded`、`secret-leak`、`lark-yes`。

内置规则的 `match` 可为 `{ test(command) }` 函数（仅内置）；用户配置只接受 `RegExp`。

## 7. 错误处理（fail-open）

| 场景 | 行为 |
|------|------|
| 配置文件不存在 | 回退内置规则 + 默认 engines |
| `import()` 失败 | stderr 一行警告，回退内置 |
| 用户 `match` 非 `RegExp` | 跳过该条 + stderr |
| `mode` 非法 | 跳过该条 + stderr |
| `git rev-parse` 失败 | 不加载用户配置，仅内置 |
| `match.test` 抛异常 | 跳过该条 |
| hook 自身异常 | exit 0 放行 |

## 8. 模块映射

| 路径 | 角色 |
|------|------|
| `scripts/lib/builtin-rules.mjs` | 内置声明式规则（唯一来源） |
| `scripts/lib/rule-engine.mjs` | 配置加载/合并/匹配/格式化 |
| `scripts/lib/sanitize-command.mjs` | 匹配前剥离 commit/heredoc 字面量 |
| `scripts/engines/dangerous-rm.mjs` | dangerousRm 引擎 |
| `scripts/engines/mysql-preflight.mjs` | mysql replication preflight 引擎 |
| `scripts/engines/secret-read.mjs` | Read 敏感路径引擎 |
| `scripts/engines/file-safety.mjs` | PostToolUse 内容扫描引擎 |
| `scripts/lib/deny-state.mjs` | denyEscalation 引擎 |

**禁止**在 `engines/` 与 `builtin-rules.mjs` 之间复制同一条策略；声明式能表达的只进 rules，不能的只进 engines。

## 9. 配置管理 Skill

插件内 skill：`skills/command-safety-guards-config/SKILL.md`。

用于在目标仓库初始化、增删改、诊断 `.command-safety-guards.mjs`。Agent 应遵循该 skill 的 schema、引擎边界与反模式（尤其 `allow` 不能绕过 `dangerousRm`）。

## 10. 版本

| 版本 | 变更 |
|------|------|
| `0.4.0` | 增加 `command-safety-guards-config` skill 管理项目配置文件 |
| `0.3.0` | 引入配置文件、声明式规则表、engines 开关；默认行为兼容 0.2.x 关键路径 |
| `0.2.0` | 数据库 / Redis / 主动测试 / 凭据 / 升级计数 |
| `0.1.0` | 危险删除、sed -i、cat heredoc |
