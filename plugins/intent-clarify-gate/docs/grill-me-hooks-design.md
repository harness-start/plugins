# grill-me Hooks 设计草案

> 状态：草案 **v3.1** — **已由本插件实现**  
> 位置：`plugins/intent-clarify-gate/docs/grill-me-hooks-design.md`  
> v3：用户协议收敛为选项制 + `完成` 退出。  
> **v3.1：**  
> 1. 路径大致摸清后，LLM **必须在 1/2/3 中显式给出「完成」选项**，避免用户不知道何时结束；  
> 2. 支持 **`1 但是我觉得 xxx 改为 yyy`**（选题 + 附加说明同条）。  
> 原则：不发明 slash skill；进入看开头前缀；退出可机械判定；写屏障不得死锁。  
> 日期：2026-08-07  
> 实现落点：同目录上级 [`README.md`](../README.md)、[`DESIGN.md`](../DESIGN.md)。

---

## 0. 版本演进

| 版本 | 要点 |
|------|------|
| v1 | 虚构 `/grill-me:confirm` 等（已弃） |
| v2 | awaiting_close + 确认短语表（偏重） |
| v3 | 仅 `1`/`2`/`3`/`完成`；其它=条件变更 |
| **v3.1** | **完成进选项**；**选题可带附加说明**；hooks 识别「完成选项编号」 |

**可行性：仍然可行。** 比 v3 多两点 skill 合同与稍宽的输入解析，换明显更好的 UX。

**适用边界：** 一题一问 + 三选一（本地 grill-me）。上游整轮多题自由答需改为单题三选一，或关闭 write-block。

---

## 1. 产品工作流

```text
U: /grill-me <主题>                 ← 入口（开头前缀；主题自由文本）
H: ensure skill → phase=open → 注入短协议

A: 探索后出题，固定 3 个选项 1/2/3
   · 路径未清：三项都是实质决策分叉
   · 路径已清：至少一项标题以「完成」起头（见 §6）

U: 2                                ← 纯选题
U: 1 但是回流窗口改成 3 天           ← 选题 + 附加说明（v3.1）
U: 我们其实已有 outbox               ← 纯条件变更（无 1/2/3 前缀）

A: 吸收选择/说明/变更 → 下一题或重出本题 1/2/3
   · 若该出「完成」选项却未出 → 违规（Stop report）

U: 3     （若 3 是「完成 — …」）    ← 选完成项 → closed
U: 完成  （随时可打）               ← 元退出 → closed

U: 实现 …                           ← 写屏障 OFF
```

逃生：`# grill-abort`、会话结束、TTL。

---

## 2. 目标

| ID | 内容 | 强度 |
|----|------|------|
| G1 | 进入：有效正文**开头**匹配入口 token | 硬 |
| G2 | `open` 期间禁止业务写入（可配） | 硬 |
| G3 | 退出：`完成` 元命令，或选中「完成选项」对应编号 | 硬 |
| G4 | 无 1/2/3 前缀的自由文本 → 条件变更，不退出 | 硬 |
| G5 | 支持 `N` + 附加说明；记录选择并带上说明 | 硬 |
| G6 | 路径大致摸清时 agent **必须**提供「完成」选项 | 硬（skill+Stop） |
| G7 | 缺 skill 静默安装；无死锁 | 硬 |

非目标：NLP 猜是否该 grill；虚构 slash command；hooks 写题干。

---

## 3. 状态机

```text
idle ──(/grill-me 开头 + skill ok)──► open
                                        │
         ┌──────────────────────────────┤
         │  choice（1|2|3 可选+说明）   │  若编号 == completeChoice
         │       且非完成项 ────────────┼──► 保持 open
         │  choice 且是完成项 ──────────┼──► closed (completed)
         │  元命令「完成」(+可选说明) ──┼──► closed (completed)
         │  纯条件变更 ─────────────────┼──► 保持 open
         │  # grill-abort ──────────────┼──► closed (aborted)
         │  TTL / session 结束 ─────────┼──► idle
         └──────────────────────────────┘

closed ──(再次 /grill-me)──► open
新 session 默认 idle
```

| phase | 写屏障 |
|-------|--------|
| `idle` / `closed` | OFF |
| `open` | ON |

```text
writeBlockActive <=> phase == open && writeBlock.mode == "block"
```

白名单：`.grill-ledgers/**`、`docs/decisions/**`、可选 `**/spec.md`。

### 3.1 状态字段

```text
phase, enteredAt, updatedAt, entryToken, topicPreview, turnIndex,
skillReady, closeReason,
lastUserClass,          // entry|choice|choice_note|constraint|done|abort
lastChoice,             // 1|2|3|null
lastNote,               // 附加说明摘要（截断）
completeOffered,        // bool：上一轮 assistant 是否已提供完成项
completeChoice,         // 1|2|3|null：完成项对应编号（Stop 解析）
```

损坏 → fail-open 当 `idle`。

---

## 4. 进入

有效正文：去 skill 块、围栏、hook 回注 → 去首空行。

入口 token（**开头**）：`/grill-me` · `$grill-me` · `/grilling` · `$grilling`  
后接 EOS / 空白 / `:` / `：`。句中不算。

同 turn：`matchEntry → ensureSkills → open → inject`。  
`/grill-me 主题` 整行算 **entry**，不走条件变更分类。

---

## 5. 用户输入解析（open 内、非 entry turn）

### 5.1 规范化

- trim  
- 全角数字 `１２３` → `123`  
- 首行参与结构化解析；多行时 **第一行** 定 class，其余并入 note

### 5.2 分类算法

```text
function classify(text, state):
  t = normalize(text)
  if empty(t): return ignore

  // 工程逃生
  if matches(t, /(^|\s)#\s*grill-abort\b/): return abort

  // 元退出：整段「完成」，或首 token 为「完成」
  // 例：完成
  // 例：完成 顺便台账写到 docs/decisions/
  if t == "完成" or t matches /^完成([\s,，:：].*)?$/:
    return done(note = optional_rest)

  // 选题：以 1|2|3 开头，后可接分隔符 + 说明
  // 例：1
  // 例：1.
  // 例：2 但是回流改成 3 天
  // 例：3、先做 board 级
  // 例：1：用 JWT，刷新 7 天
  m = match(t, /^([123])(?:\s*[.、:：]\s*|\s+)(.*)$/s)
     or match(t, /^([123])$/)
  if m:
    n = m[1] as 1|2|3
    note = trim(m[2] or "")
    if state.completeOffered and state.completeChoice == n:
      return done(note, viaChoice = n)   // 选了「完成」选项
    if note == "":
      return choice(n)
    return choice_note(n, note)

  // 其它任意文本
  return constraint(t)
```

**刻意拒绝当 choice 的形态（算 constraint，避免误解析）：**

- `12`、`选项1`、`我选1`、`第一`  
- 句中才出现的 1（`我觉得 1 不好`）

### 5.3 各类 hooks 动作

| class | phase | hooks |
|-------|-------|--------|
| `choice` | open | 记录 lastChoice；inject：用户选 N，请记入决策并出下一题 1/2/3 |
| `choice_note` | open | 记录 lastChoice + lastNote；inject：用户选 N，**并**附加约束「…」；合并后出下一题或重出本题（由 skill 判断说明是修正本题还是加全局约束） |
| `constraint` | open | inject：纯条件变更，**未选题**；重出本题 1/2/3；禁止结束、禁止开写 |
| `done` | **closed** | closeReason=completed；屏障 OFF；inject：访谈结束；若有 note 记为收束附加说明 |
| `abort` | **closed** | closeReason=aborted |

### 5.4 「1 但是…」语义（给 skill 的合同）

1. **先提交选项 N** 为当前决策点的选择（除非 N 是完成项 → 直接结束）。  
2. **附加说明** 不是新的独立退出，而是：  
   - 修正/收窄选项 N 的含义，和/或  
   - 写入后续题必须遵守的约束。  
3. Agent 下一轮应 **复述「已选 N + 理解后的说明」**，再出下一题；若说明与 N 矛盾，重出本题 1/2/3 请用户再选。  
4. hooks **不**解释自然语言，只保证 class 与写屏障。

---

## 6. 「完成」选项（解决迷糊）

### 6.1 问题

若「完成」只写在页脚说明里、从不出现在 1/2/3 中，用户不知道何时可以结束，会一直等下一题。

### 6.2 规则（skill 硬合同）

**路径未清**（仍有会改变方案的未决分叉）：

- 三个选项均为实质分叉；  
- **不要**把「完成」塞进选项（避免过早收束）；  
- 页脚仍可提示：随时可回 `完成` 强行结束（提前结束须在摘要标注）。

**路径大致摸清**（关键分叉已收敛，或剩余仅实现细节 / 可由默认值承担）：

- **必须**在 1/2/3 中提供恰好一项「完成项」：  
  - 行格式：`N. 完成 — <一句话说明将锁定的决策摘要或「按已选决策结束访谈」>`  
  - **标题以 `完成` 开头**（`完成` 后可接 `—`/`:`/空格）；  
  - 推荐把完成项标为 ➡️ 推荐（若适合结束）。  
- 另两项可为：继续深挖的剩余分叉，或「再确认一次某某假设」。

示例（路径已清）：

```text
**Q: 关键路径已收敛，下一步？**
1. 再确认：缓存 TTL 用 5 分钟还是 1 小时
2. 再确认：是否要管理端开关
3. 完成 — 结束访谈，锁定：Done=进列、瓶颈=双指标、范围=单 board
➡️ 推荐 3
（也可直接回复「完成」；选题可写：3 但是 TTL 先写进残余假设）
```

### 6.3 hooks 如何知道「完成项是几号」

**Stop**（assistant 刚出题后）扫描最后一条助手消息：

```text
completeChoice = null
completeOffered = false
for line in lines:
  if line matches /^\s*([123])\.\s*完成(\s|[—\-–:：]|$)/:
    completeChoice = that number
    completeOffered = true
    break  // 若多项匹配：取编号最小者并 report 警告「完成项应唯一」
```

写入 session 状态。下一轮 UserPromptSubmit 的 `classify` 用 `completeChoice` 判断用户选 N 是否为 done。

**失败模式：**

| 情况 | 处理 |
|------|------|
| 已多轮且决策很多，仍从不出现完成项 | Stop `report`：路径若已清请加入「N. 完成 — …」 |
| 用户发 `完成` 但 agent 从未 offer | 仍 **允许 closed**（元退出，G6）；摘要标「用户主动结束」 |
| 用户选完成项编号 | closed，与键入 `完成` 同等 |

启发式「路径是否摸清」**只由 LLM/skill 判断**；hooks 只做格式检测与完成项编号提取，不做业务理解。

---

## 7. 注入短协议（v3.1）

```text
[grill-me-guard] 访谈模式开启（业务写入已拦截）。

【agent】
1. 每轮一题，恰好 3 个选项，标记 1. 2. 3.；可标注推荐。
2. 关键路径大致摸清后，必须把其中一项写成：
   N. 完成 — <锁定说明>
   供用户选 N 或直接回「完成」结束。
3. 用户「N」或「N + 说明」：接受选项 N，说明为附加约束；复述后继续。
4. 用户纯文本（无 1/2/3/完成 前缀）：条件变更，重出 1/2/3，不结束。
5. 用户「完成」或选中完成项：输出已选决策摘要，停止访谈；未完成前不改业务代码。

【user 合法输入】
- 1 / 2 / 3
- 1 但是… / 2：…   （选题+附加说明）
- 完成 或 完成 + 说明
- 其它文字 = 条件变更
- 逃生 # grill-abort
```

---

## 8. Skill 静默安装

硬入口后、open 前：检测 `grill-me`；缺失则 `npx --yes skills add …`（可配 local-copy/off）。  
失败 → 保持 idle，不锁写。同 session 缓存 skillReady。

---

## 9. Hooks 清单

| Hook | 事件 | 职责 |
|------|------|------|
| `grill-entry` | UserPromptSubmit | 入口、ensure、open、inject |
| `grill-classify` | UserPromptSubmit | §5 分类；完成项/元完成 → closed |
| `grill-write-block` | PreToolUse | open 拦业务写 |
| `grill-stop-parse` | Stop | 解析 completeChoice；缺完成项可 report；假实现 deny |
| `grill-ttl` / session 结束 | — | 清锁 |
| `grill-resume-hint` | SessionStart | 台账提示，不自动 open |

---

## 10. 配置草案

```js
export default {
  entryTokens: ["/grill-me", "$grill-me", "/grilling", "$grilling"],
  // 选题：数字开头 + 可选说明
  choiceLine: /^([123])(?:\s*[.、:：]\s*|\s+)([\s\S]*)$/u,
  choiceOnly: /^([123])$/u,
  doneLine: /^完成(?:[\s,，:：]+([\s\S]*))?$/u,
  completeOptionLine: /^\s*([123])\.\s*完成(?:\s|[—\-–:：]|$)/u,
  enableEngineeringBypass: true,
  writeBlock: {
    mode: "block",
    ledgerAllow: [".grill-ledgers/**", "docs/decisions/**"],
    allowSpecMd: true,
  },
  stopGate: {
    blockImplementWhileOpen: true,
    remindCompleteOptionAfterRounds: 5, // 超过 N 轮仍无完成项则 report
  },
  skillInstall: {
    mode: "npx",
    source: "https://github.com/mattpocock/skills",
    skills: ["grill-me"],
    requireGrillingPrimitive: false,
    timeoutMs: 120000,
  },
  sessionTtlHours: 24,
};
```

---

## 11. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 过早出现「完成」选项 | skill：仅路径摸清后加入；用户仍可选其它项继续 |
| 过晚不出现 | Stop 按轮次 report；用户可随时键入 `完成` |
| 多个完成项 | 取最小编号 + report |
| `1 但是` 与选项语义冲突 | skill 复述并重出题；hooks 不裁决 |
| `完成度指标` 误退出 | 元退出要求 **完成** 作首 token/整段，子串不算 |
| 选完成项 `3` 但状态未解析到 completeChoice | 用户仍可打 `完成`；Stop 加强解析；fail 时 report agent 格式 |

---

## 12. 验收矩阵

| ID | 场景 | 期望 |
|----|------|------|
| A1 | `/grill-me 主题` | open |
| A2 | open + `2` | open，lastChoice=2 |
| A3 | open + `1 但是回流改 3 天` | open，choice_note |
| A4 | open + `我们已有 outbox` | open，constraint |
| A5 | A 出 `3. 完成 — …`，U `3` | closed |
| A6 | U `完成` | closed（无论是否 offer） |
| A7 | U `完成 台账放到 docs/decisions` | closed，带 note |
| A8 | U `完成度怎么算` | open（constraint） |
| A9 | open + Edit src | deny |
| A10 | closed 后 Edit src | allow |
| A11 | `# grill-abort` | closed/aborted |
| A12 | 多轮无完成项 | Stop report |
| A13 | 无 skill | 静默装或失败不 open |

---

## 13. 实现分期

| 阶段 | 内容 |
|------|------|
| P0 | 入口、classify（含 choice_note/done）、write-block、ensure skill、TTL |
| P0b | Stop 解析 completeChoice；skill/inject 完成项合同 |
| P1 | 缺完成项轮次提醒；假实现 deny；台账 hint |
| P2 | soft 建议入口（不自动 open） |

---

## 14. 结论

1. **退出：** 键入 `完成`，或选择标题以「完成」开头的选项编号。  
2. **路径摸清后：** agent **必须**把「完成」放进 1/2/3，降低迷糊。  
3. **输入：** `N`、`N + 说明`、纯条件变更、`完成[+说明]`；hooks 机械分类。  
4. **写屏障** 仅 `open`；完成/abort/TTL/新会话可释放。  
5. skill 与 hooks 必须双写合同；hooks 不发明 slash command。

---

## 附录 A. 对话模拟（v3.1）

### A.1 理想路径：中途带说明，收束时选项含「完成」

```text
U: /grill-me 看板吞吐和瓶颈
H: → open + 短协议

A: **Q: 「完成」如何定义？**
   1. 进入 Done 即完成
   2. Done 且 7 天无回流
   3. 仅生产发布算完成
   ➡️ 推荐 1
   （路径未清，无「完成」选项；页脚：可随时回「完成」强行结束）

U: 1 但是测试环境进 Done 不算，只有正式 board 算
H: choice_note(1, "测试环境…")
   仍 open

A: 已记录：选 1，附加：仅正式 board。
   **Q: 瓶颈指标？**
   1. 列停留 P95
   2. WIP 击穿次数
   3. 两者都要、可切换
   ➡️ 推荐 3

U: 3
H: choice(3)

A: **Q: 聚合范围？**
   1. 单 board
   2. 项目多 board
   3. 全局
U: 1

A: （判断关键路径已清）
   **Q: 关键路径已收敛，下一步？**
   1. 再确认：管理端是否要开关
   2. 再确认：指标刷新间隔
   3. 完成 — 锁定：正式 board 的 Done=完成；瓶颈双指标；范围=单 board
   ➡️ 推荐 3
H: Stop 解析 completeChoice=3，completeOffered=true

U: 3
H: 3 == completeChoice → closed，屏障 OFF

A: 摘要输出已锁定决策…
U: 实现 API
A: 可写代码 ✅
```

### A.2 选完成项时仍可带一句说明

```text
A: 1. …
   2. …
   3. 完成 — 按已选决策结束
H: completeChoice=3

U: 3 但是把「刷新间隔默认 30s」写进残余假设
H: done(viaChoice=3, note=…) → closed
A: 摘要中带上残余假设；不写业务代码除非用户下一条再要求实现
```

### A.3 直接键入「完成」（不等选项）

```text
（仍在深挖，选项里还没有完成项）

U: 完成
H: 元退出 → closed（允许；摘要标用户提前结束）
```

### A.4 纯条件变更

```text
A: **Q: 投递语义？** 1 / 2 / 3（实质分叉，无完成项）

U: 合规不能丢消息，仓库里已有 outbox
H: constraint，仍 open
   inject：未选题，请重出 1/2/3

A: **Q: 投递语义？（已按约束重出）**
   1. 复用 outbox，at-least-once
   2. 扩展 outbox + 幂等键
   3. 新建第二套队列
U: 2 但是重试上限先 5 次
H: choice_note(2, …)
```

### A.5 不会误锁 / 误放行

```text
U: 完成度用什么指标
H: 不是「完成」元命令 → constraint

U: 好的开始写吧
H: constraint；Write → DENY
   提示：选 1/2/3，或「完成」，或完成项编号
```

### A.6 放弃

```text
U: # grill-abort
H: closed/aborted，可写代码
```

---

## 附录 B. 时序

```text
        idle              open                          closed
         │                  │                              │
         │ /grill-me        │ 1 / 2 / 3                    │
         │                  │ 1 但是…（choice_note）       │
         │                  │ 纯文本（constraint→重出题）   │
         │                  │                              │
         │                  │ 完成 或 选「N. 完成 —」      │
         │                  │─────────────────────────────►│
         │                  │                              │
写代码    ✅                 ❌                             ✅
完成项    —            路径清后必须出现在 1/2/3 中           —
```

---

## 附录 C. 与 v3 的差异摘要

| 项 | v3 | v3.1 |
|----|----|------|
| 完成如何被发现 | 用户自知回「完成」 | **选项内出现「完成」** + 仍可键入「完成」 |
| `1 但是…` | 整段当 constraint，不记选 | **记选 N + note** |
| hooks 状态 | 无 completeChoice | Stop 解析完成项编号 |
| 迷糊风险 | 较高 | 明显降低 |
