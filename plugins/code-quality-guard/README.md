# code-quality-guard

`code-quality-guard` 在 Claude Code 和 Codex 写入源码后运行有界的 JS/TS、Python 和 PHP 检查。语法或 parser 错误默认阻断继续执行；普通 lint 和静态分析结果只报告。

## 默认检查

| 文件 | 检查 | 默认模式 |
| --- | --- | --- |
| `.js`、`.cjs`、`.mjs` | `node --check` | `block` |
| `.ts`、`.tsx`、`.mts`、`.cts` | esbuild parse | `block` |
| JS/TS | ESLint；fatal/parser 错误强制阻断 | `report` |
| `.py` | Python `compile()` / Ruff | `block` / `report` |
| `.php` | `php -l` / Stop 阶段 PHPStan | `block` / `report` |
| `composer.json` | `composer validate` | `block` |

检查器优先从项目依赖、虚拟环境或 `vendor/bin` 发现，再查找 PATH。插件不会安装依赖、访问网络或执行配置提供的命令。工具、配置或运行环境不可用时，每个会话和工作区只报告一次。

PHPStan 使用 `PLUGIN_DATA` 或 `CLAUDE_PLUGIN_DATA` 记录本会话修改过的 PHP 文件，在 Stop 阶段最多检查 24 个文件。插件不向项目目录或安装目录写状态。

## 项目配置

在 Git 项目根目录创建 `.code-quality-guard.mjs`：

```js
export default {
  checks: {
    javascriptSyntax: "block",
    typescriptSyntax: "block",
    eslint: "report",
    pythonSyntax: "block",
    ruff: "report",
    phpSyntax: "block",
    composerValidate: "block",
    phpstan: "report",
  },
  overrides: [
    {
      match: /^fixtures\//,
      checks: { eslint: "off", ruff: "off" },
    },
  ],
};
```

完整资源上限和配置契约见 [DESIGN.md](./DESIGN.md)。使用 `code-quality-guard-config` Skill 可以初始化或诊断配置。

## 验证

```bash
node --test plugins/code-quality-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin code-quality-guard
```

Version: `0.1.0`
