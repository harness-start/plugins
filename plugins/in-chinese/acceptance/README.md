# in-chinese host acceptance

`cases/` 中的用例通过仓库验收脚本启动真实 Claude Code 和 Codex 会话。宿主会话只在 Docker 内运行。

| Case | Behavior |
| --- | --- |
| `01-session-policy` | SessionStart 注入真实策略标记和简体中文要求 |

从仓库根目录运行：

```bash
./scripts/acceptance/run.sh --plugin in-chinese
```

只运行惰性日志诚实性检查：

```bash
./scripts/acceptance/run.sh --honesty-only
```
