# 候选插件：`gitlab-delivery-closure-guard`

| 字段 | 裁定 |
| --- | --- |
| 形态 | 新插件，建议目录 `plugins/gitlab-delivery-closure-guard/` |
| 优先级 | P1 |
| 默认安装 | 否；GitLab CI-gated 项目 opt-in |
| 目标 | 通过 GitLab 状态回读证明当前 HEAD 的 MR、pipeline 与 merge 闭环 |

## 合并裁定

本候选取代原 `git-delivery-closure-gate` 与 `gitlab-review-gate`。源仓 `delivery-closure-gate` 会从最终回复匹配 MR URL、pipeline success 和 merge commit 字样；这些文本可以被模型自行编造，不能作为 marketplace 的硬效果。`gitlab-review-*` 又依赖参数化 GitLab Tools 和 operational facts，不能直接移植。

保留的真实缺口是：`git-delivery` 只管本地 Git，不证明远端 GitLab 已接收、CI 已成功或 MR 已合并。

## 最小产品合同

- 只服务 GitLab，不同时抽象 GitHub provider。项目以 `.gitlab-delivery-closure.mjs` 显式启用，并要求 remote host、project identity 和 CI policy 可确定。
- 插件自带只读 `gitlab-delivery-snapshot`。它读取本地 repo/HEAD，并通过 `glab api` 的 GET 请求查询与该 HEAD SHA 精确绑定的 MR、head pipeline、merge 状态、merge commit 和可选 default-branch pipeline。
- snapshot 写入平台插件数据目录；receipt 包含 GitLab base URL、project ID、HEAD SHA、MR IID、pipeline ID/SHA/status、merge commit、观察时间、policy digest 和响应字段摘要。
- `PostToolUse` 在项目已启用且本地代码、配置或 Git HEAD 发生实际变化后记录 dirty revision；只读会话不 arm。
- `Stop` 不解析自然语言 URL/status。它在 dirty 且 policy 要求 closure 时直接调用只读 snapshot verifier 刷新世界状态，再比较 receipt 与当前 HEAD/policy；查询失败、非 terminal success、SHA 不符或过期时拒绝成功态。
- 凭据、Runner 或 GitLab 不可用时允许如实 `BLOCKED/NEEDS_CONTEXT`，不得把网络失败写成成功 receipt。
- v1 不执行 push、建 MR、评论、approve 或 merge；因此不需要原 `gitlab-review-mutation-guard`。所有外部 mutation 仍由用户或其他受控工具授权。

```text
项目显式启用且本轮发生代码/配置 mutation
  → PostToolUse 记录绑定本地 HEAD 的 dirty revision
  → Stop 调用只读 snapshot 同时观察本地 HEAD 与 GitLab 对象
  → receipt 将 MR/pipeline/merge 状态绑定到同一 SHA
  → Stop 重新核对 HEAD、policy 与 receipt
  → stale、缺项或远端非成功态拒绝 completion
```

## Hook / Skill 分工

- `PostToolUse` 拥有 dirty 激活，`Stop` 拥有远端读回和 closure 决策；成功不依赖 agent 主动记得运行 snapshot。
- 可选 `gitlab-delivery` Skill 只负责展示缺口、编排用户已授权的 push/MR 流程、手动刷新状态和生成恢复步骤。v1 的插件本身仍不执行远端 mutation。
- Skill 输出的 MR URL、pipeline 状态或“已合并”声明不进入可信状态；只有 `Stop` 调用的只读 verifier 能签发 closure receipt。

## 实现准入与验收

- 无配置、非 GitLab remote、只读会话、本地草稿 policy：完全 idle；
- 伪造最终回复中的 MR URL/`success`/merge SHA 不能解锁；
- receipt 的 project、host、HEAD、pipeline SHA、policy digest 任一不匹配均拒绝；
- MR pipeline 成功但未 merge、merge 后 policy 要求 default branch pipeline 且未成功：分别拒绝；
- 使用 fixture `glab`/HTTP server 做离线合同测试；Docker 两宿主不得访问真实生产 GitLab 或产生 mutation；
- 凭据和 API 响应正文不写入日志，honesty gate 在没有 snapshot Hook 证据时失败。

还要覆盖“没有调用 Skill 但远端状态满足时可闭环”和“调用 Skill 声称成功但 verifier 观察失败时仍拒绝”两条相反路径。

只有在读回链路能绑定 project + HEAD + pipeline SHA + merge commit 时才立项。若仍依赖最终回复正则，应删除而不是发布。
