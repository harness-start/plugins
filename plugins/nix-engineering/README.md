# Nix 工程插件

`nix-engineering` 面向 Nix 表达式、flake、开发环境和可复现构建任务。Skill 负责理解项目与实现变更，Hook 负责保护 `flake.lock` 并执行轻量解析检查。

## 目标

- 沿用仓库现有 Nix 入口、flake 结构和验证命令完成工程工作。
- 防止直接编辑由 Nix 生成的 `flake.lock`。
- 在写入后及时发现 `.nix` 解析错误与 lockfile JSON 结构错误。
- 不把解析通过解释为 derivation 已构建、输出可复现或目标平台可运行。

## 实现

插件只依赖自身捆绑的 `nix-engineering` Skill。`PreToolUse` 识别文件工具及明确 shell 写目标，命中 `flake.lock` 时要求修改 flake inputs 后由 Nix 命令重新生成。`PostToolUse` 对修改后的 `.nix` 文件运行 Nix 解析，对 `flake.lock` 运行 JSON 校验。检查范围受文件数量、大小和超时限制，并跳过依赖、缓存、生成和构建目录。

## 配置

在 Git 根目录创建 `.nix-engineering.mjs`：

```js
export default {
  checks: {
    nixParse: "block",
    flakeJson: "block",
  },
  limits: { maxFiles: 12, timeoutMs: 10000 },
  missingTools: "report-once",
};
```

检查模式支持 `block`、`report`、`off`。Nix 工具缺失时默认只报告一次，不会伪造通过结果。

## 使用与验证

安装后调用 `$nix-engineering` 或 `/nix-engineering`，完成前运行项目自己的 `nix flake check`、构建或目标环境验证。

```bash
npx tsx --test plugins/nix-engineering/tests/*.test.ts
./scripts/acceptance/run.sh --plugin nix-engineering
```

live acceptance 只在 `docker/host-acceptance` 中运行。版本：`0.1.0`。
