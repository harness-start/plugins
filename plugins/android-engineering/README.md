# Android 工程插件

`android-engineering` 面向 Kotlin/Java Android、Gradle/AGP、Jetpack Compose、测试、R8 与资源配置任务。它把开放式工程方法和可机械检查的写入边界分开：Skill 负责分析与实现，Hook 负责保护 Gradle 生成状态并执行有界配置检查。

## 目标

- 根据仓库现有版本、模块和工具链完成 Android 工程工作，不强加新的架构。
- 防止 agent 直接编辑由 Gradle 管理的 lockfile 与缓存目录。
- 在写入后尽早发现 Manifest、资源 XML、`google-services.json` 和常见 Compose 反模式。
- 明确证据边界：Hook 放行或扫描无报告，不代表构建、测试、设备行为或 UI 已验证。

## 实现

插件捆绑四个 Skill：`android-engineering` 是主入口，`android-compose`、`android-testing` 和 `android-r8` 分别处理 Compose、测试基础设施与代码缩减问题。两个平台通过各自的 Hook 配置调用同一份已打包运行时。

| 阶段 | 实现行为 |
| --- | --- |
| `PreToolUse` | 拒绝直接写 `gradle.lockfile`、`gradle/dependency-locks/*.lockfile` 和 `.gradle/`；应修改依赖声明后使用项目 Gradle wrapper 重新生成。 |
| `PostToolUse` | 对 `AndroidManifest.xml` 与 `res/**/*.xml` 做 XML 校验，对 `google-services.json` 做 JSON 校验。 |
| `PostToolUse` | 对 `.kt` / `.kts` 报告 `collectAsState()`、装箱数值 `mutableStateOf`，以及已经使用 `colorScheme` 时仍写死 `Color.Black`、`Color.White` 或 `Color(0x…)` 的位置。 |

Compose 扫描默认只报告。它提供精确源码信号，不判断实际重组、生命周期、可访问性或视觉效果。

## 配置

可在 Git 根目录创建 `.android-engineering.mjs`：

```js
export default {
  checks: {
    androidXml: "block",
    androidJson: "block",
    composeCollectAsState: "report",
    composePrimitiveState: "report",
    composeLiteralColor: "report",
  },
  limits: {
    maxFiles: 12,
    timeoutMs: 10000,
  },
  missingTools: "report-once",
};
```

检查模式为 `block`、`report` 或 `off`。插件只处理本次工具调用中可识别、已存在、大小有界且不位于依赖、缓存、生成或构建目录的目标。包管理器命令只要没有明确把受保护路径作为写入目标，就不会因为命令名称本身被拒绝。

## 使用与验证

安装后可显式调用 `$android-engineering`（Codex）或 `/android-engineering`（Claude Code）。完成前仍应运行项目自己的 Gradle 构建、测试、lint 或设备验收。

```bash
# 在 marketplace 仓库根目录运行离线测试
npx tsx --test plugins/android-engineering/tests/*.test.ts

# live acceptance 由脚本进入 docker/host-acceptance
./scripts/acceptance/run.sh --plugin android-engineering
```

版本：`0.1.0`
