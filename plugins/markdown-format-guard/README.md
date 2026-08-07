# markdown-format-guard

`markdown-format-guard` 在 Claude Code 和 Codex 的文件写入工具执行后，检查落盘的 Markdown（`.md` / `.markdown` / `.mdown` / `.mkd`）是否符合通用结构规则：标题层级递增、ATX 标题样式、标题周围空行、Tab/行尾空白、围栏闭合与文件结尾换行等。

发现 **block** 级问题时，hook 以 exit code 2 返回 `[Markdown Format Guard]` 阻断信息，要求 agent 按行号修复后再继续。插件不自动改写文件。

## 默认规则摘要

| 检查 | 默认 |
| --- | --- |
| 标题每次最多降/升一级（不跳级） | block |
| 统一 ATX（`#`），禁止 Setext | block |
| `#` 后一个空格；禁止空标题；标题上下空行 | block |
| 禁止 Tab；行尾空白（允许 2 空格硬换行） | block |
| 连续空行 ≤ 1；文件以 `\n` 结尾 | block |
| 围栏必须闭合 | block |
| 围栏建议带语言 | report |
| 全文唯一 h1 | off |

依赖、构建和生成目录默认跳过。完整契约见 [DESIGN.md](./DESIGN.md)。

## 项目配置

在 Git 仓库根目录创建 `.markdown-format-guard.mjs`：

```js
export default {
  checks: {
    fencedCodeLanguage: "report",
    singleH1: "off",
  },
  overrides: [
    {
      match: /^CHANGELOG\.md$/i,
      checks: { headingIncrement: "off" },
    },
  ],
};
```

配置按 `.markdown-format-guard.mjs` / `.cjs` / `.js` 顺序加载。使用插件自带的 `markdown-format-guard-config` skill 初始化、维护和诊断配置。

## 安装

```bash
# Claude Code
claude plugin install markdown-format-guard@harness-start

# Codex
codex plugin add markdown-format-guard@harness-start
```

## 验证

```bash
node --test plugins/markdown-format-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin markdown-format-guard
```

Version: `0.1.0`
