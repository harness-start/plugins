# `deliver` — 通用交付

产品合同见 [../architecture/design.md](../architecture/design.md)。

## 何时用

- 新功能、行为变更、缺陷修复——任何需要可判定成功标准再改代码的场景。
- LLM 判断「这是交付」后应调用 **`pcf begin`**（hooks **不会**替你判断意图）。

## 何时不用

- 纯问答 / 解释代码 → 不调用 begin。  
- 紧急止血 → abandon / mode off / bypass（须合法 sessionId + reason）。  
- 只探索不改动 → 不 begin。

## 如何开始

```text
pcf begin --session-id <hook注入的当前会话> --title "<短标题>"
```

- **sessionId 必填**；工具在 `~/.claude` / `~/.codex` 校验合法性。  
- **并行任务：** 再调一次 begin（新 title）。  
- **同仓其它窗口：** 各自 sessionId 隔离；人类无需管理该字段。

## 阶段与文件

路径：`.process-confidence/runs/<runId>/`

| 阶段 | 文件 | 必选标题锚点 |
| --- | --- | --- |
| intent | `stages/01-intent.md` | `## 非目标`、`## 成功标准` |
| plan | `stages/02-plan.md` | `## 涉及文件`、`## 验证`、`## 回滚` |
| implement | 业务代码 | — |
| verify | 合法 receipts | — |
| done | **hook 自动 complete** + export | — |

## Hard gates

- begin：非法 / 缺失 sessionId → 拒绝创建。  
- 缺 stage / 锚点 / receipt → 不收口；Stop block。  
- Hooks **禁止**自动 begin。  
- PreToolUse 护盘 receipts / run.json / 他会话 runs。
