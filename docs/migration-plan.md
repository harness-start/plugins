# ai-experts → harness-start/plugins 迁移记录

> 状态：已收口 · 2026-08-06
>
> 源快照：`infra/ai-experts@00d2945da025a13545ef086436617da1cb399ef9`

## 当前边界

仓库只保留三个双平台、自包含插件：

- `command-safety-guards`
- `file-line-budget-guard`
- `process-confidence`

所有 `*-runtime-guards` 已按明确的仓库范围决策退役。此前已移除的 web、infra、mobile、misc language、git delivery、execution discipline、delivery evidence 和 context rules 插件同样不再作为 target-native 插件维护。

## 迁移账本

机器可读映射见 [migration-parity.json](migration-parity.json)。固定源清单仍包含 202 个唯一 hook ID，以保留审计历史：

- 15 个 hook 标记为 `target-native`，由 `command-safety-guards` 和 `file-line-budget-guard` 承载；
- 187 个 hook 标记为 `excluded-by-plan`，记录已退役插件及其排除理由。

`process-confidence` 是目标仓库原生插件，不对应这份源 hook 清单。

## 运行约束

保留插件继续遵循以下约束：

- Claude Code 与 Codex 分别维护 manifest、hook 配置、根目录变量和输出适配；
- 运行时直接执行已提交的 Node.js `.mjs`，不增加 install、compile、bundle、sync 或 codegen 阶段；
- 插件不得跨目录引用运行时代码，不得提交 `vendor/`、`node_modules/`、`dist/`、`build/`、`generated/` 或 package manager lockfile；
- 迁移账本中的源 hook ID、总数、摘要和固定排除集合由 CI 机械核验。

## 验证

日常离线验证：

```bash
AI_EXPERTS_SESSION_ID='<session>' \
AI_EXPERTS_TRIGGER_FROM='goal' \
SKIP_HOST_INSTALL=1 \
bash scripts/ci/validate-plugins.sh
```

需要真实双宿主会话时，在仓库规定的 Docker 环境运行：

```bash
./scripts/acceptance/run.sh
```

## 变更控制

重新引入已退役的 runtime 或其他 guard 插件属于新的范围决策，不能把历史迁移执行手册当作恢复依据。此类变更必须同时更新 Marketplace、迁移账本、固定排除集合、验收矩阵和验证证据。
