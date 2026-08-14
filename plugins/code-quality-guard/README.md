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

PHPStan 使用 Git 根目录的 `.code-quality-guard/state/` 记录本会话修改过的 PHP 文件，在 Stop 阶段最多检查 24 个文件。`.code-quality-guard/.gitignore` 会忽略 `state/`，状态文件不会进入版本控制。

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

使用 `code-quality-guard-config` Skill 可以初始化或诊断配置。

## 执行与工具发现

`PostToolUse` 从文件工具事件提取最终存在的目标文件，跳过第三方、生成、构建、缓存目录以及超过 2 MiB 的文件。单次最多即时检查 12 个文件，单项默认超时 10 秒，整体软截止时间不超过 50 秒。

PHP 文件路径会写入 Git 根目录的 `.code-quality-guard/state/`。`Stop` 按模式分组运行 PHPStan，每批最多 24 个文件，默认超时 55 秒。普通报告使用成功退出状态；只有 `block` 结果才使用宿主的阻断契约。

- JavaScript 使用当前 Node.js 运行时；TypeScript 先找 `node_modules/.bin/esbuild`，再回退到 PATH。
- ESLint 优先使用 `node_modules/.bin/eslint`，且项目必须有 flat config、eslintrc 或 `package.json#eslintConfig`。
- Python 优先使用 `.venv/bin`、`venv/bin`，再回退到 PATH；`compile()` 不生成 `__pycache__`。
- Ruff 优先使用虚拟环境；PHP 使用 PATH；Composer 和 PHPStan 优先使用 `vendor/bin`。
- ESLint fatal/parser 消息始终阻断。工具缺失、配置缺失、超时和检查器执行失败只报告。
- 所有命令都用可执行文件和参数数组启动，不经过 shell，也不接受项目自定义命令。

## 配置契约

插件只加载 Git 根目录的 `.code-quality-guard.mjs`：

```js
{
  checks?: Partial<Record<checkName, "block" | "report" | "off">>,
  overrides?: Array<{
    match: RegExp,
    checks: Partial<Record<checkName, "block" | "report" | "off">>,
  }>,
  limits?: {
    maxImmediateFiles?: number,  // 1..100
    maxPhpstanFiles?: number,    // 1..200
    immediateTimeoutMs?: number, // 1000..60000
    phpstanTimeoutMs?: number,   // 1000..120000
    maxOutputLines?: number,     // 5..500
  },
  missingTools?: "report-once" | "silent",
}
```

路径统一转换为仓库相对 POSIX 路径。每项检查使用第一个为它声明配置的匹配 override。配置项非法时会逐项警告并回退默认值。

状态键由工作区根目录和宿主 session id 组成，只保存已报告的缺失项和 PHP 文件列表。插件数据目录不可用时，即时检查仍会运行，依赖持久状态的 PHPStan 批处理则自然降级。

## 验证

```bash
node --test plugins/code-quality-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin code-quality-guard
```

版本：`0.1.1`
