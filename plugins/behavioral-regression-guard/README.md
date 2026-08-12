# Behavioral Regression Guard

`behavioral-regression-guard` 用与语言无关的契约证明：缺陷在修改前可复现，修复后目标行为发生了预期变化，而挑战用例和兼容性用例仍然成立。

插件不会根据普通 prompt 猜测意图。`SessionStart` 只发布简短能力提示；测试或复现命令产生可观察失败后，Hook 才临时保护生产文件，等待 `.behavioral-regression/BR-*.json` 契约和修改前证据。

## 工作流程

```text
复现失败
  -> 建立隔离 proof 和 v11 契约
  -> 冻结全部 BEFORE 回执
  -> 修改声明的生产文件
  -> 运行同一组验证并取得 AFTER 回执
  -> 高风险 Claude 流程完成独立复核
  -> Stop 重算指纹并检查证据新鲜度
```

修改前的失败、修改后的成功、验证命令、生产文件、验证文件和契约 epoch 会一起绑定。只激活 Hook、补写说明或让普通测试变绿，都不能代替这条因果链。

## 使用要点

- 新契约使用 `behavioral-regression/v11`，保存在 `.behavioral-regression/<id>.json`；隔离 proof 放在 `.behavioral-regression/<id>/`。
- 契约必须声明公共入口、既有约束入口、生产范围、验证范围、项目回归测试和四个用例：一个主用例、两个不同维度的挑战用例、一个兼容性不变量。
- 项目已有回归测试是 Git 基线证据，不能为制造 RED 而改写；RED 应来自隔离 proof。目标需求确实替换旧期望值时，只在契约 metadata 中登记该变更。
- 全部 BEFORE 回执冻结前，生产写入会被拒绝；首次生产修改后，验证文件和契约计划也被冻结。
- 受管 proof 必须用一条直接命令运行。串联命令、重定向、inline code、环境劫持和非受管脚本不会获得回执。
- 原任务明确禁止网络时，插件会同时拒绝常见下载命令以及 Claude WebSearch/WebFetch。

字段、覆盖矩阵、审查和恢复规则见[当前协议](docs/current-protocol.md)；完整 JSON 示例见[契约参考](skills/behavioral-regression/references/contract.md)。版本演进见 [CHANGELOG](CHANGELOG.md)。

## 宿主差异

Claude Code 能为 ordering、concurrency、三层以上组合、多组件和可变参数表示问题派发两个不同生命周期的独立 reviewer：一个检查修改前 oracle，一个检查修改后 patch。Codex 当前缺少完整的 dispatch/start/stop 观测链，因此同类复核只提供 advisory，不作为硬解锁条件。

Claude 回执通常可绑定宿主退出状态或失败事件。Codex unified exec 的 `PostToolUse` 只有精确命令和原始响应文本，因此使用冻结验证文件中的阶段专用字面签名作为 oracle。

## 失败恢复

按 Hook 返回的 finding 修复契约或 proof，不要反复重试被拒绝的 Shell。诊断预算耗尽后，仍可用文件工具维护 `.behavioral-regression/<id>/`，并直接运行已有受管 proof。残留生产修改时不能用 `paused` 或 `aborted` 冒充安全退出；先还原到冻结基线，或完成当前 epoch 的 AFTER 与复核。

状态损坏、契约丢失或已绑定契约无效时，`Stop` fail closed。重新开始需要增加 epoch，并重建已经失效的回执。

## 验证

在 marketplace 根目录运行：

```bash
node --test plugins/behavioral-regression-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin behavioral-regression-guard
```

live acceptance 由仓库脚本在 `docker/host-acceptance` 中运行；不要直接在宿主机启动 Claude Code 或 Codex acceptance。

该插件与 `debugging-workflow-guard` 互补：后者帮助确定问题和根因，本插件证明修复后的可观察行为与兼容义务。
