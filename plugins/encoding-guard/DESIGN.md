# encoding-guard 设计

## 责任边界

插件只强制一个可观察不变量：配置范围内的文本文件必须是无 BOM 的严格 UTF-8。它不检查换行风格、Unicode 规范化、内容语义或 Windows 专用脚本的代码页约定。

PostToolUse 能检查最终落盘字节，但不能撤销已发生的写入。检测失败会阻断 agent 的后续流程，并给出恢复条件；agent 必须修复文件后重新验证。

## 字节检测

检测顺序固定：

1. 按 UTF-32、UTF-8、UTF-16 的顺序匹配文件开头 BOM；较长签名优先，避免 UTF-32 LE 被误判为 UTF-16 LE。
2. 无 BOM 时使用 Node.js `isUtf8()` 做严格字节校验。
3. 空文件放行；超过 2 MiB、无法读取或 hook 输入无效时 fail-open。

不得通过 `Buffer.toString("utf8")` 中是否出现 `U+FFFD` 判断原始编码，因为合法文件可以主动包含该字符，而且解码会丢失首次分叉处的原始字节证据。

## 规则

规则结构：

```js
{ match: RegExp, mode?: "block" | "skip" }
```

- `match` 匹配仓库根目录相对路径，路径分隔符统一为 `/`。
- `mode` 缺省为 `block`。
- 用户规则前置到内置规则之前，按顺序 first-match-wins。
- 无效用户规则警告后跳过；整个配置加载失败时回退内置规则。

内置规则先跳过 `node_modules`、`vendor`、`dist`、`build`、`coverage`、`target`、`.next`、`.nuxt`、`generated`、`__generated__`，再检查 README 所列文本扩展名和 dotfile。

项目需要保护其他格式时添加 `block`；确实包含编码测试样本或有平台 BOM 契约时添加窄范围 `skip`。不应对整个 `src/` 使用 `skip`。

## 配置发现

从目标文件所在 Git 仓库根目录按以下顺序加载第一个存在的文件：

1. `.encoding-guard.mjs`
2. `.encoding-guard.cjs`
3. `.encoding-guard.js`

配置是项目拥有、经 `import()` 加载的可信可执行配置。非 Git 目录只使用内置规则。

## 恢复策略

- UTF-8 BOM：只删除开头 `EF BB BF`，其余字节保持不变。
- UTF-16/UTF-32 或其他已知编码：使用明确指定的源编码无损转换，再做严格 UTF-8 验证。
- 源编码未知：保留原文件和原始字节证据，停止猜测并请求确认；禁止用 replacement character 覆盖无法解码的内容。
