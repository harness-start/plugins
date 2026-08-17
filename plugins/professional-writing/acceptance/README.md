# 双宿主验收

从仓库根目录运行：

```bash
./scripts/acceptance/run.sh --plugin professional-writing
```

脚本会在 `docker/host-acceptance` 容器内为 Claude Code 和 Codex 创建隔离会话。本插件自带 Skill，不再安装社区依赖。

- `01-debug-and-verify`：不在 prompt 中点名 Skill；验证 SessionStart 注入系统化调试与完成前验证路由，并检查真实失败被最小修复和验证。
- `02-explicit-caveman`：用户明确要求减少 token 时，验证 `caveman` 路由已注入并保持指定技术内容不变。
- `03-simple-control`：简单精确回复只接收 SessionStart 上下文，不加载工程 Skill。
- `04-english-natural-writing`：英文成稿加载 `humanizer` 与 `stop-slop`，保留事实并清除合成模板簇。
- `05-chinese-natural-writing`：中文成稿加载 `humanizer-zh`、`shuorenhua` 与 `ai-flavor-remover`，保留事实且不编造第一人称。
- `06-markdown-analyzer`：Markdown 正文额外加载 `remove-ai-style`，保留受保护内容并留下修改前后两次分析器证据。

验收只证明这些固定场景中的依赖安装、平台化路由注入和结果，不把模型是否每次主动调用或读取 Skill 当作稳定硬门禁，也不外推为所有任务的质量保证。实际加载仍保留在 live 日志中供观测。
