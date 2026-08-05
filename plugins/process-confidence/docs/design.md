# 流程置信度 — 产品设计合同

**状态：设计阶段。** 本文件是产品行为的唯一权威说明；根 [README.md](../../README.md) 只做项目介绍与走通示例。  
**实现状态：** 无可运行实现。

**交付目标：** 可安装的 Claude Code 插件、Codex 插件。  
**一句话：** 给 coding agent 套一层「流程清单 + 可观察中间文档 + hook 签发的验证回执」。**创建 Run 由 LLM 调用工具完成**（显式 `sessionId` + 合法性校验）；**推进 / 留痕 / 护盘 / 收口 / Stop 门禁由 hooks 自动完成**。人类只看 `ACTIVE.md` 与导出证据，不学 slash、不手填会话 ID。

---

## 1. 是什么 / 不是什么

### 是什么

1. **约束** 通用交付流程有哪些阶段、磁盘上要留下哪些文档。
2. **观察** 固定生产区 `.process-confidence/`；人类只读 `ACTIVE.md`。
3. **LLM 工具开 Run** 提供签发工具（如 `pcf begin`），**必须显式传入 `sessionId`**，并在 `~/.claude` / `~/.codex` 校验该 ID 是否为真实会话。
4. **Hooks 自动执行其余主路径** 注入上下文、护盘、写 receipt、推 stage、条件满足时自动 complete、Stop 门禁。
5. **Stop 门禁** 本会话尚有「应完成且未完成」的 Run 时，禁止结束本轮。

### 不是什么

| 不做 | 原因 |
| --- | --- |
| **Hooks 识别用户意图并自动创建 Run** | Hook 看不到可靠「意图」；启发式易误开/漏开，**禁止** |
| 以 `/pcf …` 作为人类 slash 主入口 | 人类不学命令；LLM 用工具面，hooks 负责生命周期 |
| 要求**人类**理解或填写 `sessionId` | 人类心智只看流程标题；`sessionId` 由 hook 注入给 LLM，再由工具入参显式提交 |
| 本地拼接 / 伪造 `sessionId` | 只接受平台真实会话，并用磁盘痕迹校验 |
| 维护 `index.json` 第二真相源 | 扫描 `runs/*/run.json` 即可 |
| 多流程类型分类 | MVP 只 `deliver` |
| 仓库级「永远只有一个 active Run」 | 支持一会话多 Run、同目录多会话 |

### 设计转向摘要

| 方向 | 合同 |
| --- | --- |
| **创建 Run** | **仅** LLM 调用工具；hooks **永不**因「像交付」而 begin |
| **sessionId** | 工具**必填**；校验 `~/.claude` ∪ `~/.codex`；hooks 事件 id 用于对照与注入，**不**替代工具入参 |
| 人类心智 | 只看 ACTIVE / 阶段 / 标题；默认 UI 不晒 sessionId |
| 磁盘 | `runs/<runId>/` 唯一机器真相；无 `index.json` |
| 创建之后 | hooks：receipt、推 stage、自动 complete、护盘、Stop |
| 逃生 | abandon / bypass / mode（须 reason + 合法 sessionId） |

---

## 2. 使用者可见物

| 可见物 | 作用 |
| --- | --- |
| `.process-confidence/` | 生产区（gitignore） |
| `ACTIVE.md` | **人类唯一日常入口**：进行中的流程、阶段、阻塞、下一步（自然语言，默认不晒 sessionId） |
| 会话内注入上下文 | 告诉 **LLM**：当前 sessionId（供工具入参）、已有流程、工具怎么调、Stop 会拦什么 |
| 被拒文案 | 缺文档 / 缺回执 / sessionId 非法 / 未 begin 就改代码 |
| `docs/process-evidence/<runId>.md` | 收口后可提交证据快照 |

**30 秒验收（人类）：** 打开 `ACTIVE.md`，能说出「有几条流程、卡在哪」。  
**硬验收 A（begin）：** 无 `sessionId`、或 id 在 `~/.claude`/`~/.codex` 无痕迹 → `pcf begin` **稳定拒绝**。  
**硬验收 B（Stop）：** 本会话 required open Run 未收口 → Stop block。  
**硬验收 C（自动收口）：** stages + 有效 receipt 齐 → hook 自动 complete（无需人类敲 complete）。  
**硬验收 D（护盘）：** agent 写 `receipts/**` 或 `run.json` 受控字段 → PreToolUse deny。  
**硬验收 E（无意图自动 begin）：** 任意 hook 路径 **不得** 新建 `runs/*`。

---

## 3. 概念

### 3.1 对外（人类）

| 词 | 含义 |
| --- | --- |
| **流程（Run）** | 一次交付实例：标题、阶段、文档、证据 |
| **阶段（Stage）** | intent → plan → implement → verify → done |
| **证据（Receipt）** | hook 在验证命令成功后签发的回执 |

### 3.2 对内（实现 / LLM 工具）

| 概念 | 含义 |
| --- | --- |
| **sessionId** | 平台会话标识。写入 `run.json` / receipt；**创建与改机器态的工具必须显式传入**；hooks 从事件读取用于注入与对照。 |
| **Run / Stage / Artifact / Receipt / Gate / ACTIVE** | 同前 |
| **Session registry** | 只读探测 `~/.claude` 与 `~/.codex`，判定 sessionId 是否合法（§3.3） |

### 3.3 sessionId：来源、显式入参、合法性校验

#### 3.3.1 分工

| 角色 | 对 sessionId 做什么 |
| --- | --- |
| **平台 / hook 事件** | 事件 JSON 带当前会话 id（字段名随平台） |
| **SessionStart 等 hooks** | 把该 id **注入给 LLM**（「调用流程工具时请传 sessionId=…」）；扫描该 id 下已有 open runs |
| **LLM** | 调用 `pcf begin` / 其它写工具时 **显式传入** sessionId（从注入上下文抄，不自造） |
| **工具实现** | **校验** id 非空 + `validateSessionId` 通过 +（若改已有 run）所有权匹配 |
| **人类** | **不**需要知道或填写 sessionId |

#### 3.3.2 禁止

1. 用 `local-<pid>-<ts>`、hostname、cwd hash 等**拼接假 id**。  
2. hooks 根据提示词/写文件**自动 begin**。  
3. 工具在缺省 sessionId 时静默使用「猜的」id。  
4. 仅信任调用方字符串、不查 `~/.claude` / `~/.codex`。

#### 3.3.3 `validateSessionId(sessionId)`（权威算法）

输入：非空字符串 `sessionId`。  
输出：`{ ok: true, agent: "claude" | "codex", evidence: string }` 或 `{ ok: false, reason }`。

**Claude Code（`~/.claude`，路径以用户 home 为准，实现可配置 `CLAUDE_HOME`）：**

任一条命中即视为合法 claude 会话：

| # | 证据（存在即算） |
| --- | --- |
| C1 | `~/.claude/session-env/<sessionId>/` 为目录，或同名条目存在 |
| C2 | `~/.claude/projects/*/<sessionId>.jsonl` 存在（任意 project 编码目录下） |
| C3 | `~/.claude/projects/*/<sessionId>/` 为目录 |

**Codex（`~/.codex`，可配置 `CODEX_HOME`）：**

任一条命中即视为合法 codex 会话：

| # | 证据 |
| --- | --- |
| X1 | `~/.codex/session_index.jsonl` 中任一行 JSON 的 `id` 字段等于 `sessionId` |
| X2 | `~/.codex/sessions/**` 下文件名包含该 `sessionId`（典型：`rollout-…-<sessionId>.jsonl`） |

**规则：**

- C* 与 X* **并集**：任一平台命中即可（同一机器可能装两个 agent）。  
- 若同时命中两边：`agent` 可标 `ambiguous`，**仍 ok**（允许创建 Run）；`run.json` 可记 `agentHint`。  
- 两边都不命中 → **拒绝**创建/写机器态。  
- 实现须防路径穿越：`sessionId` 不得含 `/`、`..` 等；仅允许平台可见的 id 字符集（如 UUID / ULID）。  
- 校验为**只读**访问 registry，不修改 `~/.claude` / `~/.codex`。

```text
validateSessionId(id):
  if id empty or invalid charset → fail invalid-session-id
  if claudeEvidence(id) → ok(agent=claude)
  if codexEvidence(id) → ok(agent=codex)
  → fail session-not-found-in-registry
```

#### 3.3.4 对人类屏蔽、对 LLM 必要

- ACTIVE / 人类 deny 主文：默认不展示原始 sessionId（`showSessionIdInActive: false`）。  
- 注入给 LLM：必须包含可复制的 sessionId 与工具示例。  
- 工具错误信息：可对 LLM 写明「sessionId 未在 ~/.claude 或 ~/.codex 找到」。

### 3.4 并发模型

| 场景 | 行为 |
| --- | --- |
| 同一会话、多个交付任务 | LLM **多次** `begin`（不同 title）→ 多 open Run |
| 同一目录、多个会话 | 各 Run 绑定创建时校验过的 sessionId；Stop 只门禁**当前 hook 事件**中的 sessionId |
| 会话 A 写会话 B 的 Run | PreToolUse deny |
| 伪造 sessionId begin | `validateSessionId` fail |
| 崩溃恢复 | 同一真实 sessionId 再次注入 → 续挂其 open runs |

---

## 4. 磁盘约定（真相源）

### 4.1 布局（无 index.json）

```text
.process-confidence/
├── ACTIVE.md
├── config.yaml               # 可选
├── runs/
│   └── <runId>/
│       ├── run.json          # 含 sessionId（工具 begin 写入）
│       ├── stages/
│       │   ├── 01-intent.md
│       │   └── 02-plan.md
│       └── receipts/
└── archive/
    └── <runId>/
```

**无 `index.json`：** 避免双写；`listOpenRuns()` 扫描 `runs/*/run.json`。

### 4.2 `run.json` 核心字段

| 字段 | 必需 | 对外 | 含义 |
| --- | --- | --- | --- |
| `runId` | 是 | 短 id 可展示 | 全局唯一 |
| `sessionId` | 是 | 人类默认不展示 | begin 时显式传入并已通过 registry 校验 |
| `agent` | 否 | 否 | `claude` / `codex` / `ambiguous`（校验结果） |
| `type` | 是 | 可选 | MVP `"deliver"` |
| `title` | 建议 | **主展示** | 短标题 |
| `status` | 是 | 衍生 | `open` \| `done` \| `abandoned` |
| `stage` | 是 | **主展示** | 阶段 |
| `mode` / `required` / `blockers` | 是 | 按需 | 门禁相关 |
| `createdAt` / `updatedAt` | 是 | 可选 | ISO 8601 |

### 4.3 写入权限

| 路径 | 谁可写 |
| --- | --- |
| `runs/<id>/stages/**` | 拥有该 run 的会话中的 Agent（当前 hook sessionId == run.sessionId） |
| `run.json` 受控字段、`receipts/**`、`ACTIVE.md` | **仅 hook** 或**已校验 sessionId 的签发工具** |
| 新建 `runs/<id>/` | **仅** `pcf begin`（或等价工具），且 sessionId 校验通过 |
| 他会话 `runs/**` | 禁止 |
| `docs/process-evidence/` | 仅自动 complete 成功路径 |

### 4.4 Receipt

```json
{
  "id": "receipt-20260805-001",
  "runId": "run-20260805-001",
  "sessionId": "<validated-or-hook-session>",
  "kind": "verify",
  "command": "npm test",
  "exitCode": 0,
  "severity": "pass",
  "summary": "Tests: 42 passed, 0 failed",
  "at": "2026-08-05T12:00:00Z",
  "issuer": "pcf-hook"
}
```

- Hook 写 receipt：使用**事件中的** sessionId，且必须 `== run.sessionId`。  
- `issuer`：`pcf-hook`（主）或 `pcf-tool`（仅平台无 PostToolUse 时降级代签，仍须合法 sessionId）。

### 4.5 Git

默认 `.process-confidence/` gitignore。  
收口后 export → `docs/process-evidence/<runId>.md`。

---

## 5. 流程类型 MVP：`deliver`

详见 [../process-types/deliver.md](../process-types/deliver.md)。

| 阶段 | 文件 | 推进 |
| --- | --- | --- |
| intent | `stages/01-intent.md`（`## 非目标` + `## 成功标准`） | hook 检测锚点 → plan |
| plan | `stages/02-plan.md`（`## 涉及文件` + `## 验证` + `## 回滚`） | hook → implement |
| implement | 业务代码 | 首张有效 verify receipt → verify |
| verify | receipts | **hook 自动 complete**（gateRun 过）→ done |
| done | export + archive | — |

**创建：** 不在上表；见 §6 工具 `begin`。

**`gateRun`：** intent 锚点 + plan 锚点 + ≥1 合法 receipt（runId 匹配，severity ≥ minSeverity）。

**`required_for_stop`：**

```text
run.sessionId == <当前 hook 事件 sessionId>
AND status == open AND mode == on AND required == true
```

`begin` 创建的 `deliver` Run 默认 `required=true`。

**orphan-work（无自动 begin）：**  
本会话对业务路径有 Write/Edit，且扫描后**无**本会话 open Run → Stop 可 block（`orphanWorkStop`，默认 on），并注入：「请先调用流程工具 begin（传入 sessionId=…）」。  
**不得**因此自动创建 Run。

plan 旁路 note：修改不在「涉及文件」中 → ACTIVE 记 non-blocking note。

---

## 6. 职责划分：工具创建 + Hooks 运转

### 6.1 原则

```text
人类：提需求；看 ACTIVE；被 block 时看解阻说明
LLM：判断是否交付 → 调用 begin(sessionId, title, …) → 写 stages / 改代码 / 跑测试
Hooks：注入 sessionId 与状态；护盘；receipt；推 stage；自动 complete；Stop 门禁
禁止：Hooks 猜测意图并 begin
```

### 6.2 工具面（LLM 主用：创建与逃生）

实现可为 CLI（`bin/pcf`）和/或 MCP tools，**语义同一套**。

#### `pcf begin`（创建 Run — 主路径）

```text
pcf begin --session-id <sessionId> --title <str> [--type deliver] [--mode on]
```

| 步骤 | 行为 |
| --- | --- |
| 1 | 校验 `--session-id` 非空、字符集合法 |
| 2 | `validateSessionId`（§3.3.3）；失败 → 非零退出 + 固定错误码 `session-not-found-in-registry` |
| 3 | 生成 `runId`，写 `runs/<runId>/run.json`（写入 sessionId、agent 提示） |
| 4 | 拷贝 `templates/deliver/stages/*` |
| 5 | 刷新 ACTIVE；返回 runId、stages 路径、下一步（给 LLM） |

并行第二任务：再调一次 `begin`（新 title），**不要** hooks 自动开。

#### 其它工具（均须 `--session-id`，写操作均 `validateSessionId`）

```text
pcf status  --session-id <id> [--run <runId>]
pcf check   --session-id <id> [--run <runId>]
pcf abandon --session-id <id> --run <runId> --reason <str>
pcf bypass  --session-id <id> --run <runId> --reason <str>
pcf mode    --session-id <id> --run <runId> --on|--off
pcf timeline --session-id <id> [--run <runId>]
```

- 写已有 run：额外检查 `run.sessionId == 入参 sessionId`。  
- **不提供**无 sessionId 的「隐式当前会话」写 API（避免假 id / 错绑）。  
- 只读扫描类调试命令若省略 sessionId，仅输出聚合只读视图，且不改盘。

### 6.3 Hooks（不创建 Run）

| Hook | 做 | **不做** |
| --- | --- | --- |
| **SessionStart** | 读事件 sessionId → 注入该 id + 本会话 open runs + `begin` 用法 | 不 begin |
| **UserPromptSubmit** | （可选）仅注入提醒「若属交付请先 begin」 | **不**意图分类、**不**建 Run |
| **PreToolUse** | 护盘机器态 / 他会话 runs | 不建 Run |
| **PostToolUse** | 验证命令 → receipt；锚点 → 推 stage；gateRun 过 → 自动 complete；业务写 → orphan 标记 / plan note | **不**因无 Run 而 begin |
| **Stop** | 可选先自动 complete 已就绪 run；再 `gateSessionStop`；orphan-work block | **不** begin |

### 6.4 注入文案原则

- 必须含：`sessionId=<…>`（供工具复制）、`pcf begin --session-id … --title "…"` 示例。  
- 有 open runs：标题 | 阶段 | blockers | 路径。  
- **禁止**：「框架已根据你的意图自动创建流程」。  
- **禁止**要求人类去填 sessionId。

### 6.5 创建之后仍自动的部分

一旦 Run 存在：

1. 写齐 intent/plan 锚点 → hook 推 stage  
2. 跑测试 → hook 写 receipt  
3. gateRun 过 → hook 自动 complete + export + archive  
4. Stop 扫本会话 required runs  

LLM **不必**再调 complete（除非平台无 hook 降级）。

---

## 7. 平台映射

### 7.1 Claude Code

- Hooks：SessionStart、PreToolUse、PostToolUse、Stop；（UserPromptSubmit 仅提醒，不 begin）  
- 事件 sessionId → 注入；工具 begin 再显式传入并查 `~/.claude`  
- Stop：`decision: block` 为目标形态  

### 7.2 Codex

- 同语义；registry 查 `~/.codex`  
- 缺 hook 时：工具面降级 + 能力表标红；**仍禁止**无校验 begin  

### 7.3 共享

`validateSessionId` / `gateRun` / `gateSessionStop` / receipt 校验为跨平台纯函数（registry 路径可注入）。

---

## 8. Deny / Block 文案

### 8.1 begin 会话非法

```text
[process-confidence] begin rejected
error: session-not-found-in-registry
sessionId: <redacted-or-full-for-llm>
checked: ~/.claude (session-env, projects/*/<id>.jsonl), ~/.codex (session_index.jsonl, sessions/**)
harm: 拒绝绑定到无法证明存在的会话
unblock:
  - 使用 hook 注入的当前 sessionId 重新调用 begin
  - 勿编造或拼接 sessionId
```

### 8.2 Stop：未 begin 的孤儿改动

```text
[process-confidence] stop blocked — orphan work without run
harm: 本会话已改业务文件但尚未创建交付流程
unblock:
  - pcf begin --session-id <injected> --title "<任务短标题>"
  - 或还原改动后重试结束（纯探索可将 orphanWorkStop 关闭）
```

### 8.3 Stop：流程未收口

```text
[process-confidence] stop blocked — 本会话仍有未收口流程
flows:
  - 登录限流 (run-20260805-001) stage=implement
    blockers: missing-receipt
unblock:
  - 补 stages / 运行测试（回执与收口由 hook 自动完成）
  - 或 pcf abandon --session-id <…> --run <…> --reason <…>
```

---

## 9. Export

自动 complete 成功 → `docs/process-evidence/<runId>.md` → archive → 刷新 ACTIVE。  
导出物默认可不含 sessionId 正文。

---

## 10. 仓库结构（实现期）

```text
process-confidence/
├── README.md
├── docs/architecture/design.md    # 本文件
├── docs/process-types/deliver.md
├── templates/deliver/stages/
├── schemas/ run + receipt
├── src/
│   gate / scan / active / receipt / match / stage / complete
│   session-registry.js            # validateSessionId(~/.claude|~/.codex)
│   ownership.js
├── bin/
│   pcf                            # begin 等工具（LLM 主用创建）
│   pcf-hook-*                     # 不 begin
├── plugins/claude|codex/
└── tests/
```

| 阶段 | 交付 |
| --- | --- |
| P0 | 本设计 |
| P1 | schema + `validateSessionId` + begin/gate fixture |
| P2 | Claude：工具 begin + hooks 运转 + Stop |
| P3 | Codex 插件 + registry 路径差异 |

---

## 11. 配置

```yaml
# .process-confidence/config.yaml
mode: on
orphanWorkStop: on          # 无 Run 却改业务代码时 Stop block（不自动 begin）
verifyCommandHints: []
verifyCommandExclude: []
minSeverity: pass
showSessionIdInActive: false
claudeHome: ~               # 解析为 <home>/.claude；可测时覆盖
codexHome: ~
activeMaxRunsListed: 20
```

| 项 | 默认 |
| --- | --- |
| `orphanWorkStop` | `on` |
| **autoBind / 意图自动 begin** | **不存在**（已删除） |
| index.json | 不使用 |
| 人类 slash 主入口 | 无 |

---

## 12. 对抗与默认

| # | 攻击 | 缓解 |
| --- | --- | --- |
| 1 | 空壳 md | 仍要 receipt |
| 2 | 自写 receipt | issuer + PreToolUse |
| 3 | 伪造 sessionId begin | registry 校验 |
| 4 | 省略 sessionId | 工具拒绝 |
| 5 | hooks 意图误开 Run | **禁止** hooks begin |
| 6 | 不 begin 改代码就 Stop | orphanWorkStop |
| 7 | 串 run / 他会话 | ownership + PreToolUse |
| 8 | 路径穿越 sessionId | 字符集白名单 |
| 9 | index 双写 | 无 index |

| 问题 | v1 默认 |
| --- | --- |
| 谁创建 Run | LLM 工具 `begin` |
| hooks 能 begin 吗 | **否** |
| sessionId 校验 | `~/.claude` + `~/.codex` |
| 人类是否填 sessionId | 否 |
| 自动 complete | 是（Run 已存在且 gate 过） |

---

## 13. 文档与演进

- 改产品行为：先改 **本文件**。  
- 根 README 仅介绍 + 示例。  
- **禁止回潮：** hooks 意图自动 begin、无校验 sessionId、index.json 第二真相源、要求人类管理 sessionId。

### 相关

| 文档 | 内容 |
| --- | --- |
| [../process-types/deliver.md](../process-types/deliver.md) | deliver 说明 |
| [README.md](./README.md) | 架构索引 |
| [../../README.md](../../README.md) | 项目介绍与 Codex 示例 |
