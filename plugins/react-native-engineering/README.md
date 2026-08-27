# React Native 工程插件

`react-native-engineering` 面向 bare React Native、Metro、React Navigation、升级、autolinking、Codegen 和原生模块边界；当前主合同不覆盖 Expo。Skill 负责实现方法，Hook 负责 JavaScript 依赖状态、Codegen 产物与关键配置检查。

## 目标

- 依据项目实际 React Native 版本、原生工程和包管理器完成日常实现、性能优化、导航或升级。
- 防止直接编辑 JavaScript lockfile、`node_modules/` 与 React Native Codegen 输出。
- 在写入后校验 Metro/Babel/React Native 配置、TypeScript 和关键 JSON。
- 与 Web 前端插件错开：声明 `react-native` 依赖的项目由本插件拥有相关 JS lockfile 规则。

## 实现

主入口 `react-native-engineering` 按需路由插件内的 `react-native-practices`、`react-native-navigation` 和 `react-native-upgrade`。`PreToolUse` 保护 `package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`、Bun lockfile、`npm-shrinkwrap.json`、`node_modules/` 及原生 Codegen 目录。`PostToolUse` 对 `metro.config.*`、`babel.config.*`、`react-native.config.*`、`.ts` / `.tsx`、`package.json` 与 `app.json` 执行有界校验。

Hook 通过不代表 iOS/Android 构建、模拟器、真机、导航流程或升级兼容性已经验证。

## 配置

在 Git 根目录创建 `.react-native-engineering.mjs`：

```js
export default {
  checks: {
    reactNativeConfig: "block",
    reactNativeTypescript: "block",
    reactNativeJson: "block",
  },
  limits: { maxFiles: 12, timeoutMs: 10000 },
  missingTools: "report-once",
};
```

检查模式支持 `block`、`report`、`off`。依赖管理命令未显式把受保护路径作为写入目标时保持放行。

## 使用与验证

安装后调用 `$react-native-engineering` 或 `/react-native-engineering`，并在完成前运行项目自己的 JS 测试、类型检查、Metro 校验及双端构建。

```bash
npx tsx --test plugins/react-native-engineering/tests/*.test.ts
./scripts/acceptance/run.sh --plugin react-native-engineering
```

live acceptance 只在 `docker/host-acceptance` 中运行。版本：`0.1.0`。
