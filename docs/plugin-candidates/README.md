# 插件候选审计结果

本目录只保留尚未实现、且在 Harness Start 中有明确落点的插件候选或现有插件扩展。审计日期为 2026-08-10；对照范围是 `harness-starter`、`ai-experts` 的当前源码，以及本仓现有插件。这里的“保留”表示值得进入实现评审，不表示已经排期或具备运行效果。

## 裁定标准

候选必须同时满足以下条件：

1. 能从宿主可观察事件建立到目标结果的可信因果链，不能把提示注入、自然语言格式或多一次模型回合作为效果证据。
2. 能做成自包含的 Claude Code / Codex 插件；不能依赖 `harness-starter` 的 registry、operational facts 或私有 MCP 才成立。
3. 已有插件能保持清晰边界地扩展时，不新增插件 ID。
4. 窄用户面的远端平台、运维和 SVN 能力默认不进入 `install-all`，或必须在没有项目配置时完全 idle。
5. 实现前必须能写出离线单测、Docker 双宿主 negative / positive / near-miss 场景，以及会在 Hook 未触发时失败的 honesty gate。

## 统一运行模型：Hook-first

候选统一采用以下职责分层。硬效果必须由宿主实际触发的 Hook 和插件自带的确定性程序建立，不能依赖模型是否阅读或遵循 Skill。

| 层 | 职责 | 是否构成可信门禁证据 |
| --- | --- | --- |
| `PreToolUse` | 解析即将执行的工具参数、目标路径和当前世界状态，在副作用前 allow / report / deny | 是；前提是输入、配置和判定都可机械复验 |
| `PostToolUse` | 读取落盘后的最终状态，记录 dirty/stale revision、finding 或观察回执 | 是；必须绑定实际字节、对象和 session |
| `Stop` | 重新读取当前状态，关闭已激活工作流或拒绝不满足合同的成功态 | 是；不得从最终回复正则推断完成事实 |
| `SessionStart` | 恢复已存在且可验证的在途状态，注入最小 resume 信息 | 只证明状态被观察，不替用户选择工作流 |
| 插件自带 CLI / MCP / validator | 执行确定性解析、CAS 更新、只读远端查询或 evidence seal | 是；调用必须留下可验证 provenance |
| Skill | 显式启动、配置、步骤编排、诊断解释和恢复入口 | 否；Skill 文本、模型声明或调用顺序本身不能解锁 Hook |

推荐链路是：Skill 帮助用户进入工作流 → 确定性工具创建可信激活状态 → Hooks 持续观察和约束 → `Stop` 从当前世界状态闭环。纯被动安全规则不必为了形式完整额外创建 Skill。

## 保留清单

| 优先级 | 文档 | 交付形态 | 裁定 |
| --- | --- | --- | --- |
| P0 | [long-task-ledger-gate.md](./long-task-ledger-gate.md) | 新插件 | 保留；跨会话账本需要独立状态机、CAS 写入和恢复入口 |
| P0 | [project-instruction-custody.md](./project-instruction-custody.md) | 新插件 | 保留；只管根级指令文件被修改后的结构校验与回执 |
| P1 | [external-skill-supply-chain.md](./external-skill-supply-chain.md) | 新插件 | 保留；全局安装阻断与隔离静态审计是独立安全边界 |
| P1 | [spec-workflow-gate.md](./spec-workflow-gate.md) | 新插件 | 保留；固定 `.specs` 产物图可做确定性前置门禁 |
| P1 | [gitlab-delivery-closure-guard.md](./gitlab-delivery-closure-guard.md) | 新插件 | 合并原两个 GitLab / delivery 候选；只做 GitLab 远端交付状态回读 |
| P1 | [command-safety-infrastructure-packs.md](./command-safety-infrastructure-packs.md) | 扩展 `command-safety-guards` | 不新增 `infra-ops-safety`；按 provider 拆成可开关引擎 |
| P2 | [design-contract-guard.md](./design-contract-guard.md) | 新插件 | 收窄为可机械检查的 DESIGN.md token 漂移；不宣称证明 a11y |
| P2 | [research-content-audit-profile.md](./research-content-audit-profile.md) | 扩展 `research-provenance-guard` | 不新增内容审计插件；复用既有 capture / anchor / seal |
| P2 | [svn-delivery-guards.md](./svn-delivery-guards.md) | 新插件、opt-in | 保留；SVN 命令面与 Git 分离，规则可自包含实现 |

## 已删除或合并

| 原候选 | 处理 | 原因 |
| --- | --- | --- |
| `completion-evidence-gate` | 删除 | 通用自然语言完成声明没有权威证据源；外部 effect gate 又依赖源仓 tool registry，移植后只剩可伪造 receipt。现有 `git-state-evidence-guard` 和领域 delivery guard 已覆盖可确定声明。 |
| `tdd-sequence-gate` | 删除 | “某测试失败 → 某源码被改 → 某测试通过”的会话时序不绑定 public seam、测试资产或生产字节，不能证明 TDD 目标成立；`behavioral-regression-guard` 已提供更强的 BEFORE / AFTER 指纹与回执。 |
| `git-delivery-closure-gate` + `gitlab-review-gate` | 合并并改名 | 源实现依赖 GitLab 和 operational facts；按 GitLab 单平台收口，删除只检查最终回复中 URL/status 字样的弱路径。 |
| `infra-ops-safety` | 改为现有插件扩展 | 都是 shell `PreToolUse` 风险判断；独立插件会复制 tokenizer、配置与 deny 升级逻辑。 |
| `content-credibility-gate` | 改为现有插件扩展 | 与研究插件共享 source snapshot、anchor、typed claim 和 seal，独立证据栈会重复且容易产生两套互不兼容的 provenance。 |
| `design-contract-delivery-guard` | 收窄并改名 | 仅有计划或 receipt 不能证明无障碍结果；先保留确定性的 token/spacing 漂移检查。 |

## 共同实现约束

- Codex Hook 和候选自带工具脚本必须显式设置 `AI_EXPERTS_SESSION_ID` 与 `AI_EXPERTS_TRIGGER_FROM`；可信回执必须拒绝缺失 provenance 的调用。
- 配置、状态和回执按 Claude Code / Codex 各自的数据目录存放；项目产物可以共享，但不得混用宿主环境变量或 Hook 载荷字段。
- receipt 至少绑定 workspace identity、session、目标文件或远端对象、观察时间和内容摘要；agent 可随手写出的 JSON 不算独立证据。
- `Stop` 只在插件已由配置、显式工作流或有效在途状态激活时阻断；普通会话必须 idle。
- Skill 不拥有 allow/deny、dirty 清理、receipt 签发或 completion 解锁权限；这些动作必须落到 Hook 或插件自带的确定性工具。
- 每份实现设计都要列出 Hook 拓扑、可信状态 owner 和 Skill 入口；如果移除 Skill 后硬门禁随之失效，说明职责仍然放错了层。
- 每项实现都遵循 contract → RED/基线 → 最小实现 → targeted verification → full verification → adversarial review。

相关已实现边界见 `../artifact-delivery-guards.md`、`../acceptance-matrix.md` 和 `../host-acceptance.md`。
