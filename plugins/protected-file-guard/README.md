# protected-file-guard

`protected-file-guard` 在 Claude Code 和 Codex 的文件工具执行前检查全部目标路径，禁止直接创建、修改、移动或删除依赖 lockfile 和包管理器拥有的第三方依赖文件。

插件只监听 `Edit`、`Write`、`MultiEdit`、`NotebookEdit` 和 `apply_patch`。它不分析或拦截 Bash、Shell、`exec_command`，因此 `pnpm install`、`composer install` 等正常依赖流程不受影响。

## 默认保护

- npm、pnpm、Yarn、Bun、Deno lockfile
- Poetry、PDM、Pipenv、uv lockfile
- Composer、Bundler、Cargo、Go、Gradle、NuGet、Mix、Nix、renv lockfile
- SwiftPM、CocoaPods、Dart/Flutter、Terraform/OpenTofu lockfile
- `node_modules/`、`vendor/`、虚拟环境、`Pods/`、`.terraform/`、`.dart_tool/`、`.gradle/` 等依赖目录

`dist/`、`build/`、`target/`、`coverage/`、`.next/` 和 `.nuxt/` 不在默认范围内。

完整规则和责任边界见 [DESIGN.md](./DESIGN.md)。

## 项目配置

在 Git 项目根目录创建 `.protected-file-guard.mjs`：

```js
export default {
  rules: [
    {
      id: "allow-patched-vendor",
      match: /^vendor\/acme\/patched\//,
      mode: "allow",
    },
    {
      id: "protect-generated-sdk",
      match: /^src\/generated-sdk\//,
      mode: "block",
      reason: "SDK 由生成器维护",
      recovery: "修改生成源并重新生成 SDK",
    },
  ],
};
```

用户规则在内置规则之前执行，first-match-wins。`mode` 只能是 `block` 或 `allow`，缺省为 `block`。使用插件自带的 `protected-file-guard-config` Skill 初始化、维护或诊断配置。

## 安装

```bash
# Claude Code
claude plugin install protected-file-guard@harness-start

# Codex
codex plugin add protected-file-guard@harness-start
```

Codex 安装后需先审查并信任 Hook。

## 验证

```bash
node --test plugins/protected-file-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin protected-file-guard
```

第二条命令需要 Docker 和仓库 `.env` 中的 DeepSeek 验收凭据。

Version: `0.1.0`
