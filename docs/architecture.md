# Harness Start 工作架构

> 状态：Working Architecture
>
> 最近核对：2026-08-17
>
> 适用对象：插件作者、维护者和评审者

本文记录 Harness Start 当前的架构方向，不把仍在验证的选择写成已经稳定的规范。文中的“当前事实”可由仓库代码和配置核对；“工作默认”用于指导新设计；“开放问题”需要证据后再决定是否固化。

插件库存以 [Claude Code Marketplace](../.claude-plugin/marketplace.json) 和 [Codex Marketplace](../.agents/plugins/marketplace.json) 为准。本文不替代各插件自己的 README、DESIGN 或验收材料。Skill 与 Hook 的协作准则见 [Skill 与 Hook 协作准则](skill-hook-collaboration.md)。

## 1. 目标

这个仓库通过多个可独立安装的插件组成 harness。每个插件负责一组可解释的不变量，并能独立升级、验证和回滚。

当前工作方向是 **机械约束交给 Hook，开放式工作交给 agent**：

- Hook 是自动化主路径，负责触发、时序、门禁、反馈和状态推进。
- Script 是 Hook 或显式工具调用的插件内执行单元，保持确定、可测试、自包含。
- Skill 是意图和方法入口，负责配置、诊断、恢复以及需要模型判断的领域工作；它也可以用自然语言请求宿主创建普通子 agent。

“重”和“轻”描述职责与激活方式，不是代码行数。重 Hook 不等于注册更多进程或在每次事件注入更多文字；轻 Script 也不等于把业务判定塞回 Hook JSON。

## 2. 当前事实

截至最近核对，两个 Marketplace 各登记 39 个同名插件。完整清单和分类以根目录 [README](../README.md) 为准。Skill / Hook 协作的规范性要求见 [Skill 与 Hook 协作准则](skill-hook-collaboration.md)。

当前实现共同体现了以下事实：

- 每个插件都有独立目录、双平台 manifest 和平台专属 Hook 配置。
- 两个平台共享插件内业务脚本，但使用各自的根目录变量和 Hook 配置。
- 自动门禁只用于可机械验证的条件；需要模型理解、探索或取舍的流程留在 Skill 和 agent 工作流中。
- 业务脚本由 `src/**/*.ts` 构建为已提交、自包含的 `dist/**/*.mjs`，发布前必须校验构建摘要和产物新鲜度。
- 插件运行时不引用另一个插件的相对路径。
- Android、Go、iOS、Java、Kubernetes、Nix、PHP、Python、React Native、Rust 与 Web 前端各自形成独立插件；语言/生态检查和依赖产物保护归对应领域所有。
- React Native 是独立跨端领域：不依赖 Web、Android 或 iOS 插件；其 JavaScript/TypeScript、Metro、Codegen 与原生桥接边界由自身 Skill 和 Hook 负责。
- 仓库不提供中央 subagent 编排或生命周期审计插件。领域 Skill 可自然语言委派普通子 agent，父 agent 负责证据、写入、验证和最终交付。

## 3. 运行链路

```text
Marketplace
  -> platform manifest
    -> platform hook config
      -> lifecycle event dispatcher
        -> plugin-local checks / state
          -> platform output adapter
            -> deny | report | context | receipt | state transition

explicit user or agent intent
  -> Skill / CLI / future MCP surface
    -> plugin config or plugin-local script
      -> same documented invariant and state model
```

自动路径和显式路径可以共享同一套配置、纯函数或状态模型，但不能各自实现一份相互漂移的规则。允许的协作模式与必须遵守的不变量见 [Skill 与 Hook 协作准则](skill-hook-collaboration.md)。

## 4. 职责边界

| 组件 | 应该负责 | 不应该负责 |
| --- | --- | --- |
| Hook 配置 | 事件、matcher、超时、平台根变量和入口命令 | 业务规则、跨平台兼容分支、隐式安装 |
| Hook 入口 Script | 读取事件、规范化输入、调度检查、适配平台输出 | 长时间推理、交互式流程、无界网络或子进程调用 |
| `checks/` / `lib/` | 纯判定、格式化、受控状态访问和最小辅助函数 | 仓库级共享运行时、未使用的通用抽象 |
| Skill | 领域方法、配置、诊断、窄例外、恢复，以及自然语言委派普通子 agent | 复制 Hook 判定、模拟跨平台 subagent 调度器、成为无关插件的安装前提 |
| CLI / MCP | 显式创建、查询或操作工作流状态 | 根据模糊意图偷偷启动工作流 |

Hook 不能替用户或模型推断开放式意图，也不能把一次 Hook 激活、格式正确或额外模型轮次当作结果有效的证明。

## 5. 插件设计默认值

### 5.1 插件是部署和回滚边界

一个插件携带运行所需的 manifest、Hook 配置、Scripts、测试、验收用例和必要文档。宿主只复制或加载单个插件目录，因此运行时不能依赖仓库根目录或其他插件。

跨插件出现相似辅助函数时，通用 hook I/O、写目标抽取、shell 分词、交付路径/writer 识别、JSONL trail 锁和可执行配置加载属于 `core/src`，由 esbuild 打进各插件 `dist/`。领域判定仍必须留在插件内。插件运行时不能引用另一个插件或仓库外的共享包。

### 5.2 一个不变量只有一个拥有者

同一条规则不能由多个插件重复阻断或重复注入。插件边界按用户能解释的责任划分，不按源文件、Skill 名称或语言包结构机械复制。

### 5.3 一个事件面只保留少量入口

同一插件、同一生命周期事件优先使用一个 dispatcher，在进程内按明确顺序执行检查。不要为每条细规则注册一个 command Hook。这样可以控制进程启动成本、输出顺序和 first-match/aggregate 语义。默认全开时，Hook 脚本仍会启动；入口必须先做廉价相关性判断，只有事件可能触及本插件不变量时才进入 git、制品扫描、校验器或其他重逻辑。

### 5.4 平台绑定分开，业务语义共享

Claude Code 和 Codex 分别维护 manifest、Hook JSON、根目录变量和输出适配。检查函数和状态语义在插件内部共享。任何平台差异都应停留在 Hook 配置或输出适配边界，不能渗入每条业务规则。

### 5.5 门禁只处理可机械判断的问题

- `PreToolUse` 适合阻止高置信、尚未发生且有明确恢复路径的风险。
- `PostToolUse` 适合报告已发生操作的结果、写 receipt 或提示修正；不能把事后反馈描述成已经回滚。
- `SessionStart` 等注入必须短小、限定到插件责任，并基于稳定策略或可观察事实。不要用 `SubagentStart` 建立跨平台身份、reservation、nonce、mailbox 或审批协议。
- `Stop` / `SubagentStop` 只有在完成条件能机械验证且解阻路径明确时才应阻断。制品交付的 Stop 只拦本回合动过对应 `artifacts/<carrier>` 的会话：cwd 在项目内、writer journal 未关闭，或该 session 的 Post/Failure Hook 已在平台插件数据目录持久化参与标记；标记按 workspace、carrier、session 的摘要键隔离。仓库里已有未完成项目不得让无关会话 `stopBlock`。独立 review 的 `SubagentStop` 不得 fail-closed，只给 `additionalContext`。宿主带 `stop_hook_active` 的重试必须放行，避免回合死循环。

每个 Hook 都要显式选择错误策略。解析失败、依赖缺失、超时和内部异常是否 fail-open 或 fail-closed，取决于误阻与漏阻的失败成本，并由入口测试锁定；仓库不设一个覆盖所有事件的统一答案。

### 5.6 运行时保持直接和可审计

Hook 不在执行期间安装依赖，不运行交互命令，不把凭据、完整 prompt 或完整事件写入日志。脚本只调用目标环境已经存在的工具，并对范围、超时和失败输出负责。

## 6. 何时使用 Hook、Skill 或 Script

设计新能力时按以下顺序判断：

1. 能力是否绑定到宿主生命周期事件，并且输入、判定和输出可以机械验证？如果是，使用 Hook。
2. 能力是否必须由用户或 agent 明确表达意图、选择策略或确认风险？如果是，提供 Skill、CLI 或 MCP 入口。
3. 能力是否需要可复用的确定性执行逻辑？如果是，放入插件内 Script，并让 Hook 或显式入口调用它。
4. 能力是否需要长时间开放式推理、外部协调或无界探索？如果是，它不应成为自动 Hook；应留在 agent 工作流中。

Skill 不是每个插件的必需文件。只有 Hook 无法安全推断意图，且操作说明能显著降低错误配置或恢复成本时才增加 Skill。

## 7. 反馈回路与风险控制

Hook-first 的价值来自闭环，而不是事件覆盖率：

```text
event -> observed facts -> decision -> user/agent-visible feedback
      -> correction or state change -> later event verifies the result
```

主要风险及当前控制如下：

| 风险 | 当前控制 |
| --- | --- |
| Hook 数量增加导致延迟 | 同事件合并 dispatcher；matcher 和超时留在平台配置 |
| 上下文注入变成噪声 | 只注入插件责任内的策略或事实；真实宿主验收检查可见行为 |
| Skill 与 Hook 规则漂移 | Skill 引用插件 DESIGN/配置契约，不复制判定实现 |
| 插件为复用重新引入框架 | 禁止跨插件运行时引用和隐式构建链，只保留实际 import 的本地函数 |
| 自动化越过用户意图 | 显式创建类操作留在 Skill/CLI/MCP；Hook 只维护已存在的状态 |
| 平台行为看似一致、实际不同 | 双 Hook 配置、双宿主验收和平台适配测试分别验证 |

## 8. 开放问题

这些问题尚未固化为 CI 规则。维护者在出现对应证据时更新本文，而不是在单个插件里静默创造新惯例。

| 问题 | 当前默认 | 需要的证据 | 重新决策触发点 |
| --- | --- | --- | --- |
| Hook 延迟与上下文预算 | 少量 dispatcher、短输出、有限超时 | 双宿主耗时和输出大小分布 | 新插件使交互明显变慢或提示相互挤压 |
| 跨插件复用 | 通用层进 `core/src` 并 bundle；领域规则仍本地 | 同一修复多次漂移的记录 | 新的通用 I/O 再次在插件内复制 |
| 持久状态协作 | 状态归拥有它的插件 | 两个插件确需共享的稳定 schema 和升级策略 | 出现跨插件读取私有文件的需求 |
| 社区 Skill 供应链 | 已拆除：无 `skill-deps.json`、无 `vendor-skills/` | 单独安装的插件能完成其编排与门禁 | 安装器与验收不再 `npx skills add` |
| Skill、CLI、MCP 的分工 | 选择最小显式入口 | 用户任务、宿主支持和恢复场景数据 | 同一操作需要维护多个不一致入口 |
| fail-open / fail-closed 分类 | 按事件失败成本逐项决定 | 误阻、漏阻和恢复时间证据 | 新事件类型或真实事故暴露默认错误 |
| 架构机械门禁 | 先文档评审，不加新 CI | 无状态守卫和有状态工作流都稳定应用 | 规则重复违反且可低误报检测 |

## 9. 从 Working 到稳定契约

在满足以下条件前，本文保持 Working 状态：

- 无状态守卫和有状态工作流都能遵守这些边界，不需要隐藏例外；
- Claude Code 与 Codex 的离线测试和真实宿主验收都能证明同一用户可见语义；
- Hook 延迟、上下文噪声和误阻有可重复的观测方式；
- 新增 Skill 或共享层有明确的进入条件和删除条件；
- 可以把高价值规则转成低误报的静态或验收门禁。

稳定后再决定哪些条目进入 CI 或项目指令。当前阶段，代码、配置和真实验收结果仍高于本文中的推断。
