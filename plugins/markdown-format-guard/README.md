# markdown-format-guard

`markdown-format-guard` 在 Claude Code 和 Codex 的文件写入工具执行后，检查落盘的 Markdown（`.md` / `.markdown` / `.mdown` / `.mkd`）是否符合通用结构规则：标题层级递增、ATX 标题样式、标题周围空行、Tab/行尾空白、围栏闭合与文件结尾换行等。

发现 **block** 级问题时，hook 以 exit code 2 返回 `[Markdown Format Guard]` 阻断信息，要求 agent 按行号修复后再继续。插件不自动改写文件。

## 默认规则摘要

| 检查 ID | 默认 |
| --- | --- |
| `headingIncrement`：标题每次最多升一级 | block |
| `headingStyle`：统一 ATX（`#`），禁止 Setext | block |
| `headingSpace`、`emptyHeading`、`headingBlankLines`：标题空格、非空和上下空行 | block |
| `hardTabs`、`trailingWhitespace`：禁止 Tab 和行尾空白，允许 2 空格硬换行 | block |
| `multipleBlankLines`、`finalNewline`：连续空行 ≤ 1，文件以 `\n` 结尾 | block |
| `fencedCodeClosed`：围栏必须闭合 | block |
| `fencedCodeLanguage`：围栏建议带语言 | report |
| `singleH1`：全文唯一 h1 | off |

依赖、构建和生成目录默认跳过。

## 设计与检查边界

插件只强制 Markdown 文件可观察的结构与排版不变量，不检查拼写、链接可达性、语义内容或中英混排风格，也不自动 format 或回写文件。规则语义参考常见 markdownlint MD001、MD003、MD009、MD010、MD012、MD018、MD022、MD040、MD047 等规则，但不是 markdownlint 全量兼容实现。

作用范围为 `.md`、`.markdown`、`.mdown`、`.mkd`。默认跳过 `node_modules`、`vendor`、`dist`、`build`、`coverage`、`target`、`.next`、`.nuxt`、`generated`、`__generated__` 和 `.git` 等目录。YAML front matter 中的 `#` 不作为标题，fenced code 内文本不参与标题规则。文件超过 2 MiB、无法读取或 Hook 输入无效时 fail-open。

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

配置按 `.markdown-format-guard.mjs`、`.markdown-format-guard.cjs`、`.markdown-format-guard.js` 顺序加载。使用插件自带的 `markdown-format-guard-config` skill 初始化、维护和诊断配置。

项目配置通过 `import()` 加载，非 Git 目录只使用内置默认。路径统一为仓库相对 POSIX 路径；每项检查使用第一个同时匹配路径并声明该检查的 override，之后依次回退顶层 `checks` 和默认值。非法字段警告后回退默认值，加载失败不会取消内置保护。配置只能调整内置检查模式，不能定义新 scanner。

## 恢复策略

- 按 finding 的行号和 check ID 定点修改，不做无差别全文重写。
- 标题跳级时插入中间层级或降低深层标题；Setext 标题改为 ATX。
- 围栏未闭合时补齐相同长度的闭合标记。
- 删除行尾空白；确需硬换行时保留恰好两个空格。
- 确保非空文件以换行结尾。

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

版本：`0.1.0`
