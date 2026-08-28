# Java 工程插件

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `workspace-integrity` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`java-engineering` 面向 Spring Boot、纯 Java、Maven、Gradle、JUnit 与 Jakarta 迁移。Skill 负责工程方法和框架判断，Hook 负责 Gradle 生成状态保护与 Maven 配置的有界检查。

## 目标

- 根据仓库实际的 JDK、构建系统和框架版本完成实现、迁移或审查。
- 防止直接修改 Gradle lockfile 与 `.gradle/` 缓存。
- 对 `pom.xml` 的 XML 结构提供及时的写后门禁。
- 避免与 Android 插件重复拥有 Gradle 路径：Android 仓库由 `android-engineering` 负责，显式 `pom.xml` 仍由本插件处理。

## 实现

主入口 `java-engineering` 可按任务加载插件自带的 `java-spring`、`java-junit` 和 `java-jakarta`。`PreToolUse` 从文件工具与明确 shell 写目标中识别 `gradle.lockfile`、`gradle/dependency-locks/*.lockfile` 和 `.gradle/`，命中后要求通过 Gradle wrapper 重新生成。`PostToolUse` 对本次修改的 `pom.xml` 运行 XML 校验。

这些检查不替代 Maven/Gradle 构建、JUnit、集成测试、容器启动或迁移验证。

## 配置

在 Git 根目录创建 `.java-engineering.mjs`：

```js
export default {
  checks: { mavenXml: "block" },
  limits: { maxFiles: 12, timeoutMs: 10000 },
  missingTools: "report-once",
};
```

检查模式支持 `block`、`report`、`off`。包管理器命令没有明确写入受保护路径时不会因命令名称被拒绝。

## 使用与验证

安装后调用 `$java-engineering` 或 `/java-engineering`，并在完成前运行项目声明的 Maven/Gradle 测试、构建和静态分析。

```bash
npx tsx --test plugins/java-engineering/tests/*.test.ts
./scripts/acceptance/run.sh --plugin java-engineering
```

live acceptance 只在 `docker/host-acceptance` 中运行。版本：`0.1.0`。
