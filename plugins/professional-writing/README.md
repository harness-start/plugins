# 专业写作

`professional-writing` 在 Claude Code 和 Codex 的 `SessionStart` 注入轻量路由提示：仅在匹配的写作场景加载本插件 Skill，再开始实质写作。

| 场景 | Skill |
|---|---|
| 用户明确要求更短输出或减少 token | `writing-terse-output` |
| 英文内容撰写、改写或审阅 | `writing-english-prose` |
| 中文内容撰写、改写或审阅 | `writing-chinese-prose` + bundled `ai-flavor-remover` |
| 创建或编辑人类可读的 Markdown 正文 | 对应语言组合 + `writing-markdown-ai-style` |

中英正文都占实质篇幅时加载两套语言组合；零星外文术语按正文主语言处理。代码、命令、配置、机器输出、逐字引用和精确短回复不加载写作 Skill。事实、数字、URL、标识符、引文和 Markdown 结构必须保留。

`writing-markdown-ai-style` 用插件自带的 `dist/cli/analyze-ai-style.mjs` 定位重复出现的套话。分析结果只是定位证据，不能代替通读或授权批量替换。

## 边界

SessionStart 只负责写作 Skill 编排，不处理工程实践，也不提供硬门禁。Hooks 的硬约束独立运行，不能把上下文注入、Skill 加载或额外模型轮次当成结果有效的证明。本插件不承诺绕过 AI 检测器，不创建状态目录。

`writing-terse-output` 只改变会话表达方式，不改变代码、命令、路径、错误文本或持久化文档。安全警告、不可逆操作确认和顺序敏感步骤保持完整表达。

## 来源

正文改编自 caveman、humanizer、stop-slop、Humanizer-zh、shuorenhua 与 remove-ai-style，许可证见 `licenses/`。分析器已用 TypeScript 在本插件重写。
