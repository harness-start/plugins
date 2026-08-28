# iOS 工程插件

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `workspace-integrity` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`ios-engineering` 面向 Swift、UIKit、SwiftUI、Swift Concurrency、XCTest/Swift Testing、SwiftPM 与 CocoaPods。插件把领域方法放入捆绑 Skill，把依赖产物保护和轻量语法检查放入双平台 Hook。

## 目标

- 按项目现有平台版本、包管理器、架构和测试体系完成 iOS 工程工作。
- 防止直接编辑 SwiftPM/CocoaPods 生成的 lockfile 与依赖目录。
- 在写入后尽早发现 Swift 解析错误和 plist 结构错误。
- 不把轻量检查冒充 Xcode 构建、签名、模拟器、真机或 UI 验收结果。

## 实现

主入口 `ios-engineering` 根据任务路由本插件内的 `ios-swiftui`、`ios-concurrency` 与 `ios-testing`。其中嵌套的专业参考 Skill 随插件发布，不依赖消费者环境中的外部 Skill。

| 阶段 | 实现行为 |
| --- | --- |
| `PreToolUse` | 拒绝直接写 `Package.resolved`、`Podfile.lock`、`Pods/`、`Carthage/Build/` 和 `.build/checkouts/`。 |
| `PostToolUse` | 对修改后的 `.swift` 文件运行有界 Swift 解析检查。 |
| `PostToolUse` | 对修改后的 `.plist` 文件运行 plist 校验。 |

若校验工具缺失，插件按配置报告一次或静默，不会声称检查已经通过。

## 配置

在 Git 根目录创建 `.ios-engineering.mjs`：

```js
export default {
  checks: {
    swiftParse: "block",
    plistLint: "block",
  },
  limits: { maxFiles: 12, timeoutMs: 10000 },
  missingTools: "report-once",
};
```

检查模式支持 `block`、`report`、`off`。依赖管理命令未明确写入受保护路径时保持放行，应通过 `swift package`、CocoaPods 或项目既有流程重新生成状态。

## 使用与验证

安装后调用 `$ios-engineering` 或 `/ios-engineering`，再运行项目自己的 Xcode/Swift 构建、测试和目标平台验收。

```bash
npx tsx --test plugins/ios-engineering/tests/*.test.ts
./scripts/acceptance/run.sh --plugin ios-engineering
```

live acceptance 只在 `docker/host-acceptance` 中运行。版本：`0.1.0`。
