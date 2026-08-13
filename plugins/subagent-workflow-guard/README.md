# subagent-workflow-guard

`subagent-workflow-guard` 用磁盘上的 application 交接主 agent 和受治理的 subagent。Hook 按这份文件决定能不能派发、启动子进程、放开哪些工具、Result Card 过不过、父运行能不能关。

它取代旧的 `subagent-discipline`。`subagent-lifecycle-audit` 还是单独记所有 subagent 启停；本插件只存跟 application 绑在一起的工作流回执。

## 实际挡住什么

活动 governed run 里，主 agent 必须先登记一份一次性 application，而且宿主工具确实发出匹配的 `PreToolUse`，才能派发。绑在 application 上的 subagent 都交回有效 Result Card，review graph 校验通过后，才能用确定性命令把 run 标成完成。

```text
application artifact
  -> prepare receipt
  -> PreToolUse reservation
  -> SubagentStart 绑定 agent_id
  -> 有范围的工具决策
  -> SubagentStop terminal receipt
  -> review graph 校验
  -> 主 Stop 放行
```

`SessionStart` 只发布并恢复契约，不证明任务成功。`PostToolUse(Agent)` 只记录 dispatch observation；异步宿主可能在 `SubagentStop` 之前发出它。

## 运行流程

1. `subagent-plan-execution` 打开 governed run。
2. `subagent-handoff` 校验 application，将其复制到宿主插件数据目录，并返回一次性 marker：

   ```text
   SUBAGENT_APPLICATION <application-id> <nonce>
   ```

3. 对具备 Hook 链的 Agent 工具，`PreToolUse` 预留 marker。run 打开时，缺失、无效、重放、跨 run 或依赖未满足的 application 会被拒绝。
4. `SubagentStart` 将 reservation 绑定到真实 `agent_id`，并注入 application artifact 和 Result Card 契约。没有 reservation 的启动记为 `orphan-spawn`，必须返回 `NEEDS_CONTEXT`。
5. subagent 的 `PreToolUse` 拒绝嵌套 dispatch、reviewer/researcher 的全部 shell、reviewer 文件修改，以及 implementer `writeScope` 外的文件工具写入。
6. `SubagentStop` 要求 Result Card 各段非空，包含具体 evidence anchor、verification outcome 和 requested evidence term，之后才记录权威终态。`PostToolUse(Agent)` 只用于协调 dispatch。
7. 准备 final reviewer 时 seal application graph。主 `Stop` 在 run 打开时阻断，`run-close` 会拒绝陈旧 final review，之后才能返回 `DONE` 或 `DONE_WITH_CONCERNS`。

`SubagentStop` 只能校验 Result Card，不能替 subagent 创建它，也不能证明引用证据真实。文件工具 scope 只接受精确相对路径或 `directory/**`，会规范化已有符号链接，并拒绝解析到 workspace 或声明树之外的目标。

reviewer 和 researcher 没有文件修改或 shell 权限。implementer 的 shell 仍受宿主权限控制，不是路径级 sandbox。插件不能替代独立验证。

## 宿主能力边界

Claude Code 的 `Agent` 工具会打出完整 dispatch/start/stop Hook 链，才能在启动前拦住。Claude Code 2.1.170 会产生必需的 `PreToolUse -> SubagentStart -> SubagentStop` 链，live acceptance 已证明拒绝发生在启动前。

在已测试的 Codex 0.146 中，namespaced `collaboration.spawn_agent` API 不发出 dispatch `PreToolUse`，但会发出 `SubagentStart` 和 `SubagentStop`。因此插件无法在启动前阻止未注册 worker；`SubagentStart` 只能把缺少 reservation 的 worker 记录为 orphan 并注入恢复指令。修改 manifest matcher 不能创造缺失的 pre-dispatch 事件。Codex 仍不能在缺少 sealed review graph 时通过 workflow CLI 关闭为 `DONE`，但这不是 dispatch sandbox。Codex manifest 与 `SessionStart` 上下文都不能作为 pre-dispatch enforcement 证据。

## 状态、回执与关联

每个宿主使用自己的插件数据变量和目录。session 状态以 `session_id` 与 resolved workspace 的 SHA-256 为键，application 是独立的 `0600` JSON 文件；更新使用有界锁和原子 rename。

Claude `SessionStart` 通过宿主提供的 `CLAUDE_ENV_FILE` 保存精确 Hook session ID、权威 host 和已安装 plugin root。Codex 使用 `CODEX_THREAD_ID` 并解析插件缓存。普通 Skill 命令省略 `--host`；显式 host 与已保存平台冲突时 CLI 会拒绝。

没有显式 `--session` 的 CLI 命令会在仓库私有 Git 目录下、按 host/session hash 划分的位置写 `0600` request，即使交互 shell 暴露了 plugin data。只有携带同一 session 身份的后续 Hook 能重新校验并导入平台状态；其他 session 无法领取。畸形 mailbox 或持久状态 JSON/schema 会在 dispatch 与 parent `Stop` 处 fail-closed。

回执状态流为：

```text
prepared -> reserved -> bound -> delivered
              |
              +-> prepared  # SubagentStart 前 dispatch 失败
```

reservation 使用 application ID、随机 nonce、active run、session/workspace 状态、依赖，以及可用时的 `tool_use_id`。`SubagentStart` 通过 agent prompt 中重复的 marker 与真实 `agent_id` 绑定，不假设宿主在跨事件时重复 `tool_use_id`。

## Role 与 Review Graph

application role 可以是 `implementer`、`spec-reviewer`、`quality-reviewer`、`final-reviewer` 或 `researcher`。final reviewer 准备时会 seal 由 ID 与 artifact 构成的 graph digest，之后的新 application 和陈旧 final review 都会被拒绝。

成功关闭 run 要求：

- 每个 application 都已 delivered；
- 每个 implementer 都有已交付的 spec reviewer 和 quality reviewer；
- 存在一个绑定 sealed graph 的已交付 final reviewer。

orchestrator 将修复/复核限制为两轮，blocker/major finding 在独立 reviewer 复核前保持 open。最多只能同时存在三个 undelivered application；`prepare` 会拒绝未满足依赖和重叠 write scope。并行 writer 由 orchestrator 使用隔离 worktree，Hook 不把路径 matcher 冒充为进程隔离。

## 配置

无需项目配置。唯一公开设置是 Git 根目录的 `.subagent-workflow-guard.mjs`：

```js
export default {
  dispatch: "workflow",
};
```

| 值 | 行为 |
| --- | --- |
| `workflow` | governed run 打开时硬门禁匹配的 Hook-capable dispatch；普通 dispatch 只报告 |
| `block` | 每个匹配的 Hook-capable 主 agent dispatch 都必须有 application |
| `report` | 只报告无效 dispatch，不拒绝 |
| `off` | 关闭 dispatch 与 scope 决策 |

旧 `.subagent-discipline.*` 配置不会执行，存在时只输出迁移警告。

## 工作流 CLI

内置 Skill 调用 `scripts/subagent-workflow.mjs`。提供宿主插件数据和 session ID 后，命令可直接更新状态：

```bash
node "${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}/scripts/subagent-workflow.mjs" run-open \
  --host codex --session "$AI_EXPERTS_SESSION_ID" --cwd "$PWD" --run-id task-42

node "${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}/scripts/subagent-workflow.mjs" prepare \
  --host codex --session "$AI_EXPERTS_SESSION_ID" --cwd "$PWD" --file /tmp/subagent-application.json

node "${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}/scripts/subagent-workflow.mjs" run-close \
  --host codex --session "$AI_EXPERTS_SESSION_ID" --cwd "$PWD" --status DONE
```

只有在不携带平台环境的受控 Claude Code 脚本中才显式使用 `--host claude`。运行状态写在当前工作目录的 `.subagent-workflow/.state/<host>/`，权限为 `0600`，并带 `*` 的 `.gitignore`。显式 `--session` 走工作区状态；隐式平台 session 仍通过 Git mailbox bridge。

## 失败与恢复

- hard mode 中无效 dispatch：`PreToolUse` deny。
- 默认模式中的普通 dispatch：只注入软上下文。
- 无 reservation 的 spawn：注入 `orphan-spawn` 并要求 `NEEDS_CONTEXT`。
- Result Card 无效或无证据：`SubagentStop` 阻断一次，并尊重 `stop_hook_active` 避免永久循环。
- 父 run open：主 `Stop` 阻断，直到确定性关闭或精确用户 abort。
- 非治理类 Hook/runtime 异常：用英文诊断 fail-open，不写伪造回执。
- dispatch 或 parent `Stop` 处 mailbox 不可读或无效：fail-closed，避免损坏 bridge 绕过 active run。
- Agent 或已绑定 subagent 工具入口的持久状态不可读或无效：fail-closed。
- stale lock 会阻止 reservation 或 closure；确认没有 workflow CLI 或 Hook 进程活动后，只删除该状态文件相邻的 `.lock` 再重试。

## 从 `subagent-discipline` 升级

`scripts/install-all.sh` 会先删除旧 marketplace 插件，再安装当前 catalog，正常同步即可完成重命名。直接安装时运行：

```bash
claude plugin uninstall subagent-discipline@harness-start -s user -y
claude plugin install subagent-workflow-guard@harness-start -s user

codex plugin uninstall subagent-discipline@harness-start --json
codex plugin add subagent-workflow-guard@harness-start --json
```

迁移不会删除 `.subagent-discipline/` 或旧项目配置，审查后再自行归档或移除。

## 验证

在仓库根目录运行：

```bash
node --test plugins/subagent-workflow-guard/tests/*.test.mjs
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
./scripts/acceptance/run.sh --plugin subagent-workflow-guard
```
