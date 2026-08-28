# PHP 工程插件

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `workspace-integrity` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`php-engineering` 面向 Symfony、Yii2、Laravel、ThinkPHP、Workerman、Composer、PHPUnit 与静态分析任务。Skill 负责识别框架和组织实现，Hook 负责 Composer 生成状态保护及轻量 PHP 校验。

## 目标

- 尊重项目现有框架、PHP 版本、目录结构和工具链，不把单一框架约定套到所有仓库。
- 防止直接编辑 `composer.lock` 或 `vendor/`。
- 在写入后阻断 PHP 语法错误和无效 `composer.json`。
- 不把 Hook 通过当作 PHPUnit、PHPStan、框架启动或数据库迁移成功。

## 实现

插件捆绑 `php-engineering` 主 Skill。`PreToolUse` 从文件工具和明确的 shell 写路径中识别 `composer.lock` 与 `vendor/`，要求从 `composer.json` 或项目源码出发使用 Composer 重建。`PostToolUse` 对本次修改的 `.php` 文件运行 `php -l`，并对 `composer.json` 执行 Composer 声明校验。运行时不读取其他插件 Skill，也不安装依赖。

## 配置

在 Git 根目录创建 `.php-engineering.mjs`：

```js
export default {
  checks: {
    phpSyntax: "block",
    composerValidate: "block",
  },
  limits: { maxFiles: 12, timeoutMs: 10000 },
  missingTools: "report-once",
};
```

检查模式支持 `block`、`report`、`off`。Composer 命令没有明确把受保护路径作为写目标时保持放行。

## 使用与验证

安装后调用 `$php-engineering` 或 `/php-engineering`。完成前运行项目自己的测试、静态分析、格式检查和框架级验证。

```bash
npx tsx --test plugins/php-engineering/tests/*.test.ts
./scripts/acceptance/run.sh --plugin php-engineering
```

live acceptance 只在 `docker/host-acceptance` 中运行。版本：`0.1.0`。
