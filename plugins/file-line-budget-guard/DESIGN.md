# `.file-line-budget-guard` 配置文件设计文档

## 1. 动机

当前 `file-budget-guard.mjs` 中所有预算、排除规则、棘轮参数全部硬编码在脚本内。不同项目、不同团队对"大文件"的阈值感知差异很大。把预算表外置为声明式配置，让每个项目按自己的代码风格和架构约束定制行数预算，同时保持默认预算作为 fallback。

## 2. 设计目标

| 目标 | 说明 |
|------|------|
| **零配置可用** | 项目没有配置文件时，完全沿用内置正则规则表，行为不变 |
| **声明式规则** | 用正则字面量 `RegExp` 表达"哪些文件允许多少行" |
| **精确优先级** | 多条规则命中同一文件时，先匹配先生效 |
| **完整覆盖** | 支持 `block`（阻断）、`report`（警告不阻断）、`skip`（排除）三种模式 |
| **配置即文档** | 读配置文件就能理解该项目的文件大小策略 |

## 3. 配置文件发现

加载顺序（找到第一个即停止）：

```
<project-root>/.file-line-budget-guard.mjs   ← 优先
<project-root>/.file-line-budget-guard.cjs
<project-root>/.file-line-budget-guard.js    （仅 ESM 项目）
```

项目根通过 `git rev-parse --show-toplevel` 定位。配置通过 `import()` 动态加载。

## 4. 配置结构

```js
// .file-line-budget-guard.mjs
export default {
  /**
   * 规则列表：按顺序匹配，第一条命中的规则生效。
   * 用户规则优先于内置规则（前置合并）。
   */
  rules: [
    // ── skip ──
    { match: /(^|\/)tests?\//,                           mode: "skip" },
    { match: /(^|\/)spec\//,                             mode: "skip" },
    { match: /(^|\/)__tests__\//,                        mode: "skip" },
    { match: /\.(test|spec)\.[^.]+$/,                    mode: "skip" },
    { match: /Test\.(php|java|kt)$/,                     mode: "skip" },
    { match: /_test\.(go|py|rb|rs)$/,                    mode: "skip" },
    { match: /(^|\/)(dist|build|coverage|vendor|node_modules|target|\.next|\.nuxt|__generated__|generated)\//, mode: "skip" },

    // ── report ──
    { match: /(^|\/)Dockerfile$/,         budget: 500, mode: "report" },
    { match: /(^|\/)Containerfile$/,      budget: 500, mode: "report" },

    // ── block ──
    { match: /\.tsx?$/,                   budget: 500,  mode: "block" },
    { match: /\.jsx?$/,                   budget: 500,  mode: "block" },
    { match: /\.vue$/,                    budget: 500,  mode: "block" },
    { match: /\.svelte$/,                 budget: 500,  mode: "block" },
    { match: /\.php$/,                    budget: 500,  mode: "block" },
    { match: /\.py$/,                     budget: 500,  mode: "block" },
    { match: /\.rb$/,                     budget: 500,  mode: "block" },
    { match: /\.go$/,                     budget: 800,  mode: "block" },
    { match: /\.rs$/,                     budget: 800,  mode: "block" },
    { match: /\.java$/,                   budget: 800,  mode: "block" },
    { match: /\.kt$/,                     budget: 500,  mode: "block" },
    { match: /\.swift$/,                  budget: 500,  mode: "block" },
    { match: /\.(c|cc|cpp|cxx)$/,         budget: 800,  mode: "block" },
    { match: /\.(h|hh|hpp|hxx)$/,         budget: 500,  mode: "block" },
    { match: /\.cs$/,                     budget: 800,  mode: "block" },
    { match: /\.lua$/,                    budget: 500,  mode: "block" },
    { match: /\.sh$/,                     budget: 300,  mode: "block" },
    { match: /\.bash$/,                   budget: 300,  mode: "block" },
    { match: /\.zsh$/,                    budget: 300,  mode: "block" },
    { match: /\.(pl|pm)$/,                budget: 500,  mode: "block" },
    { match: /\.cmake$/,                  budget: 300,  mode: "block" },
    { match: /\.gradle$/,                 budget: 600,  mode: "block" },
    { match: /(^|\/)Makefile$/,           budget: 300,  mode: "block" },
    { match: /(^|\/)GNUmakefile$/,        budget: 300,  mode: "block" },
    { match: /(^|\/)CMakeLists\.txt$/,    budget: 300,  mode: "block" },
    { match: /(^|\/)Rakefile$/,           budget: 300,  mode: "block" },
    { match: /(^|\/)Podfile$/,            budget: 300,  mode: "block" },
  ],

  settings: {
    nearBudgetWarnRatio: 0.8,
    warnCooldownMinutes: 30,
    oversizeSoftGrowthLimit: 100,
  },
};
```

### 4.1 规则字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `match` | `RegExp` | 是 | 匹配目标为相对于项目根目录的路径，如 `src/foo/bar.component.ts` |
| `budget` | `number` | 除 `mode: "skip"` 外必需 | 行数预算上限 |
| `mode` | `"block"` \| `"report"` \| `"skip"` | 否 | 默认 `"block"` |

### 4.2 `mode` 语义

| mode | 超预算行为 | 棘轮（历史超标） |
|------|-----------|------------------|
| `block`（默认） | 阻断写入，要求拆分 | 生效：历史超标文件允许最多 100 行的有界维护增量，更大改动要求拆分；可通过项目配置收紧 |
| `report` | 仅输出警告，不阻断 | 不生效：每次仅提示 |
| `skip` | 不检查，静默放行 | 不生效 |

## 5. 优先级：前置合并，先到先得

```
用户 rules ──→ 命中？→ 用此规则
用户 rules ──→ ...
用户 rules ──→ ...
内置 rules ──→ 命中？→ 用此规则
内置 rules ──→ ...
────────────────→ 无命中 → 静默放行
```

实现上就是把用户 `rules` 数组拼在内置 `rules` 数组前面，从头遍历，`rule.match.test(relPath)` 命中即停。

## 6. 脚本核心改动点

### 6.1 删除的代码

- `BUDGETS_BY_EXTENSION` 对象
- `BUDGETS_BY_FILE_NAME` 对象
- `REPORT_ONLY_BUDGETS_BY_FILE_NAME` 对象
- `getBudget()` 函数
- `getReportOnlyBudget()` 函数
- `isLikelyTestOrFixture()` 函数
- `isLikelyGeneratedPath()` 函数
- `TEST_PATH_RE` / `TEST_FILE_RE` / `GENERATED_PATH_RE` 常量
- `getLowerBaseName()` / `extname()` 等匹配辅助函数

### 6.2 新增的代码

- `BUILTIN_RULES` — 数组，每条是 `{ match: RegExp, budget?: number, mode: "block"|"report"|"skip" }`
- `DEFAULT_SETTINGS` — 默认全局设置对象
- `loadUserConfig(repoRoot)` — 按优先级尝试 `import()` 配置文件
- `validateRule(rule, i)` — 校验单条规则结构
- `resolveRules(userConfig)` — 前置合并规则表 + 合并 settings
- `matchRule(relPath, rules)` — **唯一匹配入口**，遍历规则数组，`match.test(relPath)` 命中即返回

### 6.3 主流程改动

```
原流程:
  getReportOnlyBudget() → getBudget() → 是否测试/生成目录 → 棘轮

新流程:
  matchRule(relPath, rules) → rule.mode === "skip"  → 放行
                             → rule.mode === "report" → 超预算则 warn
                             → rule.mode === "block"  → 棘轮判断
```

棘轮分支继续覆盖新文件、历史合规、历史超标和正向反馈；历史超标文件在软增长阈值内静默放行，超过阈值仍阻断。

## 7. 错误处理（fail-open）

| 场景 | 行为 |
|------|------|
| 配置文件不存在 | 回退内置规则，静默 |
| `import()` 失败（语法错误等） | stderr 一行警告，回退内置规则 |
| 某条 `match` 不是 `RegExp` | stderr 警告+下标，跳过该条 |
| `budget` 缺失且非 skip | stderr 警告+下标，跳过该条 |
| `git rev-parse` 失败 | 回退内置规则 |
| 正则 `.test()` 抛异常 | 跳过该条 |

## 8. 配置管理 Skill

插件内 skill：`skills/file-line-budget-guard-config/SKILL.md`。

用于在目标仓库初始化、增删改、诊断 `.file-line-budget-guard.mjs`。Agent 应遵循该 skill 的 schema 与反模式约束，而不是手写与 hook 不一致的字段。

## 9. 版本升级路径

| 版本 | 变更 |
|------|------|
| `0.3.0` | 增加 `file-line-budget-guard-config` skill 管理项目配置文件 |
| `0.2.0` | 引入配置文件、正则规则表、统一匹配引擎；内置表从对象常量转为数组正则 |
| `0.1.0` | 硬编码预算表 |
