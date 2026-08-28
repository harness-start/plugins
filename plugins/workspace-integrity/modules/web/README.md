# Web 前端工程插件

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `workspace-integrity` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`web-frontend-engineering` 面向 React、Vue、Angular、TypeScript、构建工具、测试、可访问性与前端性能。Skill 负责框架方法与实现，Hook 保护 JavaScript 包管理器状态并运行有界语法、ESLint 与 JSON 检查。

## 目标

- 根据项目实际框架、版本、构建工具和组件约定完成前端工程任务。
- 防止直接编辑 JavaScript lockfile 与 `node_modules/`。
- 在写入后尽早发现 JavaScript、TypeScript、ESLint 和 `package.json` 问题。
- 与 React Native 插件错开：声明 `react-native` 依赖的项目不由本插件拥有这些保护规则。

## 实现

主入口 `web-frontend-engineering` 按需路由插件内的 `web-react`、`web-angular` 和 `web-vue`，并可继续读取各自捆绑的 composition、router 或 testing 参考。运行时不依赖消费者环境中的其他 Skill。

| 检查 | 默认模式 | 范围 |
| --- | --- | --- |
| JavaScript lockfile、`node_modules/` | 阻断写入 | npm、pnpm、Yarn、Bun、Deno 的生成状态。 |
| `javascriptSyntax` | `block` | `.js`、`.mjs`、`.cjs`。 |
| `typescriptSyntax` | `block` | `.ts`、`.tsx`、`.mts`、`.cts`。 |
| `eslint` | `report` | 常见 JS/TS 源文件。 |
| `packageJson` | `block` | `package.json`。 |

Hook 通过不代表浏览器行为、SSR/hydration、可访问性、视觉效果、端到端流程或性能已经验证。

## 配置

在 Git 根目录创建 `.web-frontend-engineering.mjs`：

```js
export default {
  checks: {
    javascriptSyntax: "block",
    typescriptSyntax: "block",
    eslint: "report",
    packageJson: "block",
  },
  limits: { maxFiles: 12, timeoutMs: 10000 },
  missingTools: "report-once",
};
```

检查模式支持 `block`、`report`、`off`。包管理器命令未明确写入受保护路径时保持放行。

## 使用与验证

安装后调用 `$web-frontend-engineering` 或 `/web-frontend-engineering`，完成前运行项目声明的 typecheck、lint、单元测试、构建和浏览器验收。

```bash
npx tsx --test plugins/web-frontend-engineering/tests/*.test.ts
./scripts/acceptance/run.sh --plugin web-frontend-engineering
```

live acceptance 只在 `docker/host-acceptance` 中运行。版本：`0.1.0`。
