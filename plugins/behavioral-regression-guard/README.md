# Behavioral Regression Guard

`behavioral-regression-guard` 提供与语言无关的 Skill 和 Hook 工作流，用于证明缺陷修复确实改变目标行为、通过对抗用例，并保持声明的兼容性。

`SessionStart` 只发布一句无标题的能力提示。插件不在 `UserPromptSubmit` 猜测意图；当测试或复现型命令产生可观察失败后，才临时阻断生产文件写入，同时继续允许测试和 `.behavioral-regression/BR-*.json` 契约写入。有效契约绑定后，生产写入还要等到全部 BEFORE 回执冻结，避免“先改代码、再补基线”。

失败候选激活后，当前契约的嵌套 proof root（`.behavioral-regression/<id>/...`）也始终可写，因此既可以先搭探针再复现，也可以先复现再补齐隔离探针。即使诊断 Shell 预算已经耗尽，现有受管 proof 仍可通过一条无串联、无重定向、无 inline-code 的直接命令执行，然后再绑定契约；普通诊断命令继续被拒绝。该直接命令只接受受限解释器参数和真实的受管文件，拒绝执行环境劫持；失败候选武装时冻结的工作树摘要还会阻止 proof 在运行中偷改生产文件并把改后字节冒充基线。

若原始任务明确禁止外部网络，PreToolUse 会拒绝常见源码下载命令以及 Claude WebSearch/WebFetch；一次无效契约写入不会解除该约束或清除已武装的失败候选，避免未来发行版或已知修复污染本地派生的行为 oracle。

## 因果契约

```text
已知行为不一致
  -> 测试或复现命令产生可观察失败，临时武装写入关口
  -> Skill 声明公共入口、既有约束原语、输入形态、组合深度、语义特征和兼容义务
  -> schema 根据形态要求主用例、挑战矩阵与不变量覆盖
  -> 显式修改契约，激活一次带租约的运行
  -> 精确直接命令和字面签名生成 BEFORE 回执
  -> PreToolUse 确认每个声明用例都有匹配的 BEFORE 回执
  -> 高风险 Claude 流程由独立 oracle reviewer 派生行为并尝试反例
  -> 生产文件字节偏离基线
  -> 未变化的验证文件和精确命令生成 AFTER 回执
  -> 不同的 patch reviewer 对当前指纹做对抗复核
  -> Stop 重新计算指纹并校验所有回执引用
  -> 只有当前字节上的新鲜证据才能关闭流程
```

仅激活 Hook 不能证明插件有效。结果级证据由必需的字面输出、显式结果依据、不可变计划摘要、命令哈希、生产文件指纹、验证文件指纹、用例 ID、阶段、契约 ID 和运行 epoch 共同构成。Claude 回执通常绑定宿主提供的退出状态或失败事件；Codex unified exec 的 `PostToolUse` 只暴露精确命令和原始响应文本，不暴露退出状态，因此回执标为 `literal-oracle`，并依赖冻结验证资产中的阶段专用签名。

## 触发与失败策略

- Skill metadata 可路由已知缺陷、回归、兼容性和行为变更请求，但加载 Skill 本身只提供指导。
- 插件不设置 `UserPromptSubmit` Hook；`SessionStart` 只做有限发现，不进行绑定。
- 新契约使用 `behavioral-regression/v11`，继承 v10 的语义、签名、交互矩阵与因果 witness 约束。v11 必须以 metadata 声明目标行为本身被取代的旧 expected literal：完整 before/after 断言描述、按顺序位于 expected 之前的输入 JSON、独立顶层 expected operand、期望 JSON 与 ordering scenario 必须一一对应；真正的项目测试必须保持 Git baseline 原字节不变，public-seam RED 来自隔离的 managed bundle。任何候选测试改写、调用改写、断言弱化、多对一替换或额外基线增删均被拒绝，且比较不受 diff attribute、textconv 或形似 diff header 的代码影响。
- 多组件 representation seam 可选择三种证据模型：合法单组件退化使用完整 `component-matrix`；只能共同退化的域约束输入使用 `coupled-boundary`，由同一次真实调用绑定全部组件和结果；真正同质且空贡献者中性的聚合使用 `homogeneous-neutrality`。`coupled-boundary` 不能用来跳过公开 seam 实际支持的 partial-peer 情形。
- v10 relational locator 只接受“互异组件实参 → 单次 seam 调用 → 结果纯投影 → 单次 witness”的受限执行链；布尔 fallback、重复 marker、第二次 populated 调用、组件重绑和结果变异都不能签发证据。
- Claude 对 ordering、concurrency、three-or-more composition、multi-component 和 variadic representation 派生双独立审查：BEFORE 后的 oracle reviewer 与 AFTER 后的 patch reviewer 必须来自不同真实 subagent 生命周期。oracle reviewer 只收到 answer-free challenge inputs；Result Card 必须逐项返回独立推导的 expected 与不同的被否决 shortcut，机器可校验结果直接使用原始 JSON 值，不能把数组或对象包在说明字符串里。Hook 会机械复算 conforming ordering 与 supersession 样例；若 reviewer 独立推导出不同结果，则必须用结构化 `contract-conflicts` + `challenge` 触发 replan，而不是被迫回显合同答案。每次恢复都会重发原类型、原值的冻结输入但不泄露答案，并只接受唯一的末行 Result Card。复制 challenge id、泛化 counterexample 或自报 disposition 都不能替代可复算结果。普通 `SubagentStop` 不触发父流程 Stop。Codex 当前缺少完整 dispatch/start 链，因此只做 advisory。
- 测试运行器、带测试/复现语义的命令，或输出明确失败签名的临时运行命令可以武装候选关口；即使应用只打印普通 `WARNING:` 文本而不打印异常类名，明确的冲突/相反顺序语义仍会被识别。ad-hoc 语言运行命令在执行前暂存工作树摘要，干净且未改变工作树的同命令重放才会清除候选状态。候选已武装后，换一种失败复现只会更新观察摘要，不会重置诊断预算、恢复拒绝计数或初始快照。
- 候选关口拦截可解析的文件修改工具，也会在 shell 含明确写入原语时复用同一前置判定。行为失败后允许六条额外 shell 诊断，并在第三条后做一次节流提醒；预算耗尽后，Read/Glob/Grep、proof 文件创建以及 `.behavioral-regression/BR-<id>/` 下现有 proof 的单条直接运行仍可继续，随后必须绑定 Skill/契约。重复提交被拒的 Shell 时，恢复文案会明确上一命令未执行，并在第三次要求下一动作必须用 `Write`/`Edit` 创建 bundle。串联、重定向、inline-code、解释器/环境劫持或非受管 Shell 仍被拒绝；若 proof 改变了候选武装时的声明生产文件，契约激活也会失败。一般测试、fixture、spec 和契约路径仍可通过文件工具写入，但被 v11 选为 `regressionPath` 的项目测试始终是 Git-baseline 证据，不得修改。两小时无活动后候选状态自动过期。
- 缺少命令、超时、未知结果和普通成功输出不会武装关口；空闲发现、状态目录不可用或运行错误均 fail-open。
- 有效契约绑定后，修改其生产范围前必须先生成并引用全部 BEFORE 回执；未声明的生产路径要求重新冻结范围和基线。
- 已绑定契约缺失、格式错误或状态损坏时，`Stop` fail-closed；`paused` 和 `aborted` 只能在生产仍处于冻结基线时释放 Stop，不能携带未完成、未验证的生产改动退出，也不会解除声明 production path 的写保护。继续修复必须以新 epoch 重新打开并重建证据。
- 超时、未知结果、缺少命令和 Hook 错误都不能计为 RED 或 GREEN；常见的尾随 `; echo "name=$?"` 会恢复为底层命令及真实退出码。
- 至少一个主用例必须从失败转为成功；所有结果发生变化的用例都要声明不同的 BEFORE/AFTER 字面签名。
- v3 契约必须同时绑定实际公共入口和既有约束原语，并区分单输入、多组件和可变参数输入。多组件必须覆盖全有效、全退化和逐个退化；可变参数必须覆盖 0、1、2 和多输入。
- 三层以上组合若暴露了中间结果制造的伪约束，无论表层输入形态如何，都必须直接验证既有约束原语的 0、1、2 和多输入行为，不能用新 helper 旁路原语契约。
- 排序、表示、错误、状态、组合和并发语义会分别扩展必需的结构化覆盖；内部 helper 的测试不能替代公共入口兼容性。

## 完整性边界

- 生产与验证范围只接受显式、有限的普通文件；拒绝路径穿越、重复项、绝对路径和符号链接。
- BEFORE 只能绑定激活时的生产文件指纹；第一条 BEFORE 回执会冻结验证资产，文件工具或可识别 shell 写入会被前置拒绝，任何旁路产生的字节漂移仍会清空回执并使运行失效。
- `PreToolUse` 在生产写入前核对当前契约引用与 Hook 签发的全部 BEFORE 回执；文件工具与包含 `open(..., 'w')`、重定向、`tee`、`sed -i`、`writeFile` 等明确写入原语的 shell 共用此门，仅在证据完整匹配时释放生产修改。
- AFTER 绑定修改后的生产文件指纹；之后再次修改源码会使其过期。
- 高风险 Claude 的 oracle approval 绑定基线生产指纹；patch approval 绑定修改后指纹，且两个 agent id 必须不同。workspace 内自写 review 文件没有解锁作用。
- 修改生产文件前改变计划会重置回执；修改后改变计划必须先还原或中止。
- 共享运行记录只允许一个活动租约；单步 epoch 恢复会保留有效 BEFORE 回执并清除 AFTER 回执。

该插件与 `debugging-workflow-guard` 互补：后者确定问题是什么，本插件证明修复后的行为和受保护不变量。两者可以观察同一条直接测试命令，不会包装或改写命令。
