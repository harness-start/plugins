# 专业写作插件

`professional-writing` 为 Claude Code 和 Codex 提供可执行回复、可视化表达、中英文写作、精简输出和 Markdown 去模板化方法。它同时在已观察到的 Markdown 写入后运行确定性分析器；Skill 是否加载不影响扫描是否执行。

## 目标

- 根据读者、语言、文档类型和行动需求，只加载当前写作任务需要的方法。
- 保留事实、数字、URL、标识符、引文、命令、代码和用户要求的结构。
- 在 Markdown 写入后定位重复套话、机械结构和其他可验证信号，供下一轮人工判断。
- 不承诺绕过所谓 AI 检测器，也不把信号数量下降当作成稿质量证明。

## 实现

`SessionStart` 注入轻量路由说明。`PostToolUse` 对已观察到的 `.md` 与 `.markdown` 写入调用同一份 TypeScript 分析器，最多扫描 8 个文件，每个文件不超过 256 KiB，并跳过依赖、缓存、构建和生成目录。Claude 通过非阻断 `additionalContext` 接收结果；Codex 使用非阻断 feedback，避免破坏工具调用序列。

| 场景 | 捆绑 Skill |
| --- | --- |
| 用户需要执行流程、排障、选择、恢复或继续未完成工作 | `actionable-response` |
| 关系、顺序、层级或状态变化适合用图说明 | `visual-explanation` |
| 用户明确要求更短或减少 token | `writing-terse-output` |
| 英文撰写、改写或审阅 | `writing-english-prose` |
| 中文撰写、改写或审阅 | `writing-chinese-prose` 与 `ai-flavor-remover` |
| 创建或编辑人类可读 Markdown | 对应语言组合与 `writing-markdown-ai-style` |

中英文正文都占实质篇幅时加载两套语言方法；零星技术术语按正文主语言处理。代码、命令、配置、机器输出、逐字引用和精确短回复不需要写作 Skill。

## 使用

通常由会话路由选择，也可以显式调用 `$professional-writing` 或某个窄 Skill。显式检查单个 Markdown 文件时使用：

```bash
node "${PLUGIN_ROOT}/dist/cli/analyze-ai-style.mjs" path/to/document.md
```

`writing-terse-output` 只改变会话表达方式，不删减安全警告、不可逆操作确认和顺序敏感步骤。`visual-explanation` 只在图确实能降低理解成本时使用，不为简单问题默认生成 HTML。

## 边界、来源与验证

插件不自动改写、不回滚、不硬阻断，也不创建状态目录。分析结果只是带路径与行号的定位证据，最终取舍仍需通读上下文。

写作方法参考 caveman、humanizer、stop-slop、Humanizer-zh、shuorenhua、remove-ai-style、show-me 与 i-have-adhd；许可证与归因见 `licenses/`。分析器为本插件自有的 TypeScript 实现。

```bash
npx tsx --test plugins/professional-writing/tests/*.test.ts
./scripts/acceptance/run.sh --plugin professional-writing
```

live acceptance 由脚本进入 `docker/host-acceptance`。版本：`1.3.0`。
