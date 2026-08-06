# file-line-budget-guard

**棘轮（Ratchet）文件行数预算守卫**：在 Claude Code 和 Codex 中，对 `Edit`/`Write`/`MultiEdit`/`ApplyPatch` 操作后自动检查文件行数，按规则预设上限实施棘轮机制——超标文件只许缩小不许膨胀。

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
                                     增长 ≤ 软阈值?   当前 < HEAD?
                                     /        \      /        \
                                   Yes        No   Yes        No(=)
                                   │          │     │         │
                                report     DENY  report    静默
                                (小幅增长) (棘轮) (正向反馈)
```

### 规则系统（v0.2.0）

所有规则统一为 `{ match: RegExp, budget?: number, mode: "block"|"report"|"skip" }`。

- **用户配置**：项目根目录 `.file-line-budget-guard.mjs` 中声明的规则优先匹配
- **内置默认**：未匹配到用户规则时，回退到脚本内置规则表
- **`mode: "skip"`**：匹配的文件不检查（测试、构建产物等）
- **`mode: "report"`**：仅警告不阻断（构建配方等线性文件）
- **`mode: "block"`**：棘轮机制全开（默认）

详见 [DESIGN.md](./DESIGN.md)。

### 配置文件

```js
// .file-line-budget-guard.mjs
export default {
  rules: [
    { match: /(^|\/)tests?\//,                           mode: "skip" },
    { match: /\.(test|spec)\.[^.]+$/,                    mode: "skip" },
    { match: /(^|\/)Dockerfile$/,         budget: 500, mode: "report" },
    { match: /\.tsx?$/,                   budget: 500, mode: "block" },
    { match: /\.vue$/,                    budget: 400, mode: "block" },
  ],
  settings: {
    nearBudgetWarnRatio: 0.8,
    warnCooldownMinutes: 30,
    oversizeSoftGrowthLimit: 20,
  },
};
```

使用插件自带 skill **`file-line-budget-guard-config`**（`skills/file-line-budget-guard-config/SKILL.md`）初始化、维护和诊断配置文件：在已启用本插件的会话中按 description 自动触发，或显式调用该 skill。

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
| `skills/file-line-budget-guard-config/` | 配置文件 init/编辑/诊断 skill |
| `DESIGN.md` | 配置文件设计文档 |

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
- 按规则表顺序匹配（用户规则 → 内置规则）
- 查询 git HEAD 获取修改前行数基线
- 按棘轮分支决策：pass / report / deny
- deny 时脚本以 exit code 2 退出，消息写入 stderr
- 80% 预算预警带用户可配的冷却时间
- 不依赖当前工作目录
- 不写入插件安装目录
- 不记录文件内容、凭据或完整事件

Version: `0.3.0`
