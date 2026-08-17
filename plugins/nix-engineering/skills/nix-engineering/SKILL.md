---
name: nix-engineering
description: Orchestrates Nix engineering and protects flake.lock with lightweight Nix parsing.
version: 0.1.0
---
# Nix Engineering

## Scope

Nix language、flakes、NixOS、Home Manager 与可复现开发环境。本 Skill 负责开放式领域工作；Hook 只负责 lockfile、依赖目录和轻量语法/配置校验。

## Workflow

1. 从仓库声明、目录和工具链识别项目类型、版本、模块边界和现有命令。
2. 明确目标、兼容范围和最小验证面，保留项目已有架构和工具约定。
3. 路由社区 Skill：当前社区候选尚未达到强依赖门槛；使用本 Skill 和项目已安装的 Nix 工具链。
4. 只修改权威声明或源码；不得直接编辑受保护 lockfile、依赖目录或生成输出。
5. 先运行最接近的检查，再运行项目声明的测试、构建或静态分析；Hook 通过不等于任务完成。
6. 报告改动、验证、未覆盖环境和恢复路径。

## 社区 Skill

v1 不声明强依赖社区 Skill。候选尚未达到跨项目共识门槛，不能为了形式完整引入低质量或框架绑定依赖。

## Hook 配置

可选配置 `.nix-engineering.mjs` 支持 `rules`、`checks`、`limits.maxFiles`、`limits.timeoutMs` 和 `missingTools`。

## Anti-patterns

- 把 Hook 激活当成构建、测试、签名、设备或集群结果证据。
- 直接修改 lockfile、依赖目录或生成文件。
- 未识别版本与项目约定就套用最新模板。
- 必需社区 Skill 不可读时继续伪装执行。
