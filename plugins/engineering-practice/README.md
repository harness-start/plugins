# 工程实践

`engineering-practice` 在 Claude Code 和 Codex 的 `SessionStart` 注入轻量路由提示：仅在匹配的工程场景，通过宿主原生入口加载必要社区 Skill，再开始实质工作。

| 场景 | Skill |
|---|---|
| 非简单的代码实现、审查或重构 | `karpathy-guidelines` |
| bug、测试或构建失败、性能退化、异常行为 | `systematic-debugging` |
| 准备声明完成、修复或通过 | `verification-before-completion` |

只加载当前任务需要的方法。内容润色、语气和文风不属于本插件职责。用户指令、项目指令、安全规则和平台规则优先。

## 安装依赖

仓库根目录执行：

```bash
bash scripts/install-all.sh
```

安装器按 `skill-deps.json` 中的精确 Git commit 安装社区 Skill。只通过宿主 marketplace 单独安装插件时，需要另行安装声明的外部 Skill。选中路线的必要 Skill 缺失或不可读时，内部编排必须停止并报告缺口，不能用当前会话知识模仿缺失能力。

## 边界

SessionStart 只负责工程方法编排，不处理专业写作，也不提供硬门禁。Hooks 的硬约束独立运行，不能把上下文注入、Skill 加载或额外模型轮次当成结果有效的证明。本插件不创建状态目录。

## 来源

- `karpathy-guidelines`：MIT
- `systematic-debugging`、`verification-before-completion`：MIT

外部 Skill 固定到 `skill-deps.json` 声明的 commit，不复制社区 Skill 正文。
