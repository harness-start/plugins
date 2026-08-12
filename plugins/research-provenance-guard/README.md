# Research Provenance Guard

`research-provenance-guard` 是 Claude Code 和 Codex 上按需启用的硬研究 harness。它通过 `research-evidence-workflow` orchestrator 和项目工作流文件，将来源转换为捕获回执、精确 anchor、typed claim、canonical report 和新鲜 completion seal；不会依靠 Skill 名称启发式激活。

## 入口与因果链

1. 安装插件，以及可选的 `research`、`firecrawl`、`handoff` Skill 依赖。
2. `SessionStart` 注入路由优先级：研究任务必须先进入 `research-evidence-workflow`，不能直接从裸 `firecrawl` / `research` 开始。
3. orchestrator 在 `.research/runs/<run-id>/workflow.json` 下创建持久运行。
4. 只有该运行处于 open 时，Firecrawl CLI 阻断、`Stop` seal 校验和 outbound 门禁等硬行为才生效。

没有 `$research` 或 `/research` 激活别名；在对话中提到 Skill 名称不会打开硬模式。用户只能用精确文本 `# research-abort` 中止，终态 `aborted` 由 Hook 负责，workflow CLI 不能自行授权中止或完成。

```text
进入 orchestrator Skill
  -> project workflow.json（open）
  -> brief、source plan 与 inbound subagent handoff
  -> MCP roots/list 绑定 workspace
  -> 候选发现（不是证据）
  -> 私有 plugin data 中有限 source capture
  -> captured content 的精确 anchor
  -> typed claim 校验
  -> canonical manifest 与 report（只由 seal 写入 workspace）
  -> sealed 后才能 outbound handoff，并记录 prompt
  -> 当前 epoch/revision 观察到 research_seal 回执
  -> Stop 离线重验 trailer、文件和摘要
  -> Hook 写入 `complete`，或精确用户指令触发 `aborted`
```

Hook 激活、`SessionStart` 文本、安装 skill-deps 或额外模型轮次都不是结果证据。结果级检查包括 workflow phase、anchor 解析、claim 状态规则、canonical artifact 生成、artifact 哈希重算、回执匹配，以及最后一次可观察修改后的 freshness。

Claude MCP 服务继承平台注入的 `CLAUDE_PLUGIN_DATA`；`.mcp.json` 不得用同名占位符覆盖它，否则未展开的字面量会把私有研究数据写入工作区。Codex 则只转发 `mcp/codex.json` 明确列出的平台环境变量。

## 项目目录与写入权限

```text
.research/runs/<run-id>/
  workflow.json
  brief.md
  source-plan.md
  skill-trace.jsonl
  handoffs/inbound/*
  handoffs/outbound/*    # 仅 sealed 后
  claims.draft.json
  research.json          # 仅 seal 写入
  report.md              # 仅 seal 写入
```

捕获的 source body 与 MCP event stream 保存在平台插件数据目录并使用私有权限。若不希望运行记录进入版本控制，应忽略 `.research/`。`.firecrawl/` 输出只有重新通过 MCP 捕获后才能作为证据。

| 路径 | 允许 writer |
| --- | --- |
| `workflow.json` 的 phase 与 completeness | workflow CLI、MCP 或已校验 lifecycle Hook |
| brief、source plan、skill trace、inbound handoff、claims draft | open 运行中的 orchestrator、workflow CLI 或 agent |
| `research.json`、`report.md` | 仅 `research_seal` |
| `handoffs/outbound/**` | phase 为 `sealed` 后的 `handoff-outbound` CLI |

`research_begin` 将一个运行绑定到 MCP workspace root 并同步 `workflow.json`。MCP 工具标识带宿主 namespace，应选择以 `__research_begin`、`__source_capture` 等结尾的已注册标识，不能输出裸短函数名。`source_discover` 可在内部使用 Firecrawl，但发现本身不是证据；`source_capture`、`source_read`、`source_anchor` 才建立证据，`research_seal` 校验 claim 并写 canonical report。

seal 后拒绝修改证据和重复 seal。通过校验的 `Stop` 会把 workflow 变为 `complete`，后续普通 prompt 不再处于硬模式。活动运行期间，直接修改 `workflow.json`、canonical seal 文件或 outbound handoff 路径会被阻断。

最终回复可选地指向匹配 report，并包含：

```text
Research-Evidence: research-evidence/v1
Research-Run: <run-id>
Research-Seal: sha256:<digest>
```

## 对外交接

seal 后使用 workflow CLI 的 `handoff-outbound`，记录 `handoffs/outbound/handoff.md` 和保存完整 prompt 的 `prompt.md`，之后可选调用社区 `handoff` Skill。直接写 outbound 路径会被阻断。这项 CLI 转换只记录 lifecycle metadata，不会使已经不可变的 evidence seal 过期。

父会话拥有 seal 和 outbound handoff。subagent 可 capture/read 或通过 inbound handoff 起草 notes，但其 prose 不能创建 seal receipt。

## 工作流 CLI

```bash
node "${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}/scripts/research-workflow.mjs" run-open --cwd "$PWD"
node ".../research-workflow.mjs" brief-write --cwd "$PWD" --question "..." --scope "..." --as-of "..."
node ".../research-workflow.mjs" handoff-inbound --cwd "$PWD" --file /tmp/inbound.json
node ".../research-workflow.mjs" completeness-check --cwd "$PWD"
node ".../research-workflow.mjs" handoff-outbound --cwd "$PWD" --handoff-file ... --prompt-file ...
```

## Skill 组合

`skill-deps.json` 安装的是阶段 worker，不是替代入口：

- `research`：供 subagent 使用的发现/阅读方法，finding 写入 inbound 路径；
- `firecrawl`：只提供发现策略，硬运行仍使用 MCP `source_discover` / `source_capture`；
- `handoff`：seal 后跨会话交接，精确 prompt 必须写入项目 `outbound/prompt.md`。

## 状态、并发与信任边界

Hook observation 是按 session 和 workspace 划分、TTL 24 小时的 append-only event 文件。活动模式由项目 `workflow.json` phase 与 Hook 回执共同重建。seal receipt 在已校验 `Stop` 写入 `complete` 前持续受门禁；新的 `research_begin` 会清除旧 seal 的权限。server 进程一次只允许一个未完成 MCP 运行，并绑定一个 workspace root。

普通 workspace 修改会增加 Hook revision。seal 后的 `handoff-outbound` 与 Hook 终态是明确 lifecycle transition，不能修改 sealed evidence，因此不改变摘要；直接 outbound 写入仍会阻断。

- 宿主提供 MCP `roots/list` 时，它是权威根。Codex 0.146 对本地 stdio server 返回空列表，因此 Codex bundle 显式转发绝对启动 `PWD`；server 只在有 Codex 标记且 roots 为空时接受该 fallback。
- workspace capture 会解析符号链接并拒绝根目录外目标。
- 直接 HTTP 在每次 redirect 上执行 DNS public check。
- seal digest 只表示可观察工作流内的完整性，不是抵抗恶意同用户进程的签名。

缺少 Firecrawl 只影响发现。缺少 plugin data、有效单一 MCP root，或窄范围 Codex launch-root fallback 时，权威路径 fail-closed。未验证 claim 必须显示限制，且不能在 canonical report 外作为已验证事实陈述。

## 验证

```bash
node --test plugins/research-provenance-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin research-provenance-guard
```
