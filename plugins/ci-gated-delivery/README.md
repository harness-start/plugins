# CI 门禁交付

`ci-gated-delivery` 提供一个公开 Skill：`ci-gated-mr-workflow`。它把短分支、本地验证、review、远端 CI 监督、merge gate、post-merge 判定和 workspace 收尾放在同一个状态机里，避免多个宽泛 Skill 在交付中途互相接管。

## 目标

让一次 MR/PR 交付始终绑定当前 repository 与 head SHA，显式区分本地验证、远端 CI、review、merge 和合并后状态。远端证据不可用时流程停在 `externally blocked`，不会用本地绿色结果替代 provider 事实。

## 实现

Skill 保存完整交付方法，但插件不创建持久台账。唯一的 `PreToolUse` Hook 机械拒绝缺少 head SHA 的 `gh pr merge`、`glab mr merge` 以及直接推送 `main`/`master`；远端状态由当前会话的 provider 工具或结构化 API 输出提供。所有 branch、commit、push、MR/PR、merge 和清理操作仍在执行前按用户授权边界确认。

Review 阶段使用有界 Task Brief 和 Result Card。Reviewer 只接收目标、非目标、允许文件、base/head、scoped diff 和验证证据，不接收完整会话、私有推理或其他 reviewer 的结论。

## 责任边界

插件只注册 PreToolUse，不保存交付台账，也不用 Stop 假装证明 CI。安装插件或启动会话不会进入交付工作流。

- PreToolUse 拒绝不含 head SHA 的 `gh pr merge`、`glab mr merge` 和推送 `main`/`master`；解析失败 fail-open。这不证明 required jobs 已绿。
- 本地 `git add`、提交信息、危险命令和 commit scope 由 `git-delivery` 负责；本插件不重复这些拦截。
- 远端事实必须来自当前会话里的 provider 工具或结构化 API 输出，并绑定 repository、head SHA、pipeline/run id 和观测时间。
- 没有远端回执、查询失败或权限不足时，Skill 要停在 `externally blocked`，不能用本地测试或格式化的证据卡替代。
- 成功 pipeline 必须绑定当前 MR/PR head SHA；旧 SHA 的绿色状态、未解决的 blocking discussion 或失败的默认分支 pipeline 都不能关闭交付。
- protected branch、approval policy、repository visibility 和 release policy 的变更不属于普通实现授权。

## 使用

- Codex：`$ci-gated-mr-workflow`
- Claude Code：`/ci-gated-mr-workflow`

只有用户为当前任务明确输入上述调用之一时，才进入完整流程。普通修改请求、项目指令、会话启动和说明性提及都不能隐式加载。进入流程后，branch、worktree、commit、push、MR/PR、merge 和删除分支分别在执行前展示准确操作并等待用户确认；worktree 必须由用户另外明确提出。

## 验证

```bash
# cwd: marketplace 仓库根目录
npx tsx --test plugins/ci-gated-delivery/tests/*.test.ts
bash scripts/ci/validate-plugins.sh
./scripts/acceptance/run.sh --plugin ci-gated-delivery
```

最后一条命令从宿主构建并运行 `docker/host-acceptance`，不会在宿主直接启动 Claude Code 或 Codex。
