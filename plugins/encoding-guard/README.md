# encoding-guard

`encoding-guard` 在 Claude Code 和 Codex 的文件写入工具执行后检查实际落盘字节。命中规则的文本文件必须是严格 UTF-8，且不得带 UTF-8、UTF-16 或 UTF-32 BOM。

发现问题时，hook 以 exit code 2 返回 `[Encoding Guard]` 阻断信息，要求 agent 修复文件后再继续。插件不会猜测源编码、自动转码或回滚文件。

## 默认范围

- C/C++、C#、Go、Java/Kotlin、PHP、Python、R、Ruby、Rust、Swift、JavaScript/TypeScript
- GraphQL、Vue、Svelte、HTML、CSS 族、SVG、EJS、Handlebars、WXML/WXSS/WXS
- JSON、YAML、TOML、INI/CFG、shell、Lua/Perl、Markdown/Text、XML、SQL
- `.dockerignore`、`.editorconfig`、`.env`、`.env.*`、`.gitignore`

依赖、构建和生成目录默认跳过。完整规则见 [DESIGN.md](./DESIGN.md)。

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

配置按 `.encoding-guard.mjs`、`.encoding-guard.cjs`、`.encoding-guard.js` 的顺序加载。用户规则前置到内置规则之前，因此可新增检查范围，也可用更具体的 `skip` 覆盖默认规则。

使用插件自带的 `encoding-guard-config` skill 初始化、维护和诊断配置。

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

Version: `0.1.0`
