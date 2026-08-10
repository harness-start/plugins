# 候选插件：`svn-delivery-guards`

| 字段 | 裁定 |
| --- | --- |
| 形态 | 新插件，建议目录 `plugins/svn-delivery-guards/` |
| 优先级 | P2 |
| 默认安装 | 否；SVN 用户 opt-in |
| 目标 | 阻断 SVN 过宽 add/commit/revert/delete 与不可审计提交消息 |

## 为什么保留

两个源仓都有 `svn-bulk-operation-guard` 和 `svn-commit-message-guard`，当前 marketplace 只有 Git 规则。SVN 的工作副本、显式路径和提交语义与 Git index 不同，不应塞进 `git-delivery-guards`，也不应抽象成一个多后端 VCS 核心。

规则只依赖 shell 命令和本地工作副本，可做成自包含插件，不需要远端 API 或 MCP。

## 最小产品合同

- 仅匹配真正位于 executable position 的 `svn`，支持 env/sudo、逻辑连接符和 pipeline 分段；提交消息或 heredoc 字面量中的 `svn` 不触发。
- 拒绝 `svn add .`、glob/`--force`/不透明 `--targets` 批量添加。
- 拒绝没有显式版本化路径的 `svn commit`，以及不透明 `--targets` 提交。
- 拒绝空、仅通用动词或过短的 `-m/--message/-F/--file` 消息；Conventional Commits 只建议，不强制。
- v1 只在能确定目标范围时处理 revert/delete/move；宽工作副本根、glob 与递归 force 拒绝，精确路径放行。
- 读取 message file 时限制大小、拒绝 symlink 和工作区外路径；诊断不回显密码、用户名或原始完整命令。

## 边界

- 不实现 SVN→Git 迁移、分支策略、认证交互、远端 hook 或 Windows GUI 客户端。
- `svn status`、`diff`、`info`、`update` 等只读/同步命令默认放行。
- 插件不自动提交，也不承诺提交已到达服务器；它只约束提交前可观察命令。

## Hook / Skill 分工

- 全部硬效果位于 shell `PreToolUse`：解析 executable position、子命令、显式路径、message source 和敏感参数，并在 SVN 副作用发生前 allow/report/deny。
- v1 不新增 Skill。已有 `svn-delivery-workflow` Skill 可以作为 status → review → add/delete/move → commit 的编排入口，但不是本插件的激活条件或信任边界。
- Skill 给出的“路径已核对”“消息合格”声明不能覆盖 Hook 解析结果；插件也不向 Skill 暴露临时放行 token。

## 实现准入与验收

- `svn` 出现在 commit message、quoted data、文件内容或其他程序参数中不触发；
- 参数换序、短长选项、`ci` 别名、`--`、message file 和多命令组合覆盖单测；
- 宽 add/commit/revert/delete 拒绝，精确路径与合格消息放行；
- 密码参数和 URL 凭据不得出现在 Hook 输出或持久状态；
- 纯 Git 仓即使安装插件也只在实际执行 `svn` 命令时工作；
- Docker 两宿主使用本地 SVN fixture 验证世界状态与 honesty gate。

补充验收：完全不加载 SVN Skill 时规则仍稳定生效；Skill 声称已审查但实际命令仍是宽目标或弱消息时继续拒绝。

若维护者没有 SVN fixture 和实际用户，保持 P2，不进入默认安装。
