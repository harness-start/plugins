# verification-provenance-guard design

## Objective

把完成态中的验证标签升级为可机器核验的有限事实，并验证 challenge、mutation、最终验证之间的可观察顺序。插件不判断任意自然语言中的“实现正确”，只验证事件顺序和受支持 predicate 与证据的一致性。

## Lifecycle

| Hook | Responsibility |
| --- | --- |
| `SessionStart` | 注入 reporting Skill 和 manifest 协议提示，初始化 session/workspace 状态 |
| `UserPromptSubmit` | 推进 prompt epoch；识别用户独立提交的 `# verification-abort` |
| `PostToolUse` | 文件/工作区变更推进 revision；记录验证/CI receipt |
| `PostToolUseFailure` | Claude 侧记录失败 receipt，防止失败结果被冒充成功 |
| `Stop` | 检测触发条件，严格解析 manifest，绑定正文结论并独立验证证据 |

状态按 session + workspace 哈希隔离，只保留 mutation 类别、事件序号、prompt epoch、命令哈希、命令分类、结果、解析后的有限统计、revision 和 CI 公共元数据。mutation 与 receipt 各最多 100 条，超过两小时自动失效；不保存 prompt、原始路径、命令输出或文件内容。

## Workflow invariants

- `code_behavior`：测试 mutation 在前，解析到至少一个失败测试的 RED receipt 居中，生产 mutation 在后，最终完整验证含当前成功测试 receipt。
- `code_refactor`：第一次代码 mutation 之前存在 GREEN receipt，最后 mutation 之后同一规范化命令再次成功。
- `non_code`：challenge 可以是 negative check、dry-run、counterexample 或有依据的 not-applicable；语义判断保持 inferred/unverified。
- 混合任务只要含代码或 unknown mutation，就不能声明为 `non_code`。
- RED/基线属于历史过程证据；最终命令必须同时匹配最新 revision 与当前 prompt epoch。artifact 和 Git 在 Stop 时读取当前状态。

## Trigger

默认 `mutation-or-claim`：本会话观察到文件/工作区变更，或回复出现测试/CI/Git/产物正面结论时强制 manifest。发生 mutation 后要求 v2；v1 仅兼容无 mutation 的旧 claim-only 响应。`claim-only` 只检查结论，`always` 检查所有 Stop；普通问答在默认模式下放行。

## Verification boundaries

- Command：命令哈希、明确结果、可靠 shell 形态、分类、revision 和 prompt epoch 必须匹配。缺少明确退出状态记录为 unknown。`expected_failure` 只接受解析到失败测试数或项目明确配置的失败形态，且只能作为 challenge。
- Artifact：仅 workspace 内普通非 symlink 文件；Stop 时重新核对 size、SHA-256 和基本格式，默认上限 64 MiB。
- Git：Stop 时用有界只读 Git 命令核对 HEAD、branch、clean。
- CI：只接受本会话从结构化 `glab`/`gh` 输出解析的 `success + id + sha + url`；Stop 不主动联网。
- Inference：`inferred`/`unverified` 是诚实边界，不会被提升为 verified。

JSON block 最大 32 KiB、深度 8、claims/evidence 各 20 条；重复 JSON key、重复/全角 ID、未知字段、悬空或未使用 evidence、正文 statement 不一致均拒绝。

## Recovery and failure mode

默认 `block`。阻断消息给出 delivery/reporting Skill 与修复合同，证据状态保留。`stop.maxBlocks` 后仅缩短提示，格式、顺序或证据错误仍阻断。只有非预期内部错误 fail-open。用户可独立提交 `# verification-abort` 清除活动状态；模型输出不能授权自己绕过。

## Non-goals

- 证明任意业务语义、设计质量或实现完整性。
- 在 Stop 阶段运行测试、访问网络或修改产物。
- 验证 workspace 外路径、目录、symlink 或超限文件。
- 接受无法由插件观察到的通用 Tool 标签作为 verified evidence。
- 阻止每一次写操作；本版本在 mutation 后提示顺序风险，并在 Stop 硬阻断无效完成态。
