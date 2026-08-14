# reasoning-discipline-guard

`reasoning-discipline-guard` 在 `SessionStart` 发一句窄路由说明，并带一份 `reasoning-discipline` Skill。只有这份 Skill 真正写出工作流文件后，Hook 才会按文件顺序检查分析过程。

路由只建议 proof、worst-case、需要区分假设的 causal inference，以及没有直接可执行 oracle 的 high-impact decision 使用 Skill。普通代码或插件审查已有直接测试、静态检查或可复现 oracle 时不自动激活，避免把常规实现工作拖进五阶段流程。

路由只是提醒。没有 `.reasoning-discipline/*/workflow.md` 时，`Stop` 什么也不做。真正开门的是写出这个文件，不是加载 Skill，也不是 prompt 正则。

Skill 还要求 artifact 中由 agent 编写的自然语言值跟随明确输出语言、活动会话 profile 或当前用户消息的主要语言。这个要求覆盖 JSON 等机器块里的问题、假设、证据、挑战和结论；schema、key、枚举、ID、标识符、代码、命令、路径、原文引用与常用专业术语保持原样。模板里的英文占位文本只解释字段含义，不是默认输出语言。

已经激活时，`Stop` 只看当前文件是否符合配置的结构和顺序。回执对、格式对、多跑几轮模型，都不等于答案对。

## 五个阶段怎么接

```text
SessionStart 路由契约
  -> 模型为适用任务选择 Skill
  -> 单独写入 workflow.md
  -> Hook 绑定 workspace、workflow ID 和 epoch
  -> 五个独立 PostToolUse 事件
  -> challenge / cross-check 由不同 agent_id 的只读子代理审批后才能签发 RD-R3 / RD-R4；Codex child-session 通过受校验 transcript 自动映射到父会话并接收 nonce/evidence
  -> 分支校验和来源关联的可观察性检查
  -> 有限划分分配重放全部联合隐藏响应
  -> receipt 与 SHA-256 链
  -> 工作流以 RD-R5 关闭
  -> Stop 重算文件并允许输出结论
```

五个分别签名的 artifact 必须依次完成：

1. 框定假设、带独立固定 component 的 typed strategy variable、control assignment，以及有证据支持的行动时可观察性；
2. 按 exact、causal 或 decision 契约分析；exact 工作流必须按执行顺序写出 fixed/exists/forall quantifier，并针对环境变化评估每个固定参与者 strategy；
3. 用分支适用的攻击挑战候选；exact control challenge 必须保留 frame 中的 strategy assignment；
4. 用独立方法 cross-check 并独立搜索每个 strategy；有限划分分配由有界机器模型重放，非分配类工具证据只能作为 supporting metric；
5. 给出结论，并写清还不确定什么。

Hook 校验结构、顺序、引用、每阶段 SHA-256 和会话回执。exact frame 还要求所有声明行动时可观察性的 given 以 `observable: true` 出现在 positive observability audit；只有标为 `user-verbatim` 且明确说明不可选择的 given 才能阻断该信号，模型推断的后果不能替代用户原话。

对 `finite-partition-allocation`，守卫枚举联合隐藏响应并验证声明的最优值。每次搜索都要声明数值目标是最终答案还是辅助证据，避免分数覆盖语义算法结论。标为 `exact-payload` 的 conclusion 必须与最终回复完全相同，严格单值格式不能附加状态文字或解释。其他结构有效的 artifact 也不会因此自动成为语义事实。

## 分支契约

- `exact`：要求显式 control assignment、具名 strategy component、有序 quantifier 模型、固定 strategy 对全部环境变量的评估、依赖推导、边界或反例攻击、control-assignment 与 quantifier-order 专项攻击，以及独立推导或确定性 solver 检查。所有 allocation 还要执行独立 strategy search，最优 assignment 必须与 analysis 一致；有限容量划分还要提供来源关联的机器模型。
- `causal`：要求 observation、至少两个可证伪 hypothesis、区分性测试、alternate-hypothesis/counterfactual 攻击，以及 controlled 或独立因果检查。
- `decision`：要求 objective、constraint、至少两个 option、criterion/evaluation、failure-mode/sensitivity 攻击，以及 sensitivity 或 scenario analysis。
- 每个 conclusion 声明 `free-form` 或 `exact-payload`。后者把严格用户输出格式转换为 `Stop` 时对 receipt-bound conclusion 的相等性检查。

branch registry 是唯一预期扩展入口。新增分支前必须定义 analysis、challenge 与 cross-check validator，并补齐路由和 acceptance case。

## 产物与生命周期

```text
.reasoning-discipline/<yyyyMMdd>-<short-slug>/
├── workflow.md
├── 01-frame.md
├── 02-analysis.md
├── 03-challenge.md
├── 04-cross-check.md
└── 05-conclusion.md
```

首次激活时，插件把 `/.reasoning-discipline/` 写入仓库本地 `.git/info/exclude`，不修改项目 `.gitignore`。

- `open`：本轮结束前必须写入下一阶段。
- `paused`：提供 `resume.nextStage` 和具体 `resume.nextAction` 后可以交付已签章的阶段事实；明确声称 verified answer/conclusion/root cause 仍会被阻断。
- `closed`：要求当前、有序的 `RD-R1` 到 `RD-R5` 回执，并设置 `completionReceipt: "RD-R5"`。
- `aborted`：释放工作流，但不能声称已有 verified conclusion。

修改已接受阶段会使该阶段及所有下游回执失效，必须按顺序重写。跨会话恢复 paused 工作流时，要增加 `run.epoch`、重新打开 manifest，并让 `currentStage` 与 `resume.nextStage` 指向首个未完成阶段；绑定会重算全部早期 artifact，只恢复有效回执前缀。

## Hook、状态与完整性

| 事件 | 行为 |
| --- | --- |
| `SessionStart` | 发布路由契约并报告发现的工作流，不绑定 |
| `PostToolUse` | 绑定 `workflow.md`、校验单次阶段修改并签发下一回执 |
| `PostToolUseFailure` | 确认失败的 artifact 写入没有推进状态 |
| `Stop` | 阻断 open、无效、陈旧或未完整关闭的工作流 |

没有 `UserPromptSubmit` classifier，也没有业务文件写屏障。紧凑或只允许最终值的回复格式不会豁免工作流；证据保留在 artifact 中，最终回复仍遵循用户格式。

artifact 必须通过宿主可观察文件通道写入：Codex 使用 `apply_patch`，Claude Code 使用 Write/Edit，每次调用只写一个 artifact。shell 写入不能推进回执链。

Hook 状态写在当前工作目录的 `.reasoning-discipline/.state/`，按 `sessionId` 的 SHA-256 分文件，并带 `*` 的 `.gitignore`。它包含绑定路径、不可变 workflow ID 和 branch、epoch、有序回执、claim ID 与文件摘要。manifest 和每个阶段都必须恰好有一个 canonical fenced JSON 块，未知字段会被拒绝。`Stop` 重载所有文件并重算摘要，手工伪造 `completionReceipt` 无效。

状态损坏或过期时 fail-open 到 idle，避免困住无关工作；可读但已绑定的 manifest 会 fail-closed，直到修正、暂停或中止。artifact 只需保存精简 premise、claim、test 和 conclusion，不要求泄露私有 token-level reasoning；机器块外的叙述可选且不作为证明。

## 非目标

- 在 `UserPromptSubmit` 分类或阻断单个 prompt；
- 阻断生产或业务文件编辑；
- 在有限 `finite-partition-allocation` 重放契约外证明语义真值、最优性或因果有效性；
- 替代确定性 solver、测试、测量或权威来源；
- 默认把 artifact 目录纳入版本控制。

## 本地验证

在 marketplace 根目录运行：

```bash
node --test plugins/reasoning-discipline-guard/tests/*.test.mjs
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
```
