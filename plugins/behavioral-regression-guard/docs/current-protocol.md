# Behavioral Regression Guard 当前协议

本文面向使用者说明新建 `behavioral-regression/v11` 契约时必须满足的流程。机器可读字段和完整示例以[契约参考](../skills/behavioral-regression/references/contract.md)及校验器为准；历史版本变化只记录在 [CHANGELOG](../CHANGELOG.md)。

## 激活与状态

插件只有两种相关入口：

1. 测试或复现命令产生明确、可观察的行为失败后，Hook 武装一个临时失败候选，并冻结当时的生产文件摘要。
2. 写入并通过校验的 `.behavioral-regression/<id>.json` 绑定当前会话和 epoch，开始正式证据流程。

加载 Skill、看到 `SessionStart` 提示、命令缺失、超时、未知结果或普通成功输出都不会激活硬流程。失败候选两小时无活动后过期；绑定后的契约由自身状态和 epoch 管理。

## 契约最小组成

每个运行只有一个顶层 JSON 契约，路径为 `.behavioral-regression/<id>.json`。路径必须是工作区相对 POSIX 普通文件；目录、符号链接、绝对路径和 `..` 都会被拒绝。每个路径列表最多 20 项。

v11 契约包含：

- `schema`、稳定 `id`、递增 `epoch`、`status` 和下一步恢复命令；
- 问题的 expected、actual 和可验证成功标准；
- 真实 public seam、已有 constraint seam、完整调用形态和需要保持的语义；
- 有限的 production、verification、regression 路径；
- 一个 primary、两个维度不同的 challenge，以及一个 compatibility invariant。

主用例和两个挑战用例共享一个隔离 proof 文件及一条直接命令，由不同的阶段签名区分 BEFORE 与 AFTER。兼容性不变量运行直接相关的项目测试；这些测试放入 `regressionPaths`，保持 Git 基线字节不变。

## 覆盖如何随接口变化

基础覆盖必须同时触达主行为、公共入口、既有约束入口和兼容性。校验器还会按接口形态扩展要求：

| 接口或语义 | 必需覆盖 |
| --- | --- |
| 多组件且可独立退化 | 全有效、全退化、每次只退化一个组件且保留其余组件 |
| 组件只能共同退化 | 全有效、全退化和共同边界；原任务必须明确排除部分退化 |
| 同质可变参数聚合 | 证明空贡献者在前后都保持中性 |
| 可变参数或三层以上组合 | 0、1、2、多个输入 |
| 排序 | 独立顺序、共享顺序、冲突或环路 |
| 表示、错误、状态、组合、并发 | 各自的替代表示、错误契约、重复转换、组合或交错场景 |

不能用修复后才出现的 helper 代替既有约束入口，也不能把一个高层 consumer 当作真正产生约束的 operation。

## BEFORE、修改与 AFTER

BEFORE 命令必须精确匹配契约中的 `cwd` 和 `command`，并产生冻结 proof 中声明的失败或成功签名。全部声明用例取得匹配回执后，生产写入才解锁。

第一条 BEFORE 回执会冻结验证资产。生产文件第一次偏离基线后：

- 改 proof、项目回归测试或契约计划会使证据失效或被前置拒绝；
- AFTER 必须运行未变化的验证文件和同一条精确命令；
- 至少一个主用例必须从失败变为成功；
- 每个发生变化的用例必须使用不同的 BEFORE/AFTER 字面签名；
- AFTER 之后再次修改生产文件会使回执过期。

Stop 会重新计算生产与验证指纹、命令哈希、用例引用和 reviewer 回执，只有当前字节上的证据才能关闭。

## 旧期望值的替换边界

当需求明确改变现有预期时，v11 用 `scope.supersededAssertions` 描述被替换的旧 expected literal、对应输入、修改前后值、断言位置和目标场景。它是 oracle metadata，不是修改项目测试的许可证。

隔离 proof 负责展示 RED；项目回归文件仍必须与 Git baseline 完全一致。调用改写、断言弱化、多条旧断言合并为一条、额外增删基线或通过 diff 配置隐藏变化都会被拒绝。没有 ordering 语义且没有旧期望需要替换时，可声明空数组。

## 独立复核

高风险 Claude 流程需要两个不同的真实 subagent 生命周期：

- oracle reviewer 在 BEFORE 后读取 Hook 指定的基线证据，根据不含答案的 challenge inputs 独立推导目标行为并寻找反例；
- patch reviewer 在 AFTER 后读取当前生产文件和声明的项目测试，检查实现与验证是否满足同一契约。

reviewer 只能读取 Hook 明确列出的本地证据，不能执行命令、写文件、联网、调用 Skill 或再派发 agent。两次复核绑定不同 agent id 和修改前后生产指纹。Codex 因缺少完整生命周期观测，目前只给出 advisory。

## 写入与网络边界

失败候选武装后，生产文件暂时只读，但测试、fixture、spec、契约和受管 proof 仍可创建。额外 Shell 诊断最多六条，第三条后提示收敛；预算耗尽后只允许读取、文件工具维护 proof，以及一条直接受管 proof 命令。

以下做法不会得到证据并可能直接被拒绝：

- `&&`、`;`、管道、重定向或 inline-code 包装；
- 通过环境变量、解释器参数或替换文件劫持 proof；
- proof 运行期间修改生产文件，再把新字节冒充 baseline；
- 在明确 no-network 任务中下载源码或调用 WebSearch/WebFetch。

## 恢复表

| 现象 | 恢复动作 |
| --- | --- |
| 契约校验失败 | 使用 `Edit`/`Write` 修复 finding 指向的同一契约或已有 bundle，不要新建第二套运行 |
| Shell 诊断预算耗尽 | 继续用文件工具维护受管 proof，然后执行 Hook 给出的单条直接命令 |
| BEFORE 不完整 | 补跑每个契约声明的精确 BEFORE 命令，生产文件保持冻结 |
| 修改后计划或 proof 变化 | 还原生产修改并重开 epoch，重新冻结 BEFORE |
| AFTER 过期 | 在当前生产字节上重新运行未变化的验证命令和必要复核 |
| journal/状态损坏或契约丢失 | 恢复有效契约；无法恢复时先还原生产到基线，再以新 epoch 开始 |
| 想暂停或中止 | 只有生产仍等于冻结基线时才能释放 Stop；存在未验证修改时必须先还原或完成流程 |

Hook 的拒绝意味着命令或写入没有执行。重复提交同一条被拒命令不会推进状态。

## 证明边界

插件证明的是宿主可观察范围内的执行顺序、文件指纹、命令与字面结果绑定。它不能证明测试 oracle 本身正确，也不能约束宿主 Hook 看不到的外部进程或拥有直接磁盘权限的操作者。独立复核和对抗矩阵降低错误 oracle 风险，但不把流程证明变成形式化证明。
