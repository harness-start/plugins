# encoding-guard

`encoding-guard` 在 Claude Code 和 Codex 的文件写入工具执行后检查实际落盘字节。命中规则的文本文件必须是严格 UTF-8，且不得带 UTF-8、UTF-16 或 UTF-32 BOM。

发现问题时，hook 以 exit code 2 返回 `[Encoding Guard]` 阻断信息，要求 agent 修复文件后再继续。插件不会猜测源编码、自动转码或回滚文件。

## 默认范围

- C/C++、C#、Go、Java/Kotlin、PHP、Python、R、Ruby、Rust、Swift、JavaScript/TypeScript
- GraphQL、Vue、Svelte、HTML、CSS 族、SVG、EJS、Handlebars、WXML/WXSS/WXS
- JSON、YAML、TOML、INI/CFG、shell、Lua/Perl、Markdown/Text、XML、SQL
- `.dockerignore`、`.editorconfig`、`.env`、`.env.*`、`.gitignore`

依赖、构建和生成目录默认跳过。

## 设计与检测边界

配置范围内的文本文件必须是无 BOM 的严格 UTF-8。它不查换行风格、Unicode 规范化、内容语义，也不管 Windows 专用脚本的代码页。

`PostToolUse` 能检查最终落盘字节，但不能撤销已经发生的写入。检测失败会阻断 agent 后续流程并给出恢复条件，agent 必须修复文件后重新验证。

检测顺序固定：

1. 按 UTF-32、UTF-8、UTF-16 顺序匹配文件头 BOM，较长签名优先，避免 UTF-32 LE 被误判为 UTF-16 LE。
2. 无 BOM 时使用 Node.js `isUtf8()` 做严格字节校验。
3. 空文件放行；文件超过 2 MiB、无法读取或 Hook 输入无效时 fail-open。

不得通过 `Buffer.toString("utf8")` 是否产生 `U+FFFD` 判断原始编码，因为合法文件可以主动包含该字符，且解码会丢失首次分叉位置的原始字节证据。

## 项目配置

在项目根目录创建 `.encoding-guard.mjs`：

```js
export default {
  rules: [
    // User rules run before built-ins; first match wins.
    { match: /^fixtures\/legacy\//, mode: "skip" },
    { match: /\.properties$/, mode: "block" },
  ],
};
```

配置按 `.encoding-guard.mjs`、`.encoding-guard.cjs`、`.encoding-guard.js` 的顺序通过 `import()` 加载。用户规则前置到内置规则之前，因此可新增检查范围，也可用更具体的 `skip` 覆盖默认规则。

规则结构为 `{ match: RegExp, mode?: "block" | "skip" }`。`match` 针对仓库根相对路径，路径分隔符统一为 `/`；`mode` 默认为 `block`，全部规则按 first-match-wins 执行。无效用户规则警告后跳过，整个配置加载失败时回退内置规则。非 Git 目录只使用内置规则。

内置规则先跳过 `node_modules`、`vendor`、`dist`、`build`、`coverage`、`target`、`.next`、`.nuxt`、`generated`、`__generated__`，再检查上列文本扩展名和 dotfile。确有编码测试样本或平台 BOM 契约时，应添加窄范围 `skip`，不应跳过整个 `src/`。

使用插件自带的 `encoding-guard-config` skill 初始化、维护和诊断配置。

## 恢复策略

- UTF-8 BOM：只删除开头 `EF BB BF`，其余字节保持不变。
- UTF-16、UTF-32 或其他已知编码：明确指定源编码做无损转换，再执行严格 UTF-8 校验。
- 源编码未知：保留原文件和原始字节证据，停止猜测并请求确认；禁止用 replacement character 覆盖无法解码的内容。

## 安装

```bash
# Claude Code
claude plugin install encoding-guard@harness-start

# Codex
codex plugin add encoding-guard@harness-start
```

## 验证

```bash
node --test plugins/encoding-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin encoding-guard
```

版本：`0.1.0`
