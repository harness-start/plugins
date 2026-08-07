# intent-clarify-gate 设计

> 完整协议、状态机与对话模拟见同插件：  
> **[docs/grill-me-hooks-design.md](./docs/grill-me-hooks-design.md)**（v3.1）。  
> 本文件只描述 **实现落点**（与 hooks 脚本对应）。

## 责任边界

插件只做 **会话 phase 物理定律**：

- 入口前缀匹配  
- 用户输入机械分类  
- open 期间业务写屏障  
- Stop 解析「完成」选项编号  
- 状态损坏 / TTL **fail-open**

不负责：生成题干、替用户做决策、语义猜测是否该 grill、默认联网 `npx skills add`（配置可开，CI 默认 off）。

## Phase

`idle` →（入口前缀）→ `open` →（`完成` / 完成项编号 / `# grill-abort`）→ `closed`

写屏障：`phase === open && writeBlock.mode === "block"`。

台账白名单：`.grill-ledgers/**`、`docs/decisions/**`、可选 `**/spec.md`。

## 用户输入（open）

| 输入 | class | phase |
|------|-------|-------|
| `1` / `2` / `3` | choice | open |
| `1 但是…` | choice_note | open |
| 无数字前缀自由文本 | constraint | open |
| `完成`[+说明] | done | closed |
| 选中 `N. 完成 — …` 的 N | done | closed |
| `# grill-abort` | abort | closed |

## 代码映射

| 模块 | 职责 |
|------|------|
| `scripts/lib/policy.mjs` | 入口、分类、完成项、路径白名单 |
| `scripts/lib/state-store.mjs` | session 状态原子写 / fail-open |
| `scripts/intent-clarify-gate.mjs` | `prompt` / `pre` / `stop` 宿主入口 |
| `hooks/claude.json` · `codex.json` | 双宿主事件接线 |

## 状态

按 `sessionId + cwd` 摘要隔离，原子写入 `PLUGIN_DATA` / `CLAUDE_PLUGIN_DATA` 下 `intent-clarify-gate/`，权限 0600。无数据目录时本 turn 仍可计算，但不持久（fail-open）。

## 恢复

阻断文案包含 observedFacts / harm / unblockWhen / recovery。用户回复 `完成`、选完成项、或 `# grill-abort` 后写屏障解除。
