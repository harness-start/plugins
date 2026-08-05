# file-line-budget-guard

**棘轮（Ratchet）文件行数预算守卫**：在 Claude Code 和 Codex 中，对 `Edit`/`Write`/`MultiEdit`/`ApplyPatch` 操作后自动检查文件行数，按语言预设上限实施棘轮机制——超标文件只许缩小不许膨胀。

## 设计原理

### 棘轮机制（Ratchet）

```
                    当前行数 ≤ 预算？
                   /             \
                 Yes              No
                  │                │
          ≤80%    >80%       git HEAD 存在？
         静默    预警(report)   /           \
                              No            Yes
                              │              │
                        新文件              HEAD ≤ 预算？
                        DENY               /         \
                                         Yes          No
                                         │             │
                                    原本合规       历史超标
                                    现在超出         │
                                     DENY      当前 > HEAD？
                                              /          \
                                            Yes           No
                                            │              │
                                     增长 ≤ 20行?   当前 < HEAD?
                                     /        \      /        \
                                   Yes        No   Yes        No(=)
                                   │          │     │         │
                                report     DENY  report    静默
                                (小幅增长) (棘轮) (正向反馈)
```

### 预算表

| 语言 | 行数 | 语言 | 行数 |
|------|------|------|------|
| JS/TS/JSX/TSX/Vue/Svelte | 500 | PHP/Python/Ruby | 500 |
| Go/Rust/Java/C/C++/C# | 800 | Swift/Kotlin/Lua | 500 |
| Shell (.sh/.bash/.zsh) | 300 | Perl | 500 |
| CMake | 300 | Gradle | 600 |

**特殊文件名预算**：`Makefile`(300), `CMakeLists.txt`(300), `Podfile`(300) 等。

**构建配方报而不阻**：`Dockerfile`/`Containerfile` 超 500 行仅 report，不 block，因为线性文件无法拆分。

### 排除规则

- **测试文件**（路径含 `tests/`、`spec/`、`__tests__/`，或文件名含 `.test.`、`.spec.`、`Test.`）
- **生成/构建产物目录**（`dist/`、`build/`、`vendor/`、`node_modules/` 等）
- **无预算匹配的文件**：静默放行

### 故障模式：fail-open

Hook 自身出错（超时、异常、无效 JSON）时放行，不阻塞用户操作。

## 组件

| 路径 | 角色 |
| --- | --- |
| `.claude-plugin/plugin.json` | Claude Code manifest |
| `.codex-plugin/plugin.json` | Codex manifest |
| `hooks/claude.json` | Claude Code `PostToolUse` hook |
| `hooks/codex.json` | Codex `PostToolUse` hook |
| `scripts/file-budget-guard.mjs` | 核心守卫脚本 |

## 安装

```bash
# Claude Code
claude plugin install file-line-budget-guard@harness-start

# Codex
codex plugin add file-line-budget-guard@harness-start
```

## 行为

- 监听 Edit / Write / MultiEdit / ApplyPatch 操作
- 操作完成后读取文件内容统计行数
- 查询 git HEAD 获取修改前行数基线
- 按棘轮分支决策：pass / report / deny
- deny 时脚本以 exit code 2 退出，消息写入 stderr
- 80% 预算预警带 30 分钟文件级冷却
- 不依赖当前工作目录
- 不写入插件安装目录
- 不记录文件内容、凭据或完整事件

Version: `0.1.0`
