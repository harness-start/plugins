# 双宿主验收

从仓库根目录运行：

```bash
./scripts/acceptance/run.sh --plugin engineering-mindset
```

脚本会在 `docker/host-acceptance` 容器内为 Claude Code 和 Codex 创建隔离会话，并按 `skill-deps.json` 安装固定版本的社区 Skill。

- `01-debug-and-verify`：不在 prompt 中点名 Skill；验证 SessionStart 注入系统化调试与完成前验证路由，并检查真实失败被最小修复和验证。
- `02-explicit-caveman`：用户明确要求减少 token 时，验证 `caveman` 路由已注入并保持指定技术内容不变。
- `03-simple-control`：简单精确回复只接收 SessionStart 上下文，不加载工程 Skill。

验收只证明这些固定场景中的依赖安装、平台化路由注入和结果，不把模型是否每次主动调用或读取 Skill 当作稳定硬门禁，也不外推为所有任务的质量保证。实际加载仍保留在 live 日志中供观测。
