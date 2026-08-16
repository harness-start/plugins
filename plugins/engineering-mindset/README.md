# 工程师思维

`engineering-mindset` 在 Claude Code 和 Codex 的 `SessionStart` 注入一段轻量路由提示，要求 agent 在匹配的工程场景先通过宿主原生入口加载最小必要 Skill，再开始实质工作。

| 场景 | Skill |
|---|---|
| 非简单的代码实现、审查或重构 | `karpathy-guidelines` |
| bug、测试或构建失败、性能退化、异常行为 | `systematic-debugging`，确认根因后再按 `karpathy-guidelines` 实施 |
| 准备声明完成、修复或通过 | `verification-before-completion` |
| 用户明确要求更短输出或减少 token | `caveman` |

简单请求、纯文案和不匹配这些条件的工作不会被强制加载 Skill。用户指令、项目指令、安全规则和平台规则优先。

## 安装依赖

仓库根目录执行：

```bash
bash scripts/install-all.sh
```

该脚本读取本插件的 `skill-deps.json`，把固定版本的社区 Skill 安装到 Claude Code 与 Codex 可见的全局 Skill 目录。只通过宿主 marketplace 单独安装插件时，宿主不会执行仓库的依赖安装脚本，需要另行安装 `skill-deps.json` 中列出的 Skill。依赖缺失时，Hook 要求 agent 明确报告缺失，不能声称已经加载。

## 边界

这是 advisory 提示，不是硬门禁。它能证明 SessionStart 上下文被注入，并可通过 live acceptance 检查依赖安装、路由合同和代表性任务结果；实际 Skill 加载保留为可观测证据，不作为纯提示机制能够稳定强制的效果。它不保证每个模型、每个任务都获得更高工程质量，也不创建状态目录或阻断工具调用。

`caveman` 只改变会话表达方式，不改变代码、命令、路径、错误文本或持久化文档。安全警告、不可逆操作确认和顺序敏感步骤保持完整表达。

v1 不包含 issue/PR `triage` 工作流。

## 来源

- `karpathy-guidelines`：MIT
- `caveman` Skill：MIT；这里只安装 Skill，不安装 Caveman 的其他运行时组件
- `systematic-debugging`、`verification-before-completion`：MIT

外部 Skill 通过 `skill-deps.json` 从固定 Git 提交安装；本插件不复制其正文。
