# in-chinese

`in-chinese` 让 Claude Code 和 Codex 的自然语言说明保持为简体中文，并在回复边界拦截异常的长篇韩文、日文假名或泰文。

## 行为

- `SessionStart` 注入简体中文回复约定。
- `Stop` 检查主代理候选回复，`SubagentStop` 检查子代理候选回复。
- 命中后要求完整重写，保留事实、验证证据和结论。
- 用户明确要求改用韩文、日文或泰文也不会绕过检查。
- 代码、命令、路径、API、标识符、短名称和短引用可以保持原样。

两个宿主都只提供回复边界 hook，不提供逐 token hook。因此插件会在候选回复生成后、被接受前要求重写，而不是在流式输出中途打断模型。

## 检测规则

检测器分别统计 Hangul、Hiragana/Katakana 和 Thai Unicode Script。目标文字必须同时满足以下条件才会命中：

- 至少 12 个目标文字字符；
- 占该段全部 Unicode 字母至少 25%。

检测会同时覆盖单行和完整回复。fenced code、inline code、Markdown 引用行、URL 和链接目标不参与统计。汉字本身不会被当作日文，因此正常中文不会因 Han 字符误报。

## 本地验证

从 marketplace 仓库根目录运行：

```bash
node --test plugins/in-chinese/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin in-chinese
```

第二条命令需要 Docker，以及仓库 `.env` 中配置的 DeepSeek 验收凭据。
