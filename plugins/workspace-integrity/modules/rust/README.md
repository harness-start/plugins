# Rust 工程插件

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `workspace-integrity` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`rust-engineering` 面向 Cargo、ownership、错误处理、API 设计、async/concurrency、unsafe 与测试任务。Skill 负责开放式工程方法，Hook 保护 Cargo 生成状态并提供轻量格式反馈。

## 目标

- 根据 crate、workspace、edition 和项目现有命令完成实现或审查。
- 防止直接编辑由 Cargo 生成的 `Cargo.lock`。
- 对本次修改的 Rust 源码提供有界 `rustfmt` 检查。
- 不把格式检查替代编译、Clippy、测试、Miri、基准或 unsafe 审计。

## 实现

`rust-engineering` 是主入口，复杂实现、并发、unsafe、性能和 API 设计可按需读取插件内的 `rust-engineering-playbook`。`PreToolUse` 拒绝文件工具或明确 shell 写入直接修改 `Cargo.lock`，要求从 `Cargo.toml` 出发由 Cargo 重新生成。`PostToolUse` 对本次修改的 `.rs` 文件执行 `rustfmt` 检查，默认只报告。

## 配置

在 Git 根目录创建 `.rust-engineering.mjs`：

```js
export default {
  checks: { rustfmt: "report" },
  limits: { maxFiles: 12, timeoutMs: 10000 },
  missingTools: "report-once",
};
```

检查模式支持 `block`、`report`、`off`。Cargo 命令未显式把受保护文件作为普通写目标时保持放行。

## 使用与验证

安装后调用 `$rust-engineering` 或 `/rust-engineering`，完成前运行项目自己的 `cargo test`、`cargo clippy`、构建及必要的平台验证。

```bash
npx tsx --test plugins/rust-engineering/tests/*.test.ts
./scripts/acceptance/run.sh --plugin rust-engineering
```

live acceptance 只在 `docker/host-acceptance` 中运行。版本：`0.1.0`。
