# ci-gated-delivery

`ci-gated-delivery` 提供一个公开 Skill：`ci-gated-mr-workflow`。它把短分支、本地验证、review、远端 CI 监督、merge gate、post-merge 判定和 workspace 收尾放在同一个状态机里，避免多个宽泛 Skill 在交付中途互相接管。

## 责任边界

插件不注册 Hook，也不保存交付台账。

- 本地 `git add`、提交信息、危险命令和 commit scope 由 `git-delivery-guards` 负责；本插件不重复这些拦截。
- 远端事实必须来自当前会话里的 provider 工具或结构化 API 输出，并绑定 repository、head SHA、pipeline/run id 和观测时间。
- 没有远端回执、查询失败或权限不足时，Skill 要停在 `externally blocked`，不能用本地测试或格式化的证据卡替代。
- protected branch、approval policy、repository visibility 和 release policy 的变更不属于普通实现授权。

没有 provider-bound observation 时，`Stop` Hook 只能检查字段是否填写，无法证明 MR、review 或 CI 成功。插件因此把硬授权继续交给 GitLab/GitHub 和 protected-branch policy，把诚实边界写进 Skill，并通过双宿主 acceptance 检查结果，而不是强制多一次模型回合。

## 使用

- Codex：`$ci-gated-mr-workflow`
- Claude Code：`/ci-gated-mr-workflow`

项目指令已明确要求代码或配置走 CI-gated delivery 时，也可以隐式加载。只读分析、本地草稿和允许直推的微小文档修改不进入完整流程。

## 验证

```bash
# cwd: marketplace 仓库根目录
node --test plugins/ci-gated-delivery/tests/*.test.mjs
bash scripts/ci/validate-plugins.sh
./scripts/acceptance/run.sh --plugin ci-gated-delivery
```

最后一条命令从宿主构建并运行 `docker/host-acceptance`，不会在宿主直接启动 Claude Code 或 Codex。
