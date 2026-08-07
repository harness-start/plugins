# markdown-format-guard 设计

## 责任边界

插件只强制 Markdown 文件的**可观察结构与排版不变量**：标题层级/样式、空白与围栏闭合等。它不检查拼写、链接可达性、语义内容、中英混排风格，也不自动 format 或回写文件。

PostToolUse 检查最终落盘文本。检测失败以 exit code 2 阻断后续流程，并给出恢复条件；agent 必须修复文件后重新触发检查。

规则语义灵感来自常见 markdownlint（MD001/MD003/MD009/MD010/MD012/MD018/MD022/MD040/MD047 等），**不是** markdownlint 全量兼容实现。

## 作用范围

- 扩展名：`.md` / `.markdown` / `.mdown` / `.mkd`
- 默认跳过：`node_modules`、`vendor`、`dist`、`build`、`coverage`、`target`、`.next`、`.nuxt`、`generated`、`__generated__`、`.git` 等
- 文件开头 YAML front matter（`---` … `---`）内的 `#` 不当标题
- 围栏代码块（`` ``` `` / `~~~`）内的内容不参与标题规则
- 超过 2 MiB、无法读取或 hook 输入无效时 fail-open

## 检查语义

| Check | 默认 | 说明 |
| --- | --- | --- |
| `headingIncrement` | `block` | 标题层级每次最多 +1 |
| `headingStyle` | `block` | 仅允许 ATX（`#`），禁止 Setext 下划线 |
| `headingSpace` | `block` | `#` 后恰好一个空格 |
| `emptyHeading` | `block` | 禁止空标题 |
| `headingBlankLines` | `block` | 标题上下需要空行（文件/正文起始标题上方可无空行） |
| `hardTabs` | `block` | 禁止 Tab |
| `trailingWhitespace` | `block` | 禁止行尾空白；允许恰好 2 个空格作硬换行 |
| `multipleBlankLines` | `block` | 连续空行不得超过 1 行 |
| `finalNewline` | `block` | 非空文件以 `\n` 结尾 |
| `fencedCodeClosed` | `block` | 围栏必须闭合 |
| `fencedCodeLanguage` | `report` | 围栏建议带语言标记 |
| `singleH1` | `off` | 全文至多一个 h1（项目差异大，默认关） |

模式：`block`（exit 2）/ `report`（stderr 提示不阻断）/ `off`。

## 配置发现

从目标文件所在 Git 仓库根目录按以下顺序加载第一个存在的文件：

1. `.markdown-format-guard.mjs`
2. `.markdown-format-guard.cjs`
3. `.markdown-format-guard.js`

配置是项目拥有、经 `import()` 加载的可信可执行配置。非 Git 目录只使用内置默认。

```js
export default {
  checks: {
    headingIncrement: "block",
    fencedCodeLanguage: "report",
    singleH1: "off",
  },
  overrides: [
    {
      match: /^CHANGELOG\.md$/i,
      checks: { headingIncrement: "off", singleH1: "off" },
    },
  ],
};
```

路径是仓库相对 POSIX 路径。每个检查使用第一个同时匹配路径并声明该检查的 override；未匹配时用 `checks`，再回退默认值。无效字段警告后回退默认；配置加载失败不取消内置保护。配置只能调整内置检查模式，不能定义新 scanner。

## 恢复策略

- 按 finding 的行号与 check id 定点修改，不要整篇无差别重写。
- 标题跳级：插入中间层级，或降低深层标题。
- Setext：改为 `#` / `##` ATX。
- 围栏未闭合：补齐相同长度的闭合标记。
- 行尾空白：删除；需要硬换行时保留恰好两个空格。
- 文件末尾：确保最后一行为换行结束。
