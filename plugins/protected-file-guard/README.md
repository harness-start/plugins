# protected-file-guard

`protected-file-guard` 在 Claude Code 和 Codex 的写入发生前检查目标路径，禁止直接创建、修改、移动或删除依赖 lockfile 和包管理器拥有的第三方依赖文件。

文件工具覆盖 `Edit`、`Write`、`MultiEdit`、`NotebookEdit`、`create_file`、`search_replace` 和 `apply_patch`。Shell（`Bash` / `Shell` / `exec_command` 等）只提取命令里的显式写路径：重定向、`tee`、`touch`、`sed -i`、`cp`、`mv`、`rm`、`install`、`dd of=`，以及 `writeFile` / `open(`。`pnpm install`、`composer install`、`go mod tidy` 这类不写出 lockfile 或 `vendor/` 路径的包管理命令会放行。

## 默认保护

- npm、pnpm、Yarn、Bun、Deno lockfile
- Poetry、PDM、Pipenv、uv lockfile
- Composer、Bundler、Cargo、Go、Gradle、NuGet、Mix、Nix、renv lockfile
- SwiftPM、CocoaPods、Dart/Flutter、Terraform/OpenTofu lockfile
- `node_modules/`、`vendor/`、虚拟环境、`Pods/`、`.terraform/`、`.dart_tool/`、`.gradle/` 等依赖目录

`dist/`、`build/`、`target/`、`coverage/`、`.next/` 和 `.nuxt/` 不在默认范围内。

规则很简单：文件工具或带显式写路径的 shell 不能直接改项目声明为受保护的 lockfile 或第三方依赖路径。检查发生在 `PreToolUse`，命中时写入还没发生。构建输出、缓存和任意 `generated/` 目录默认不管。

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

完整规则结构为：

```js
{
  id?: string,
  match: RegExp,
  mode?: "block" | "allow",
  reason?: string,
  recovery?: string,
}
```

`match` 匹配仓库相对 POSIX 路径。每个目标都检查逻辑路径和可解析的真实路径，避免符号链接绕过；一次工具调用只要有一个目标被 `block`，整个调用就会拒绝。`allow` 应保持窄范围，只用于项目明确拥有的例外。

配置按 `.protected-file-guard.mjs`、`.protected-file-guard.cjs`、`.protected-file-guard.js` 顺序从事件工作目录对应的 Git 根通过 `import()` 加载。非 Git 目录仍使用内置规则，但不加载项目配置。配置损坏时写一行警告并保留内置保护；非法单条规则只警告并跳过；Hook 输入畸形或意外运行错误时 fail-open。

内置 lockfile 包括 `bun.lock`、`bun.lockb`、`deno.lock`、`npm-shrinkwrap.json`、`package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`、`pdm.lock`、`Pipfile.lock`、`poetry.lock`、`uv.lock`、`composer.lock`、`Gemfile.lock`、`Cargo.lock`、`go.sum`、`gradle.lockfile`、`packages.lock.json`、`mix.lock`、`flake.lock`、`renv.lock`、`pubspec.lock`、`Package.resolved`、`Podfile.lock`、`.terraform.lock.hcl` 和 `gradle/dependency-locks/*.lockfile`。

内置依赖目录包括 `node_modules/`、`vendor/`、`.venv/`、`venv/`、`__pypackages__/`、`Pods/`、`Carthage/Build/`、`.build/checkouts/`、`.terraform/`、`.dart_tool/`、`.gradle/`、`.nuget/packages/`、`renv/library/`、`packrat/lib/`、`bower_components/` 和 `jspm_packages/`。目录按完整路径段匹配，`vendorized/`、`node_modules_backup/` 不误命中；`deps/` 与 `packages/` 过于宽泛，不作为内置规则。

拒绝结果使用宿主支持的 `PreToolUse permissionDecision: deny`，并包含受保护目标、命中规则、直接修改生成状态的风险、解除条件，以及修改依赖声明、生成源或增加窄范围 `allow` 的恢复路径。脚本没有持久状态，不写插件安装目录或项目目录。

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

版本：`0.1.0`
