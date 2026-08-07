# verification-provenance-guard design

## Objective

把完成态中的验证标签升级为可机器核验的有限事实。插件不判断任意自然语言中的“实现正确”，只验证以下 predicate 与证据的一致性：测试/验证命令成功、产物当前存在且摘要一致、Git 当前状态一致、CI 结构化结果成功。

## Lifecycle

| Hook | Responsibility |
| --- | --- |
| `SessionStart` | 注入 reporting Skill 和 manifest 协议提示，初始化 session/workspace 状态 |
| `PostToolUse` | 文件/工作区变更推进 revision；记录验证/CI receipt |
| `PostToolUseFailure` | Claude 侧记录失败 receipt，防止失败结果被冒充成功 |
| `Stop` | 检测触发条件，严格解析 manifest，绑定正文结论并独立验证证据 |

状态按 session + workspace 哈希隔离，只保留命令哈希、命令分类、结果、解析后的有限统计、revision 和 CI 公共元数据。最多 50 条 receipt，超过两小时自动失效；不保存原始路径、命令输出或文件内容。

## Trigger

默认 `mutation-or-claim`：本会话观察到文件/工作区变更，或回复出现测试/CI/Git/产物正面结论时强制 manifest。`claim-only` 只检查结论，`always` 检查所有 Stop；普通问答在默认模式下放行。

## Verification boundaries

- Command：命令哈希、成功结果、可靠 shell 形态、分类和 revision 必须匹配。`|| true`、无 pipefail 管道、修复/写回参数、输出重定向，以及验证后继续执行其他命令均不构成证据；可能写工作区的组合命令同时推进 revision。
- Artifact：仅 workspace 内普通非 symlink 文件；Stop 时重新核对 size、SHA-256 和基本格式，默认上限 64 MiB。
- Git：Stop 时用有界只读 Git 命令核对 HEAD、branch、clean。
- CI：只接受本会话从结构化 `glab`/`gh` 输出解析的 `success + id + sha + url`；Stop 不主动联网。
- Inference：`inferred`/`unverified` 是诚实边界，不会被提升为 verified。

JSON block 最大 32 KiB、深度 8、claims/evidence 各 20 条；重复 JSON key、重复/全角 ID、未知字段、悬空或未使用 evidence、正文 statement 不一致均拒绝。

## Recovery and failure mode

默认 `block`。阻断消息给出 reporting Skill 与修复合同，证据状态保留。递归 Stop 仍重新验证，最多阻断两次；随后 fail-open 并输出明确警告，避免无限循环。非预期内部错误 fail-open，但格式或证据错误是预期拒绝，不会被吞掉。

## Non-goals

- 证明任意业务语义、设计质量或实现完整性。
- 在 Stop 阶段运行测试、访问网络或修改产物。
- 验证 workspace 外路径、目录、symlink 或超限文件。
- 接受无法由插件观察到的通用 Tool 标签作为 verified evidence。
