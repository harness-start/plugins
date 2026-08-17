# ci-gated-delivery

`ci-gated-delivery` 提供一个公开 Skill：`ci-gated-mr-workflow`。它把短分支、本地验证、review、远端 CI 监督、merge gate、post-merge 判定和 workspace 收尾放在同一个状态机里，避免多个宽泛 Skill 在交付中途互相接管。

Review 阶段使用有界 Task Brief 和 Result Card。Reviewer 只接收目标、非目标、允许文件、base/head、scoped diff 和验证证据，不接收完整会话、私有推理或其他 reviewer 的结论。

## 责任边界

插件注册 SessionStart 与 PreToolUse，不保存交付台账，也不用 Stop 假装证明 CI。

- SessionStart 只注入交付状态机，要求使用本插件 `$ci-gated-mr-workflow`。
- PreToolUse 拒绝不含 head SHA 的 `gh pr merge`、`glab mr merge` 和推送 `main`/`master`；解析失败 fail-open。这不证明 required jobs 已绿。
- 本地 `git add`、提交信息、危险命令和 commit scope 由 `git-delivery` 负责；本插件不重复这些拦截。
- 远端事实必须来自当前会话里的 provider 工具或结构化 API 输出，并绑定 repository、head SHA、pipeline/run id 和观测时间。
- 没有远端回执、查询失败或权限不足时，Skill 要停在 `externally blocked`，不能用本地测试或格式化的证据卡替代。
- 成功 pipeline 必须绑定当前 MR/PR head SHA；旧 SHA 的绿色状态、未解决的 blocking discussion 或失败的默认分支 pipeline 都不能关闭交付。
- protected branch、approval policy、repository visibility 和 release policy 的变更不属于普通实现授权。

## 使用

- Codex：`$ci-gated-mr-workflow`
- Claude Code：`/ci-gated-mr-workflow`

项目指令已明确要求代码或配置走 CI-gated delivery 时，也可以隐式加载。只读分析、本地草稿和允许直推的微小文档修改不进入完整流程。

## 验证

```bash
# cwd: marketplace 仓库根目录
npx tsx --test plugins/ci-gated-delivery/tests/*.test.ts
bash scripts/ci/validate-plugins.sh
./scripts/acceptance/run.sh --plugin ci-gated-delivery
```

最后一条命令从宿主构建并运行 `docker/host-acceptance`，不会在宿主直接启动 Claude Code 或 Codex。
