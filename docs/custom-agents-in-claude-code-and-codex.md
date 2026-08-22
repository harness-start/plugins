# Claude Code 与 Codex 插件中的自定义 Agent：定义、调用与运行时控制

> 调研基线：2026-08-14。本文所说的 CC 指 Claude Code；“Codex”主要指本地 Codex CLI、桌面端和 IDE 中共享的自定义 subagent 机制。产品迭代较快，涉及源码的结论均链接到固定提交。

## 结论先行

Claude Code 和 Codex 都能定义有独立指令、模型、思考深度和能力边界的 subagent，但两者的“插件携带 agent”并不是同一种能力。

- Claude Code 把 `agents/*.md` 作为正式插件组件。插件安装后，agent 自动注册为带插件命名空间的 subagent，可由模型自动路由、用户 `@` 指定，或通过 `claude --agent` 变成整场会话的主 agent。[Claude Code 插件参考](https://code.claude.com/docs/en/plugins-reference#agents)
- Codex 的自定义 agent 是 `~/.codex/agents/*.toml` 或项目内 `.codex/agents/*.toml`。截至调研日，Codex 的通用插件文档只承诺技能与连接器/MCP；当前宿主源码的插件资源还包括 apps 和 hooks，但仍没有 agent 定义组件。因此，不能把 Claude Code 插件的 `agents/` 目录原样放进 Codex 插件并期待自动注册。[Codex 插件文档](https://developers.openai.com/codex/plugins)；[Codex 插件 manifest 源码](https://github.com/openai/codex/blob/4eff3b788ba629acc944ed6db6502c362fc08e0a/codex-rs/plugin/src/manifest.rs#L17-L24)；[Codex subagent 文档](https://developers.openai.com/codex/multi-agent)
- 模型和思考深度都可以按 agent 固定。Claude Code 使用 frontmatter 的 `model`、`effort`；Codex 使用 TOML 的 `model`、`model_reasoning_effort`。
- “配置文件写了什么”和“本次子线程实际用了什么”必须分开验证。环境变量、调用时参数、组织模型白名单、父线程的实时权限，以及宿主是否暴露 `agent_type`、`model`、`reasoning_effort` 字段，都可能改变最终结果。
- 提示词中的“只读”“不要修改”是软约束。要建立可信的只读因果链，还要缩小工具集，避免保留可写 shell，或使用宿主实际执行的 sandbox / permission 机制。

## 两个平台的能力对照

| 维度 | Claude Code | Codex |
| --- | --- | --- |
| 插件原生 agent 组件 | 支持，插件根目录 `agents/*.md` | 官方插件契约未声明此组件 |
| 用户级定义 | `~/.claude/agents/*.md` | `~/.codex/agents/*.toml` |
| 项目级定义 | `.claude/agents/*.md` | `.codex/agents/*.toml`，项目需受信任 |
| 必填身份字段 | `name`、`description` | `name`、`description`、`developer_instructions` |
| 行为指令 | Markdown 正文成为 subagent system prompt | `developer_instructions` 字符串成为角色配置的一部分 |
| 模型 | `model: sonnet/opus/haiku/fable/inherit` 或完整模型 ID | `model = "..."` |
| 思考深度 | `effort: low/medium/high/xhigh/max`，受模型支持范围限制 | `model_reasoning_effort = "..."`，受模型支持范围限制 |
| 工具控制 | `tools` allowlist、`disallowedTools` denylist | agent 文件可复用普通 `config.toml` 键；工具、MCP、skill 与 sandbox 按配置层叠 |
| 权限控制 | 独立 agent 可设 `permissionMode`；插件 agent 会忽略 `permissionMode`、`hooks`、`mcpServers` | `sandbox_mode` 可在 agent 文件中设置，但父线程当轮的实时 sandbox/approval 选择会重新应用 |
| 上下文 | 命名 subagent 默认新上下文；可预载 `skills`、设置 `memory` | spawn 可选择继承全部、部分或不继承父线程历史，具体字段取决于宿主工具版本 |
| 显式使用 | 自然语言、`@` agent、`claude --agent` | 自然语言要求使用某个角色；工具层在暴露时使用 `agent_type` |
| 全局并发/默认模型 | 由会话和 agent/team 机制控制 | `[agents]` 下有并发数、默认 subagent 模型和默认思考深度 |

## Claude Code：在插件中定义 agent

### 目录与最小定义

插件的 `agents/` 与 `.claude-plugin/` 同级，不要放进 `.claude-plugin/`：

```text
evidence-plugin/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   └── evidence-reviewer.md
└── skills/
    └── evidence-contract/
        └── SKILL.md
```

一个偏保守的审查 agent 可以这样写：

```markdown
---
name: evidence-reviewer
description: Verifies repository claims and reports anchored findings. Use for read-only review before publishing a technical conclusion.
model: sonnet
effort: high
maxTurns: 12
tools: Read, Grep, Glob
disallowedTools: Write, Edit, Bash
skills:
  - evidence-contract
---

You verify claims against repository evidence.

For every finding, return severity, an exact file anchor, concrete evidence,
and a verifiable recovery path. Do not modify files. Mark anything that cannot
be checked with the available tools as unverified.
```

`name` 和 `description` 是必填项；正文是该 agent 的 system prompt。`model` 缺省时相当于 `inherit`。完整字段还包括 `permissionMode`、`memory`、`background`、`isolation: worktree`、`initialPrompt` 等。[Claude Code subagent 字段表](https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields)

插件 agent 有一条容易忽略的安全边界：`permissionMode`、`hooks`、`mcpServers` 在插件提供的 agent 中会被忽略。需要这些能力时，应改成项目级或用户级 agent，或者把整个会话的权限规则放进项目设置；不要在插件 agent 的 frontmatter 里写了字段就当作已经生效。[Claude Code 的插件 agent 限制](https://code.claude.com/docs/en/sub-agents#choose-the-subagent-scope)

### 如何使用

开发期可直接加载本地插件：

```bash
# cwd: evidence-plugin 的父目录
claude --plugin-dir ./evidence-plugin
```

进入会话后有三种强度不同的用法：

1. 自然语言：`Use the evidence-reviewer agent to review the current diff.` Claude 根据 agent 的 `description` 和上下文决定是否委派。
2. `@` 指定：从输入框的 agent typeahead 选择 `evidence-plugin:evidence-reviewer`。这能保证本次任务使用所选 agent，而不只是在提示词里建议。
3. 整场会话：

   ```bash
   # cwd: evidence-plugin 的父目录
   claude --plugin-dir ./evidence-plugin \
     --agent evidence-plugin:evidence-reviewer
   ```

   该模式用 agent 的 system prompt、工具限制和模型作为主线程配置。`CLAUDE.md` 仍按普通消息流加载。[Claude Code 显式调用与 `--agent`](https://code.claude.com/docs/en/sub-agents#invoke-subagents-explicitly)

插件 agent 也可通过根级 `settings.json` 的 `agent` 键成为插件启用后的默认主 agent；目前插件默认设置只支持 `agent` 和 `subagentStatusLine`。[Claude Code 插件设置](https://code.claude.com/docs/en/plugins#ship-default-settings-with-your-plugin)

### 模型与思考深度的优先级

Claude Code 对 subagent 模型的解析顺序是：

```text
CLAUDE_CODE_SUBAGENT_MODEL
  > 本次 Agent 调用的 model 参数
  > agent frontmatter 的 model
  > 主会话模型
```

组织的 `availableModels` 仍会过滤结果，受限模型可能被替换为同家族可用模型或继承模型。完整模型 ID 与 `--model` 接受的值一致。[Claude Code subagent 模型解析](https://code.claude.com/docs/en/sub-agents#choose-a-model)

`effort` 是独立维度。frontmatter 的 `effort` 在该 agent 活跃时覆盖会话级 effort，但 `CLAUDE_CODE_EFFORT_LEVEL` 的优先级更高；可用层级依赖具体模型。[Claude Code effort 配置](https://code.claude.com/docs/en/model-config#set-the-effort-level)

因此，如果插件想表达“侦察用便宜模型、中等思考；最终审查用强模型、高思考”，应定义两个 agent，而不是让一个 agent 在正文里自行决定模型：

```yaml
# agents/scout.md
model: haiku
effort: medium
```

```yaml
# agents/final-reviewer.md
model: opus
effort: high
```

模型是否真的切换，不能靠 agent 自述证明。至少应在交互界面检查实际线程标识和警告；有组织 allowlist 时，还要专门测试被允许与被拒绝的模型各一次。

## Codex：自定义 agent 与插件分发是两条链路

### 当前官方定义方式

Codex 会从用户配置目录和受信任项目的配置目录下发现 agent TOML。当前源码既读取 `[agents.<name>]` 声明，也会递归扫描每个配置层旁边的 `agents/` 目录；解析后移除元数据字段，把其余内容当作普通 Codex 配置层应用。[Codex agent 发现源码](https://github.com/openai/codex/blob/4eff3b788ba629acc944ed6db6502c362fc08e0a/codex-rs/core/src/config/agent_roles.rs#L18-L92)；[TOML 解析源码](https://github.com/openai/codex/blob/4eff3b788ba629acc944ed6db6502c362fc08e0a/codex-rs/core/src/config/agent_roles.rs#L214-L304)

项目级示例：

```toml
# .codex/agents/evidence-reviewer.toml
name = "evidence_reviewer"
description = "Read-only reviewer for evidence-backed findings and API verification."
model = "gpt-5.6-terra"
model_reasoning_effort = "high"
sandbox_mode = "read-only"

developer_instructions = """
Review only; do not edit files.
Every finding must include severity, a precise file or source anchor, evidence,
and a verification or recovery path. Separate facts, inferences, and assumptions.
"""
```

全局 subagent 默认值仍放在 `config.toml`：

```toml
# ~/.codex/config.toml 或受信任项目的 .codex/config.toml
[agents]
enabled = true
max_concurrent_threads_per_session = 4
default_subagent_model = "gpt-5.6-terra"
default_subagent_reasoning_effort = "medium"
interrupt_message = true
```

agent 文件还可以使用普通 `config.toml` 支持的其他键，例如 `mcp_servers`、`skills.config` 和 `sandbox_mode`。[Codex 自定义 agent schema](https://developers.openai.com/codex/multi-agent#custom-agent-file-schema)；[Codex 配置参考](https://developers.openai.com/codex/config-reference)

### 如何使用

最稳妥的用户入口是明确点名角色和任务边界：

```text
使用 evidence_reviewer agent 只读审查当前分支相对 main 的 API 变化；
不要修改文件，按严重度返回带路径和行号的发现。
```

在暴露完整 multi-agent 工具 schema 的宿主中，底层调用参数可以包含：

```jsonc
{
  "agent_type": "evidence_reviewer",
  "message": "Review the API changes against main and return anchored findings.",
  "fork_turns": "none",
  "model": "gpt-5.6-terra",
  "reasoning_effort": "high"
}
```

这不是 shell 命令，而是宿主的 `spawn_agent` 工具参数示意。必须以当前会话实际暴露的 tool schema 为准：V1/V2 字段和上下文继承参数不同，某些宿主会隐藏 `agent_type`、`model`、`reasoning_effort`、`service_tier`。OpenAI 当前源码同时定义了这些字段和删除它们的分支，说明“配置支持”不等于“所有模型、版本和宿主都允许调用时选择”。[Codex spawn schema 源码](https://github.com/openai/codex/blob/4eff3b788ba629acc944ed6db6502c362fc08e0a/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L586-L679)

特别注意：`task_name` 只命名子线程/任务路径，不等于 `agent_type`。当 schema 没有 `agent_type` 时，把 `task_name` 写成自定义 agent 名称不能证明角色 TOML 已加载。

### Codex 的模型、思考深度与权限层叠

Codex 对 `model` 和 `model_reasoning_effort` 分别解析。官方文档给出的顺序是：

```text
agent TOML 中显式固定的值
  > spawn_agent 本次调用值
  > [agents] 的 default_subagent_* 值
  > 父线程值
```

如果调用时换了模型，却没有显式 effort、全局默认 effort 或 agent 固定 effort，则采用新模型的默认 effort。[Codex 模型与 effort 解析说明](https://developers.openai.com/codex/multi-agent#custom-agents)

当前源码还做了两件值得关注的事：

- agent 文件没有固定模型或 effort 时，角色配置层保留调用方已经选择的值；agent 文件写了对应键时，由角色层覆盖。[角色层应用源码](https://github.com/openai/codex/blob/4eff3b788ba629acc944ed6db6502c362fc08e0a/codex-rs/core/src/agent/role.rs#L1-L7)；[模型与 effort 保留逻辑](https://github.com/openai/codex/blob/4eff3b788ba629acc944ed6db6502c362fc08e0a/codex-rs/core/src/agent/role.rs#L170-L211)
- spawn 时会校验模型是否可供该 multi-agent backend 使用，以及 effort 是否被该模型支持；不是任意字符串都会静默生效。[spawn 模型覆盖与校验](https://github.com/openai/codex/blob/4eff3b788ba629acc944ed6db6502c362fc08e0a/codex-rs/core/src/tools/handlers/multi_agents_common.rs#L272-L325)

权限则不是同一优先级模型。Codex 会把父线程当轮有效的 cwd、approval 和 permission profile 重新应用给子线程，所以用户在会话中选择的实时 sandbox/approval 可以压过 agent 文件的默认值。[Codex subagent 权限说明](https://developers.openai.com/codex/multi-agent#permissions-and-sandboxing)

### 如何从 Codex 插件交付 agent

因为 Codex 插件本身没有 `agents/` 组件，跨项目交付时有三种可审计方式。当前源码的 `PluginManifestPaths` 只有 `skills`、`mcp_servers`、`apps`、`hooks`，这不仅是文档遗漏问题。[Codex 插件资源结构](https://github.com/openai/codex/blob/4eff3b788ba629acc944ed6db6502c362fc08e0a/codex-rs/plugin/src/manifest.rs#L17-L24)

1. 项目本身受控：把 `.codex/agents/*.toml` 直接提交到使用该 agent 的项目。
2. 用户级 agent pack：把 TOML 当作发行资产，由显式安装命令复制或链接到 `~/.codex/agents/`；安装前列出目标文件，提供卸载和回滚命令，不要静默覆盖同名 agent。
3. 插件只交付 skill/hook：skill 说明需要哪个 agent，并在缺失时明确降级为普通 worker；不要声称插件已经注册了一个宿主实际看不到的角色。

第二种方式是社区 Codex harness 的常见做法，但它是安装器能力，不是插件自动发现能力。`my-codex` 的 pack manager 把已启用 pack 的 TOML 软链接到 `~/.codex/agents/`，并用状态文件记录选择。[agent pack 激活实现](https://github.com/sehoon787/my-codex/blob/ff51e4e1ad60546ce937b725ed4cfea45bea532f/scripts/agent-pack-manager.sh#L4-L10)；[软链接投放逻辑](https://github.com/sehoon787/my-codex/blob/ff51e4e1ad60546ce937b725ed4cfea45bea532f/scripts/agent-pack-manager.sh#L120-L155)

## GitHub 仓库抽样结果

本次不仅阅读官方页面，还 shallow clone 并检查了以下固定提交。

| 仓库与提交 | 实际观察 | 可迁移的结论 |
| --- | --- | --- |
| [`anthropics/claude-code` `1f6015b`](https://github.com/anthropics/claude-code/tree/1f6015b5d578adf79c8527443328a216d6b6a3f1/plugins/plugin-dev) | 官方 `plugin-dev` 真实携带 `agent-creator`、`plugin-validator`、`skill-reviewer` 三个 agent。`agent-creator` 用长 `description` 放触发示例，固定 `model: sonnet`，工具仅有 `Write`、`Read`。[文件](https://github.com/anthropics/claude-code/blob/1f6015b5d578adf79c8527443328a216d6b6a3f1/plugins/plugin-dev/agents/agent-creator.md#L1-L37) | `description` 是路由合同，正文是执行合同，`tools` 是能力面；三者不要混写成一段泛化 persona。 |
| [`wshobson/agents` `c4b82b0`](https://github.com/wshobson/agents/tree/c4b82b0ad771190355eb8e204b1329732a18449a/plugins) | 在该提交执行 `find plugins -path '*/agents/*.md' -type f \| wc -l` 得到 204。`python-pro` 固定 `model: opus`，但没有 effort 或工具限制；`team-lead` 则显式开放 Agent、Team 和 Task 工具。[python-pro](https://github.com/wshobson/agents/blob/c4b82b0ad771190355eb8e204b1329732a18449a/plugins/python-development/agents/python-pro.md#L1-L7)；[team-lead](https://github.com/wshobson/agents/blob/c4b82b0ad771190355eb8e204b1329732a18449a/plugins/agent-teams/agents/team-lead.md#L1-L13) | 大型市场证明 agent 按领域插件拆分可行，也说明社区定义可能偏旧或偏宽。复制前要重新审计模型成本、effort 和最小工具集。 |
| [`alanfuller15/claude-plugins` `5502415`](https://github.com/alanfuller15/claude-plugins/tree/5502415e29560cc00e57dc4c31c6457b2778eb3f/plugins/genesis) | `verifier` 的职责、判定结果和输出格式都很窄；同时它保留 Bash，并靠正文规定 Bash 只能做只读检查。[文件](https://github.com/alanfuller15/claude-plugins/blob/5502415e29560cc00e57dc4c31c6457b2778eb3f/plugins/genesis/agents/verifier.md#L1-L23) | 这是良好的任务设计，却不是硬只读。若结果需要安全保证，应移除 Bash，或在更低层增加命令策略/sandbox。 |
| [`openai/codex` `4eff3b7`](https://github.com/openai/codex/tree/4eff3b788ba629acc944ed6db6502c362fc08e0a) | 源码递归发现 agent TOML、把角色作为高优先级配置层应用，并允许 tool schema 暴露或隐藏角色、模型和 effort 参数；插件 manifest 则只有 skills、MCP、apps、hooks。[发现](https://github.com/openai/codex/blob/4eff3b788ba629acc944ed6db6502c362fc08e0a/codex-rs/core/src/config/agent_roles.rs#L470-L540)；[spawn schema](https://github.com/openai/codex/blob/4eff3b788ba629acc944ed6db6502c362fc08e0a/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L631-L679)；[plugin schema](https://github.com/openai/codex/blob/4eff3b788ba629acc944ed6db6502c362fc08e0a/codex-rs/plugin/src/manifest.rs#L17-L24) | agent 文件是独立配置层，不是插件内的简单 prompt 模板；分发链路和运行时调用面都要单独验收。 |
| [`sehoon787/my-codex` `ff51e4e`](https://github.com/sehoon787/my-codex/tree/ff51e4e1ad60546ce937b725ed4cfea45bea532f/codex-agents) | 实际 `librarian.toml` 用顶层字符串 `developer_instructions = """..."""`，并固定 Terra/medium/read-only；写入型 MLOps agent 则使用 Terra/high/workspace-write。[librarian](https://github.com/sehoon787/my-codex/blob/ff51e4e1ad60546ce937b725ed4cfea45bea532f/codex-agents/omo/librarian.toml#L1-L13)；[mlops-engineer](https://github.com/sehoon787/my-codex/blob/ff51e4e1ad60546ce937b725ed4cfea45bea532f/codex-agents/packs/data-ai/mlops-engineer.toml#L1-L16) | 按任务风险分配模型、effort、sandbox 是可操作的分层方式。 |

最后一个仓库也提供了“不能只看 README”的反例：同一提交的 README 把 `developer_instructions` 写成带 `content` 的 TOML table，而实际 agent 文件和当前官方 schema 使用字符串。[README 示例](https://github.com/sehoon787/my-codex/blob/ff51e4e1ad60546ce937b725ed4cfea45bea532f/README.md#L471-L489) 不能替代对已安装文件和宿主解析器的验证。

本仓库采用了更小的边界：不再发布中央 subagent 工作流或生命周期审计插件，也不在 debugging、first-principles、reasoning 和 work-report 这些领域插件的根目录投放自定义 agent。对应 Skill 只在任务确实适合拆分时，用普通自然语言请求宿主创建通用子 agent；父 agent 验证结果并承担交付责任。仓库用下面的合同测试固定这条边界：

```bash
# cwd: 本仓库根目录
npx tsx --test core/tests/unit/subagent-architecture.test.ts
```

这项测试证明仓库没有重新引入专用 agent 文件、`SubagentStart` / `SubagentStop` hook 或旧 marker/nonce 协议。它不证明宿主的通用 subagent 一定正确；正确性仍由领域产物、测试和父 agent 的复核建立。

## 推荐的跨平台设计

同一个逻辑角色可以共享职责和验收标准，但不要共享同一份宿主配置文件：

```text
reviewer contract
├── Claude Code projection
│   ├── agents/evidence-reviewer.md
│   ├── model: sonnet
│   ├── effort: high
│   └── tools/disallowedTools
└── Codex projection
    ├── .codex/agents/evidence-reviewer.toml 或安装资产
    ├── model = "gpt-5.6-terra"
    ├── model_reasoning_effort = "high"
    └── sandbox_mode = "read-only"
```

建议把可共享部分限制在这些语义合同：

- 何时使用、何时不使用；
- 输入和输出格式；
- 是否允许写入以及写入范围；
- 必须执行的验证；
- 失败、缺证据和需要用户决策时如何返回。

模型 ID、effort 枚举、工具名、权限模式、hook 事件和环境变量都留在平台投影中。这样不会把 `permissionMode` 塞进 Codex，也不会把 `sandbox_mode` 塞进 Claude Code frontmatter。

## 设计与验收清单

### 定义阶段

- agent 只承担一个可以独立验收的角色；`description` 同时写清触发条件和排除条件。
- 正文/`developer_instructions` 写任务边界、证据标准、失败返回和输出结构，不只写人格描述。
- 读任务默认选择低成本模型和 `medium`；复杂审查才升到 `high` 或更深。模型和 effort 要在真实任务集上比较，不能把更深思考直接等同于更好。
- 能不用 shell 就不用；需要 shell 时，提示词中的只读规则不能替代命令拦截或 sandbox。
- 写 agent 明确 workspace-write；并行写入要分配互不重叠的文件范围。只有用户明确要求隔离工作区，或已激活流程写出放行回执时，才使用 worktree。

### 加载与路由验收

- 记录宿主版本、加载范围和 agent 文件的固定内容哈希。
- 用一个无副作用的辨识任务验证 agent 指令是否加载，例如要求返回固定字段结构；这只能证明指令生效，不能证明模型与 effort。
- Claude Code 检查 `@` typeahead 中的插件 scoped name；首次新建 `agents/` 目录后若未出现，重启会话再验。
- Codex 检查当前 `spawn_agent` schema 是否真的有 `agent_type`。没有时，禁止用同名 `task_name` 冒充成功加载。
- 如果宿主没有提供有效模型/effort 的可观察元数据，将其记录为“未证明”，不要引用 agent 自述作为证据。

### 权限与效果验收

- 为只读 agent 准备一个“诱导写入”的反例任务，确认宿主真正拒绝，而不是 agent 恰好听话。
- 为固定模型准备允许和禁止两种模型配置，观察替换、报错或回退路径。
- 为 effort 准备至少两个有客观评分的代表任务，比较正确率、时延和 token，而不是只看回答长度。
- 对自动路由分别测试“应触发”和“相似但不应触发”的提示；`description` 命中只说明路由，不说明任务结果正确。
- 插件升级后重新执行加载、路由、权限和结果质量四类验收。文件存在、hook 激活或产生了额外模型轮次，都不是 outcome-level 的完成证据。

## 实施建议

本仓库当前不建议预先补一对跨平台 reviewer agent。默认方案是：领域 Skill 判断某个搜索、阅读或反例检查是否值得并行；若值得，就向宿主的通用 subagent 发送完整自然语言任务；子 agent 返回建议；父 agent 打开证据、运行验证并作最终决定。只有当真实任务反复证明某个稳定角色需要固定模型、effort、工具权限或路由时，才按前文的双投影方式新增自定义 agent，并单独验收加载、权限、成本和结果质量。
