# 专业写作

`professional-writing` injects lightweight routing guidance at `SessionStart` in Claude Code and Codex. It loads only the bundled Skills needed for the current response or document. Independently, `PostToolUse` scans observed Markdown writes with the bundled deterministic analyzer whether or not a Skill was loaded.

| 场景 | Skill |
|---|---|
| The user must perform a procedure, troubleshoot, choose, recover, or continue unfinished work | `actionable-response` |
| A visual would materially clarify relationships, sequence, hierarchy, or state changes | `visual-explanation` |
| 用户明确要求更短输出或减少 token | `writing-terse-output` |
| 英文内容撰写、改写或审阅 | `writing-english-prose` |
| 中文内容撰写、改写或审阅 | `writing-chinese-prose` + bundled `ai-flavor-remover` |
| 创建或编辑人类可读的 Markdown 正文 | 对应语言组合 + `writing-markdown-ai-style` |

中英正文都占实质篇幅时加载两套语言组合；零星外文术语按正文主语言处理。代码、命令、配置、机器输出、逐字引用和精确短回复不加载写作 Skill。事实、数字、URL、标识符、引文和 Markdown 结构必须保留。

`writing-markdown-ai-style` 用插件自带的 `dist/cli/analyze-ai-style.mjs` 定位重复出现的套话。写入后的 Hook 与显式 CLI 复用同一个 TypeScript 分析器；Hook 最多扫描 8 个已观察到的 `.md` / `.markdown` 文件，每个文件上限 256 KiB，并跳过依赖、缓存、构建和生成目录。分析结果只是定位证据，不能代替通读或授权批量替换。

`actionable-response` is the default for action-heavy replies, even when the user does not request ADHD-friendly wording. It makes the next action obvious without deleting required information. `visual-explanation` handles comprehension structure, skips visuals for simple questions, and does not create HTML by default. Both preserve user-requested formats, safety confirmations, and task completeness.

## 边界

SessionStart 只负责写作 Skill 编排，不处理工程实践。PostToolUse 只报告带文件路径与行号的确定性信号：不自动改写、不回滚或硬阻断，也不把命中数量下降当成质量证明。Claude 使用非阻断 `additionalContext`；Codex 用非阻断 feedback 替代普通工具成功回执，避免在未闭合的 tool-call 序列中插入消息。两种输出都会让诊断进入下一轮模型上下文。本插件不承诺绕过 AI 检测器，也不创建状态目录。

`writing-terse-output` 只改变会话表达方式，不改变代码、命令、路径、错误文本或持久化文档。安全警告、不可逆操作确认和顺序敏感步骤保持完整表达。

## 来源

The prose methods adapt caveman, humanizer, stop-slop, Humanizer-zh, shuorenhua, remove-ai-style, show-me, and i-have-adhd. See `licenses/` for attribution. The analyzer is a TypeScript reimplementation owned by this plugin.
