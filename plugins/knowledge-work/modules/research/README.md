# 研究证据来源守卫

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `knowledge-work` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`evidence-based-research` 是按需打开的研究流程，Claude Code 和 Codex 都能用。它不靠 Skill 名字猜你在做研究。`research-evidence-workflow` 和项目里的工作流文件会把来源收成捕获回执、精确 anchor、typed claim、正式报告，以及带新鲜度的 completion seal。

## 目标

把“找到一个页面”与“形成可引用证据”严格分开。每条正式结论必须绑定已捕获内容中的精确 anchor、claim 类型和验证状态；交付前重新计算来源、报告与 seal 的摘要，未验证限制必须显式保留。

## 实现

`research-evidence-workflow` 显式创建持久运行，MCP 负责 workspace 绑定、来源捕获、读取、锚定和封存，CLI 管理 brief、完整性检查与 sealed 后的对外交接。Hook 只在项目 `workflow.json` 处于 open/sealed 生命周期时启用相应写入和 `Stop` 门禁；候选发现、Skill 加载或 Hook 激活本身都不是证据。

## 入口和工作顺序

1. 安装插件。方法正文捆绑在 `research-evidence-workflow` 的 references 中。
2. `SessionStart` 注入路由优先级：研究任务必须先进入 `research-evidence-workflow`，不能直接跑 Firecrawl CLI 或把未锚定候选当证据。
3. orchestrator 在 `.research/runs/<run-id>/workflow.json` 下创建持久运行。
4. 只有该运行处于 open 时，Firecrawl CLI 阻断、`Stop` seal 校验和 outbound 门禁等硬行为才生效。

没有 `$research` 或 `/research` 激活别名；在对话中提到 Skill 名称不会打开硬模式。用户只能用精确文本 `# research-abort` 中止，终态 `aborted` 由 Hook 负责，workflow CLI 不能自行授权中止或完成。

```text
进入 orchestrator Skill
  -> project workflow.json（open）
  -> brief 与 source plan；必要时用自然语言请求普通 research helper
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

Hook 被调用、`SessionStart` 打了字，或多走几轮模型，都不算研究做完。真正看的是 workflow phase、anchor 能不能解析、claim 状态规则、正式产物是否生成、哈希能不能重算、回执是否对得上，以及最后一次看得见的修改之后证据还新不新。

捕获内容和 hook 事件写在当前工作目录的 `.research/state/`。`.research/.gitignore` 忽略该工作目录的全部内容，插件不会修改项目根目录的 `.gitignore`。`.mcp.json` 不得用 `CLAUDE_PLUGIN_DATA` 占位符覆盖平台环境；工作区路径由 MCP workspace root 解析。

## 项目目录与写入权限

```text
.research/runs/<run-id>/
  workflow.json
  brief.md
  source-plan.md
  skill-trace.jsonl
  handoffs/outbound/*    # 仅 sealed 后
  claims.draft.json
  research.json          # 仅 seal 写入
  report.md              # 仅 seal 写入
```

捕获的 source body 与 MCP event stream 保存在平台插件数据目录并使用私有权限。若不希望运行记录进入版本控制，应忽略 `.research/`。`.firecrawl/` 输出只有重新通过 MCP 捕获后才能作为证据。

| 路径 | 允许 writer |
| --- | --- |
| `workflow.json` 的 phase 与 completeness | workflow CLI、MCP 或已校验 lifecycle Hook |
| brief、source plan、skill trace、claims draft | open 运行中的 orchestrator、workflow CLI 或 agent |
| `research.json`、`report.md` | 仅 `research_seal` |
| `handoffs/outbound/**` | phase 为 `sealed` 后的 `handoff-outbound` CLI |

`research_begin` 将一个运行绑定到 MCP workspace root 并同步 `workflow.json`。MCP 工具标识带宿主 namespace，应选择以 `__research_begin`、`__source_capture` 等结尾的已注册标识，不能输出裸短函数名。`source_discover` 可在内部使用 Firecrawl；若可选 executable 未安装，它会返回 `available=false` 和恢复说明，agent 可用宿主搜索发现 URL 后继续 `source_capture`，不会再以 `spawn ... ENOENT` 中断。发现本身不是证据；`source_capture`、`source_read`、`source_anchor` 才建立证据，`research_seal` 校验 claim 并写 canonical report。

seal 后拒绝修改证据和重复 seal。通过校验的 `Stop` 会把 workflow 变为 `complete`，后续普通 prompt 不再处于硬模式。活动运行期间，直接修改 `workflow.json`、canonical seal 文件或 outbound handoff 路径会被阻断。

最终回复可选地指向匹配 report，并包含：

```text
Research-Evidence: research-evidence/v1
Research-Run: <run-id>
Research-Seal: sha256:<digest>
```

## 对外交接

seal 后使用 workflow CLI 的 `handoff-outbound`，记录 `handoffs/outbound/handoff.md` 和保存完整 prompt 的 `prompt.md`，之后按捆绑的 handoff 方法整理跨会话摘要。直接写 outbound 路径会被阻断。这项 CLI 转换只记录 lifecycle metadata，不会使已经不可变的 evidence seal 过期。

父会话拥有 MCP capture/anchor、claim 判定、seal 和 outbound handoff。它可以用自然语言把候选发现或长文阅读交给普通只读 subagent，但必须亲自打开其引用来源并通过 MCP 捕获、锚定；subagent prose 不是证据，也不能创建 seal receipt。

## 工作流 CLI

```bash
RESEARCH_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}"
test -n "${RESEARCH_PLUGIN_ROOT}" || { echo "evidence-based-research plugin root is unavailable" >&2; exit 1; }
RESEARCH_WORKFLOW="${RESEARCH_PLUGIN_ROOT}/dist/cli/research-workflow.mjs"

node "${RESEARCH_WORKFLOW}" run-open --cwd "$PWD"
node "${RESEARCH_WORKFLOW}" brief-write --cwd "$PWD" --question "研究问题" --scope "研究范围" --as-of "2026-08-13"
node "${RESEARCH_WORKFLOW}" completeness-check --cwd "$PWD"
node "${RESEARCH_WORKFLOW}" handoff-outbound --cwd "$PWD" --handoff-file /tmp/research-handoff.md --prompt-file /tmp/research-prompt.md
```

## Skill 组合

捆绑方法是阶段技术，不是替代入口：

- 一手来源方法：供父 agent 或可选普通 helper 使用的发现/阅读方法；返回内容只是待核实线索；
- 发现策略：硬运行仍使用 MCP `source_discover` / `source_capture`，直接 Firecrawl CLI 会被 Hook 拒绝；
- 学术候选：只用于候选发现；标题和摘要是不可信线索，必须解析到权威论文页面并经 MCP 捕获、锚定；
- handoff 方法：seal 后跨会话交接，精确 prompt 必须写入项目 `outbound/prompt.md`。

## 状态、并发与信任边界

Hook observation 是按 session 和 workspace 划分、TTL 24 小时的 append-only event 文件。活动模式由项目 `workflow.json` phase 与 Hook 回执共同重建。seal receipt 在已校验 `Stop` 写入 `complete` 前持续受门禁；新的 `research_begin` 会清除旧 seal 的权限。server 进程一次只允许一个未完成 MCP 运行，并绑定一个 workspace root。

seal 前的普通 workspace 修改会增加 Hook revision。seal 后 canonical manifest/report 和已捕获 evidence 保持不可变并由 Stop 重验；后续实现修改和 `handoff-outbound` 不再使有效 seal 失效，也不需要开启第二个 run。直接修改 canonical 或 outbound 路径仍会阻断。

- 宿主提供 MCP `roots/list` 时，它是权威根。Codex 0.146 对本地 stdio server 返回空列表，因此 Codex bundle 显式转发绝对启动 `PWD`；server 只在有 Codex 标记且 roots 为空时接受该 fallback。
- workspace capture 会解析符号链接并拒绝根目录外目标。
- 直接 HTTP 在每次 redirect 上执行 DNS public check。
- seal digest 只表示可观察工作流内的完整性，不是抵抗恶意同用户进程的签名。

缺少 Firecrawl 只影响发现。缺少 plugin data、有效单一 MCP root，或窄范围 Codex launch-root fallback 时，权威路径 fail-closed。未验证 claim 必须显示限制。正常最终答复可以出现在精确 trailer 之前；trailer 和 sealed artifacts 仍是证据完整性的权威边界。

## 验证

```bash
npx tsx --test plugins/evidence-based-research/tests/*.test.ts
./scripts/acceptance/run.sh --plugin evidence-based-research
```
