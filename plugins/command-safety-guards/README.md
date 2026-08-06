# command-safety-guards

Deterministic PreToolUse and PostToolUse guards for high-risk commands and sensitive source patterns on Claude Code and Codex.

## 规则系统（v0.3.0）

与 `file-line-budget-guard` 同构：**项目配置前置 + 内置默认 + 先命中先生效**。

- **用户配置**：项目根 `.command-safety-guards.mjs`（或 `.cjs` / `.js`）
- **内置规则**：sed 原地写、cat heredoc、Redis/SQL、主动测试边界、凭据泄露、lark `--yes`
- **引擎**（不可仅靠正则）：危险 `rm`、MySQL 复制 preflight、Read 敏感路径、写后 TLS/PII、deny 升级

详见 [DESIGN.md](./DESIGN.md)。

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

Version: `0.3.0`
