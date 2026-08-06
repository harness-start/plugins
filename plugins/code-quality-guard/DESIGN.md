# code-quality-guard 设计

## 执行模型

PostToolUse 从文件工具事件提取最终存在的目标文件，跳过第三方、生成、构建、缓存目录以及超过 2 MiB 的文件。单次最多即时检查 12 个文件，单个检查默认超时 10 秒，并设置 50 秒以内的整体软截止时间。

PHP 文件路径写入宿主提供的插件数据目录。Stop 阶段按模式分组运行 PHPStan，每批最多 24 个文件，默认超时 55 秒。普通报告使用成功退出状态；只有 `block` 结果才使用宿主的阻断契约。

## 工具发现和分类

- JavaScript 使用当前 Node 运行时；TypeScript 使用 `node_modules/.bin/esbuild`，再回退 PATH。
- ESLint 优先 `node_modules/.bin/eslint`，并要求项目存在 flat config、eslintrc 或 `package.json#eslintConfig`。
- Python 优先 `.venv/bin`、`venv/bin`，再回退 PATH；`compile()` 不生成 `__pycache__`。
- Ruff 使用虚拟环境优先；PHP 使用 PATH；Composer 和 PHPStan 优先 `vendor/bin`。
- ESLint fatal/parser 消息无论默认 lint 模式如何都阻断。工具缺失、配置缺失、超时和检查器自身执行失败只报告。
- 命令均以可执行文件和参数数组启动，不经过 shell，不接受项目自定义命令。

## 配置

插件只加载 Git 根目录 `.code-quality-guard.mjs`：

```js
{
  checks?: Partial<Record<checkName, "block" | "report" | "off">>,
  overrides?: Array<{
    match: RegExp,
    checks: Partial<Record<checkName, "block" | "report" | "off">>,
  }>,
  limits?: {
    maxImmediateFiles?: number, // 1..100
    maxPhpstanFiles?: number,   // 1..200
    immediateTimeoutMs?: number, // 1000..60000
    phpstanTimeoutMs?: number,   // 1000..120000
    maxOutputLines?: number,     // 5..500
  },
  missingTools?: "report-once" | "silent",
}
```

路径统一为仓库相对 POSIX 路径。每个检查分别使用第一个声明该检查的匹配 override。配置非法时逐项警告并回退默认值。

状态键由工作区根目录和宿主 session id 组成，只保存已报告的缺失项和 PHP 文件列表。数据目录不可用时即时检查仍运行，依赖持久状态的 PHPStan 批处理自然降级。
