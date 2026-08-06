# `.protected-file-guard` 配置设计

## 责任边界

插件强制一个可观察不变量：文件工具不能直接修改项目声明为受保护的依赖状态或第三方依赖路径。

检查发生在 `PreToolUse`，命中规则时写入尚未发生。插件覆盖文件工具的新增、更新、移动和删除；不分析 Shell 命令，不阻止包管理器正常生成 lockfile 或安装依赖，也不默认保护构建输出、缓存或任意 `generated/` 目录。

## 规则模型

```js
{
  id?: string,
  match: RegExp,
  mode?: "block" | "allow",
  reason?: string,
  recovery?: string,
}
```

- `match` 匹配仓库相对路径，路径分隔符统一为 `/`。
- `mode` 缺省为 `block`。
- 用户规则前置到内置规则之前，逐目标 first-match-wins。
- `allow` 应使用窄路径，只用于项目明确拥有的例外。
- 一次工具调用只要有一个目标得到 `block`，整个调用就会被拒绝。
- 每个目标同时检查逻辑路径和可解析的真实路径，避免 symlink 绕过。

## 配置发现

从事件工作目录解析 Git 根目录，按以下顺序加载第一个存在的配置：

1. `.protected-file-guard.mjs`
2. `.protected-file-guard.cjs`
3. `.protected-file-guard.js`

配置通过 `import()` 加载，是项目拥有的可信可执行配置。非 Git 目录仍应用内置规则，但不加载项目配置。

用户配置损坏时打印一行警告并保留内置保护；无效的单条规则警告后跳过。畸形 Hook 输入或未预期的运行时错误 fail-open，避免插件故障锁死宿主。

## 内置规则

内置 lockfile 覆盖 harness-starter 当前 14 类依赖守卫：

```text
bun.lock, bun.lockb, deno.lock, npm-shrinkwrap.json,
package-lock.json, pnpm-lock.yaml, yarn.lock,
pdm.lock, Pipfile.lock, poetry.lock, uv.lock,
composer.lock, Gemfile.lock, Cargo.lock, go.sum,
gradle.lockfile, packages.lock.json, mix.lock, flake.lock,
renv.lock, pubspec.lock, Package.resolved, Podfile.lock,
.terraform.lock.hcl, gradle/dependency-locks/*.lockfile
```

内置依赖目录：

```text
node_modules/, vendor/, .venv/, venv/, __pypackages__/, Pods/,
Carthage/Build/, .build/checkouts/, .terraform/, .dart_tool/,
.gradle/, .nuget/packages/, renv/library/, packrat/lib/,
bower_components/, jspm_packages/
```

目录规则按完整路径段匹配；`vendorized/`、`node_modules_backup/` 不会误命中。`deps/` 和 `packages/` 名称过于宽泛，不作为内置规则。

## 阻断与恢复

命中时返回宿主支持的 `PreToolUse permissionDecision: deny`，并提供：

- 被保护的目标和命中规则；
- 直接修改生成状态的风险；
- 解除条件；
- 修改依赖声明、生成源或增加窄范围 `allow` 的恢复路径。

脚本无持久化状态，不写插件安装目录或项目目录。
