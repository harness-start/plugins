# file-line-budget-guard

**棘轮（Ratchet）文件行数预算守卫**：在 Claude Code 和 Codex 中，对 `Edit`/`Write`/`MultiEdit`/`ApplyPatch` 操作后自动检查文件行数，按规则预设上限实施棘轮机制——历史超标文件的小幅增长静默放行，超过软阈值的增长仍会阻断。

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
                                 静默      DENY  report    静默
                               (小幅增长) (棘轮) (正向反馈)
```

### 规则系统（v0.2.0）

所有规则统一为 `{ match: RegExp, budget?: number, mode: "block"|"report"|"skip" }`。

- **用户配置**：项目根目录 `.file-line-budget-guard.mjs` 中声明的规则优先匹配
- **内置默认**：未匹配到用户规则时，回退到脚本内置规则表
- **`mode: "skip"`**：匹配的文件不检查（测试、构建产物等）
- **`mode: "report"`**：仅警告不阻断（构建配方等线性文件）
- **`mode: "block"`**：棘轮机制全开（默认）

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
    oversizeSoftGrowthLimit: 100,
  },
};
```

使用插件自带 skill **`file-line-budget-guard-config`**（`skills/file-line-budget-guard-config/SKILL.md`）初始化、维护和诊断配置文件：在已启用本插件的会话中按 description 自动触发，或显式调用该 skill。

配置按以下顺序加载，找到第一个文件后停止；项目根由 `git rev-parse --show-toplevel` 定位，配置通过 `import()` 加载：

```text
<project-root>/.file-line-budget-guard.mjs
<project-root>/.file-line-budget-guard.cjs
<project-root>/.file-line-budget-guard.js
```

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `match` | `RegExp` | 是 | 匹配项目根相对路径 |
| `budget` | `number` | 除 `skip` 外必需 | 行数预算上限 |
| `mode` | `"block"`、`"report"`、`"skip"` | 否 | 默认为 `block` |

内置规则跳过测试、fixture、依赖、构建、coverage 和生成目录；Dockerfile 与 Containerfile 默认只报告；JS/TS、Vue、Svelte、PHP、Python、Ruby、Kotlin、Swift、Lua、Perl 默认预算 500 行，Go、Rust、Java、C/C++ 与 C# 默认 800 行，shell 与常见构建入口默认 300 行，Gradle 默认 600 行。用户规则位于内置规则前，按 first-match-wins 执行；没有规则命中时静默放行。

`block` 对历史超标文件应用棘轮，默认允许最多 100 行的有界维护增量；`report` 每次只提示；`skip` 不检查。配置的 `settings` 可调整临界预警比例、预警冷却时间和历史超标软增长上限。

### 故障模式：fail-open

Hook 自身出错（超时、异常、无效 JSON）时放行，不阻塞用户操作。

配置不存在或 Git 根定位失败时静默回退内置规则；配置 `import()` 失败会写一行 stderr 警告并回退内置规则；`match` 不是 `RegExp`、`mode` 不在允许集合、非 skip 规则缺少 `budget` 或正则执行异常时只跳过对应规则。非法 `settings` 字段会输出警告并回退该字段的默认值。

## 组件

| 路径 | 角色 |
| --- | --- |
| `.claude-plugin/plugin.json` | Claude Code manifest |
| `.codex-plugin/plugin.json` | Codex manifest |
| `hooks/claude.json` | Claude Code `PostToolUse` hook |
| `hooks/codex.json` | Codex `PostToolUse` hook |
| `scripts/file-budget-guard.mjs` | 核心守卫脚本 |
| `skills/file-line-budget-guard-config/` | 配置文件 init/编辑/诊断 skill |

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
- 历史超标文件在软增长阈值内保持静默，超过阈值仍阻断
- 不依赖当前工作目录
- 不写入插件安装目录
- 不记录文件内容、凭据或完整事件

版本：`0.3.3`

## 实现演进

早期实现使用 `BUDGETS_BY_EXTENSION`、`BUDGETS_BY_FILE_NAME`、`REPORT_ONLY_BUDGETS_BY_FILE_NAME`、`getBudget()`、`getReportOnlyBudget()`、`isLikelyTestOrFixture()`、`isLikelyGeneratedPath()`、`TEST_PATH_RE`、`TEST_FILE_RE`、`GENERATED_PATH_RE`、`getLowerBaseName()` 和 `extname()` 等分散入口。

现有实现统一为 `BUILTIN_RULES`、`DEFAULT_SETTINGS`、`loadUserConfig(repoRoot)`、`validateRule(rule, i)`、`resolveRules(userConfig)` 和唯一入口 `matchRule(relPath, rules)`。它通过 `rule.match.test(relPath)` 按顺序匹配，主流程先确定 `skip`、`report` 或 `block`，再进入相应预算或棘轮分支。

| 版本 | 变更 |
| --- | --- |
| `0.3.0` | 增加 `file-line-budget-guard-config` Skill |
| `0.2.0` | 引入项目配置、正则规则表和统一匹配引擎 |
| `0.1.0` | 使用硬编码预算表 |
