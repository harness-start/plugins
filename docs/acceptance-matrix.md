# 双平台真实会话验收矩阵

> 记录每个插件在 Claude Code / Codex 新会话中的真实验收结果。
> 发布版本 bump 前必须先更新本矩阵（CI 检查"已验收版本" ≥ manifest 版本）。

| 插件 | 平台 | 已验收版本 | 触发场景 | 结果 | 证据 | 持久化位置 | 回滚 tag |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `process-confidence` | Claude | 0.1.0 | — | 存量插件，未重验 | — | — | — |
| `process-confidence` | Codex | 0.1.0 | — | 存量插件，未重验 | — | — | — |
| `file-line-budget-guard` | Claude | 0.1.0 | — | 存量插件，未重验 | — | — | — |
| `file-line-budget-guard` | Codex | 0.1.0 | — | 存量插件，未重验 | — | — | — |
| `php-runtime-guards` | Claude | 0.1.0 | PreToolUse deny / PostToolUse report | ⏳ **待验收**：本机 Claude OAuth 过期，`claude plugin validate --strict` 已通过（静态门禁）；需登录后开新会话补验 | `claude plugin validate --strict plugins/php-runtime-guards` | 无持久化（无状态文件） | `php-runtime-guards-v0.1.0` |
| `php-runtime-guards` | Codex | 0.1.0 | PreToolUse deny：会话要求编辑 composer.json 添加 `repositories` 键 | ✅ **通过**：`ERROR ... Command blocked by PreToolUse hook: [Composer Repositories Guard]` + blockingContract；composer.json 未被修改 | `codex exec --dangerously-bypass-hook-trust` 会话（2026-08-05），拒绝后文件内容不变 | 无持久化 | `php-runtime-guards-v0.1.0` |
| `php-runtime-guards` | Codex | 0.1.0 | PostToolUse 触发 | ✅ **部分通过**：hook 进程在每次 Bash 工具事件后被调用（探针确认）；Codex exec 模式以 Bash+apply_patch 写文件，`patchTargetPaths` 解析目标后检查可运行（单元测试覆盖）；report 注入模型上下文无法在 exec 模式输出中直接断言 | 事件探针 dump（tool_name=Bash）+ 61 个单元测试 | 无持久化 | `php-runtime-guards-v0.1.0` |
| `symfony-runtime-guards` | Claude | 0.1.0 | PreToolUse deny / PostToolUse report | ⏳ **待验收**：本机 Claude OAuth 过期；需登录后开新会话补验 | `claude plugin validate --strict plugins/symfony-runtime-guards` | 无持久化 | `symfony-runtime-guards-v0.1.0` |
| `laravel-runtime-guards` | Claude | 0.1.0 | PreToolUse deny | ⏳ **待验收**：Claude OAuth 过期；登录后补验 Laravel 受保护路径 deny | 8 个单元测试 | 无持久化 | `laravel-runtime-guards-v0.1.0` |
| `laravel-runtime-guards` | Codex | 0.1.0 | PreToolUse deny | ⏳ **待验收**：机制与 php-runtime-guards 同（deny 输出已验证）；待开新会话补验 | 8 个单元测试 | 无持久化 | `laravel-runtime-guards-v0.1.0` |
| `thinkphp-runtime-guards` | 双平台 | 0.1.0 | PreToolUse deny | ⏳ **待验收**：同 laravel | 5 个单元测试 | 无持久化 | `thinkphp-runtime-guards-v0.1.0` |
| `webman-runtime-guards` | 双平台 | 0.1.0 | PreToolUse deny | ⏳ **待验收**：同 laravel | 3 个单元测试 | 无持久化 | `webman-runtime-guards-v0.1.0` |
| `symfony-runtime-guards` | Codex | 0.1.0 | PreToolUse deny / PostToolUse report | ⏳ **待验收**：逻辑与 php-runtime-guards 同构（deny 输出 + report 合并），Codex hook 装载机制已验证；待开新会话补验 Symfony 规则触发 | 16 个单元测试 | 无持久化 | `symfony-runtime-guards-v0.1.0` |

## 说明

- **验收方式**：Claude Code / Codex 新会话安装 → 信任 hooks → 触发对应事件 → 检查退出码 / deny / report / 文件未被修改。
- **Codex 信任**：插件 hooks 是非托管 hooks，首次运行需用户审查信任；自动化验收使用 `--dangerously-bypass-hook-trust`（源码为本地已审查）。
- **Claude 待办**：`claude` CLI OAuth 过期无法开真实会话；登录后补验 PreToolUse deny + PostToolUse report 两个场景并更新本表。
- **测试策略**：不跑真实模型调用；行为由 61 个纯单元测试覆盖（`node --test tests/*.test.mjs`），真实会话验收仅用于验证平台 hook 装载与事件到达。
