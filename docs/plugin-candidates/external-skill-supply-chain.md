# 候选插件：`external-skill-supply-chain`

| 字段 | 裁定 |
| --- | --- |
| 形态 | 新插件，建议目录 `plugins/external-skill-supply-chain/` |
| 优先级 | P1 |
| 默认安装 | 可选安全插件，不进入默认 `install-all` |
| 目标 | 阻止 agent 把未审计第三方 Skill 直接装入全局 runtime 或在隔离区执行其代码 |

## 为什么保留

两个源仓都包含 `external-skill-global-install-guard`、`external-skill-isolation-guard` 和静态审计工具。本仓安装器只控制已声明的 `skill-deps.json`；会话中的 `npx skills add --global`、直接写 home skills 目录或下载后运行脚本仍没有保护。

这不是一般 shell 黑名单。它需要同时理解 Claude Code / Codex 各自的全局 Skill 目录、安装命令、隔离区和晋升路径，因此保持为独立安全插件。

## 最小产品合同

- `PreToolUse` 拒绝 agent 发起的全局 `skills add/install`、`gh skill install`，以及 shell/文件工具直接写入 Claude Code 或 Codex 的全局 Skill 目录。
- 不给任意 URL 做“可信来源白名单”。允许的持久安装必须先写入项目 `skill-deps.json`，声明 Skill 名称与 source，再由用户在 agent 会话外运行现有安装器。安装器跟随上游当前版本，不接受 revision 锁定。
- 插件内置 `external-skill-static-audit`：只把候选拉取到 `mktemp -d`，解析 resolved commit，生成文件清单和 SHA-256，检查 `SKILL.md`、hooks、脚本、package lifecycle、二进制、大文件、符号链接和越界路径。
- 审计器不得执行候选脚本、包管理器 lifecycle 或候选提供的命令。静态扫描通过只表示“已检查且未命中已知规则”，不表示安全认证。
- `audit begin` 由插件自带工具创建绑定 workspace、session、隔离目录和 resolved revision 的可信激活状态；只有这个状态能让 Hooks 识别审计边界。
- 激活后，`PreToolUse` 在隔离目录内只允许只读文件检查；解释器、package install/run、`git clone` 旁路和复制到 runtime 均拒绝。
- 平台目录、环境变量和回执分开存放；报告可共享，但必须记录目标平台。

```text
find-skill Skill 编排 audit begin
  → 确定性工具隔离拉取当前上游内容并记录本次审计摘要
  → PreToolUse 按可信激活状态限制隔离目录行为
  → 静态扫描生成 manifest + findings + digest
  → 仅输出“参考 / 炼化 / 拒绝”建议
  → 真正全局安装只能走项目声明 + 会话外安装器
```

## Hook / Skill 分工

- 全局目录写入保护和隔离区执行保护全部属于 `PreToolUse`，无论用户是否调用 `find-skill` 都不能绕过全局安装规则。
- `find-skill` Skill 是发现、选择候选、调用 `audit begin/scan/close`、解释报告和生成项目依赖声明的编排入口。
- Skill 不能自行 arm 隔离区、把来源标记为 trusted、签发审计通过回执或复制文件到 runtime；这些状态变化只能来自插件工具，并由 Hooks 复核。
- 静态扫描结论不自动批准安装。v1 没有 agent 会话内的“确认后放行”分支。

## 与现有插件的边界

`command-safety` 继续负责通用危险命令；本候选负责 Skill 安装语义、平台目录和隔离审计。它不修改 `install-all.sh` 的既有行为，也不在 agent Hook 中为全局安装提供可伪造的 `--yes-i-approve` 逃生参数。

## 实现准入与验收

- 普通 `npm test`、`git clone` 项目源码、读取已安装 Skill：不误拦；
- 多种包执行器、参数换序、wrapper、管道和内嵌 shell 发起的全局安装：拒绝；
- 通过 file tool 或 shell 重定向写两个平台的全局 Skill 目录：分别拒绝；
- 隔离审计遇到 symlink escape、submodule、lifecycle、不可读文件、压缩包或二进制时给出确定 finding，不执行内容；
- resolved commit 或文件摘要变化后旧报告失效；
- Docker 双宿主验证全局目标未产生，并通过 negative / near-miss / honesty 场景。

必须增加一个对抗场景：Skill 明确声称“审计通过”但未产生工具回执时，隔离区执行和全局安装仍被 Hook 拒绝。

如静态审计只能靠提示要求模型“不要执行”，没有 Hook 级目录与命令阻断，则该候选不应立项。
