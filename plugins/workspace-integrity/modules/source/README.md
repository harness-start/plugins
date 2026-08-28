# 源码完整性守卫

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `workspace-integrity` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`source-integrity` 在 Claude Code 和 Codex 编辑源码时拦截三类低误报问题：源码目录中的备份或临时文件、明显由解码损坏产生的 `U+FFFD` 替换字符，以及写入后仍带 BOM 或不是严格 UTF-8 的文本文件。

## 目标

在写入边界阻止可明确识别的源码污染，而不扩张成通用 lint 或内容审查。检查聚焦备份残留、成段 replacement character 和编码字节事实，单个合法 `U+FFFD`、生成物和第三方目录不会被误当成故障。

## 实现

`PreToolUse` 从文件工具和明确 shell 写路径中提取目标及待插入文本，执行备份产物与乱码检查；`PostToolUse` 读取本次写入后的有限文本文件，校验 BOM 与严格 UTF-8。项目配置只调整内置检查，`source-integrity-config` Skill 只帮助配置，不复制 Hook 判定。

文件工具覆盖 `Edit`、`Write`、`MultiEdit`、`NotebookEdit`、`create_file`、`search_replace` 和 `apply_patch`。Shell（`Bash` / `Shell` / `exec_command` 等）只提取命令里的显式写路径：重定向、`tee`、`touch`、`sed -i`、`cp`、`mv`、`rm`，以及 `writeFile` / `open(`。乱码检查会扫这些写入的待插入文本，包括 shell 命令字面量。`ls`、`git status` 等不写出路径的命令会放行。合并冲突标记不属于本插件职责。

## 默认行为

| 检查 | 阶段 | 默认模式 |
| --- | --- | --- |
| 源码目录中的 `.bak`、`.orig`、`.tmp`、尾随 `~` 等文件 | PreToolUse | `block` |
| 连续至少 2 个或累计至少 3 个 `U+FFFD` | PreToolUse | `block` |
| BOM 或非法 UTF-8 字节序列 | PostToolUse | `block` |

`node_modules/`、`vendor/`、生成目录和构建输出不会被检查。

## 项目配置

在 Git 项目根目录创建 `.source-integrity.mjs`：

```js
export default {
  checks: {
    backupArtifact: "block",
    garbledText: "block",
  },
  overrides: [
    {
      match: /^fixtures\/legacy\//,
      checks: { garbledText: "off" },
    },
  ],
  rules: [
    {
      match: /^fixtures\/legacy\//,
      mode: "skip",
    },
  ],
};
```

`checks` 和 `overrides` 的模式可以是 `block`、`report` 或 `off`；同一 Pre 检查使用第一个声明该检查的匹配 override。Post 编码检查的 `rules` 只接受 `block` 或 `skip`，用户规则按顺序排在内置规则之前，第一个匹配项生效。配置只能调整内置检查，不能定义新的内容扫描器。也可以使用插件自带的 `source-integrity-config` Skill 维护配置。

## 设计与检查边界

插件只负责不依赖外部工具、证据明确的写前源码卫生问题。技术债标记、类型抑制、格式化、语言 lint、依赖目录保护和未解决合并冲突由其他插件负责。

`PreToolUse` 覆盖文件工具和带显式写路径的 shell。`block` 在写前返回 `permissionDecision: deny`；`report` 只注入上下文。`PostToolUse` 对本次工具写出的、已存在且不超过 2 MiB 的匹配文本文件检查 BOM 和严格 UTF-8；命中时退出并报告可验证的恢复路径。

插件只从 Git 根加载 `.source-integrity.mjs`。路径统一为仓库相对 POSIX 路径；每项 Pre 检查使用第一个同时匹配路径并声明该检查的 override，之后依次回退顶层 `checks` 和默认值。Post 编码检查先尝试用户 `rules`，再尝试内置规则。非法字段警告后回退默认值，加载失败不取消内置保护。

- 备份产物要求路径含常见源码根目录段，并以 `.bak`、`.backup`、`.old`、`.orig`、`.rej`、`.swp`、`.temp`、`.tmp` 或 `~` 结尾。
- 乱码检查只扫描本次工具输入中待插入的文本。单个 `U+FFFD` 可能合法，不拦截；连续至少两个或累计至少三个才命中。
- 第三方、生成、构建和缓存目录始终跳过，避免扫描不属于项目源码的产物。

## 验证

```bash
npx tsx --test plugins/source-integrity/tests/*.test.ts
./scripts/acceptance/run.sh --plugin source-integrity
```

版本：`0.3.0`
