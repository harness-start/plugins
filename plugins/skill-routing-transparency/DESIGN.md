# skill-routing-transparency design

## Responsibility

插件只负责让主代理公开最终 Skill 路由与实际加载状态。路由选择继续由宿主 runtime 的 `skill-route-lookup.mjs` 负责，Skill 内容加载继续由代理完成。

它不负责选择算法、Skill 安装、候选评分解释、强制加载或完成态阻断。

## Events

| Event | Behavior |
| --- | --- |
| `SessionStart` | 注入完整透明度协议、平台 lookup 命令和公开格式 |
| `UserPromptSubmit` | 新任务轮次注入短提醒；短确认和宿主命令静默 |

不注册 `PreToolUse`、`PostToolUse`、`Stop` 或 `SubagentStop`。

## Public disclosure contract

公开行固定区分两类事实：

- 路由事实：`explicit`、`primary`、`companions`、`noMatch`、`unavailable`
- 加载事实：`loaded`、可选 `load_failed`

route lookup 命中不等于加载成功。只有 Skill tool、Skill injection 或 `SKILL.md` 成功读取后，Skill 才能进入 `loaded`。

第一阶段不公开完整候选列表和评分原因。这些字段适合独立的开发者审计视图，不适合每轮用户可见行。

## Failure behavior

- Hook stdin 无效、未知平台或内部异常：fail-open，仅写 stderr。
- Lookup 文件缺失、命令失败或 schema 无效：代理公开 `unavailable`，不声称 `noMatch`。
- 模型未输出公开行：本插件不阻断；后续如需强制执行，应新增独立 gate，而不是改变本插件的软透明职责。

插件不写磁盘，不保存 prompt、路由结果或会话标识。
