# harness-starter → harness-start/plugins 迁移计划

> 状态：Draft v1 · 2026-08-05
> 范围：把 `infra/harness-starter` 的 hooks/脚本实现按插件分组逐步迁入 `harness-start/plugins`（Claude Code + Codex 双平台 Marketplace），并在迁移过程中分阶段加强 hooks 基建。

---

## 1. 背景与现状

### 1.1 源仓库：`infra/harness-starter`

单一 monorepo，承载 agent harness 运行时与 238 个可安装 Skill 包：

| 组成 | 规模 | 说明 |
| --- | --- | --- |
| `skills/*` | 238 个包 | 每个包一个 Skill；约 84 个包拥有 `src/hooks/`，共约 **235 个 hook 定义**（含辅助模块） |
| `core/*` | 18 个包 | `@harness/core`（hook 契约）、`@harness/hook-support`（35 个共享 hook 工具模块）、`@harness/hook-runtime`（hook 调用与测试助手）等 |
| `tools/` | 审计/基准/同步脚本 | 架构审计、行为基准、产物同步 |
| `docs/` | 架构与治理文档 | package-map、skill-inventory、skill-package-architecture |

hooks 语义特征（与目标仓库直接相关）：

- **契约层**（`core/core/src/hook-contracts.ts`）：规范化事件名 `HookEventName`（session.start / prompt.submitted / tool.before / tool.after / agent.stopped …）、统一 `EventPayload`（platform、cwd、sessionId、tool、raw）、`HookResult` 五种结果（allow / deny / modify-input / add-context / report）。
- **支持层**（`core/hook-support/src/`，35 个模块）：`hook-edit-write-utils`、`protected-paths`、`hook-state-store`、`hook-recovery-state`、`completion-receipts`、`operational-state/digest`、`context-budget-state`、`language-drift`、`prompt-intent-filters`、`bounded-jsonl`、`file-stat-cache`、`command-outcome`、`error-utils`、`debt-guard-utils`、`dependency-lockfiles`、`encoding-guard`、`file-check-hook`、`hook-bash-git-shell-utils` 等。
- **测试层**（`core/hook-runtime/src/hook-testing.ts`）：`createHookEvent` / `invokeHook` / `hookFromModule`，用 fixture 事件驱动 hook 测试。
- **治理原则**（AGENTS.md）：fail-closed Hook 必须输出 `blockingContract`（observedFacts / harm / unblockWhen / recovery）；Hook 只强制执行不可逆副作用、虚假完成声明、高风险安全问题对应的可观察不变量；Hooks 归其执行的 Skill 所有。

### 1.2 目标仓库：`harness-start/plugins`

双平台插件 Marketplace（Claude Code + Codex），当前状态：

| 组件 | 状态 |
| --- | --- |
| `.claude-plugin/marketplace.json` | 已建立，登记 2 个插件 |
| `.agents/plugins/marketplace.json` | 已建立，登记 2 个插件 |
| `plugins/process-confidence` | 0.1.0，交付流程插件：session registry、receipt、stage、Stop 门禁，6 个 hook 脚本 + lib + tests |
| `plugins/file-line-budget-guard` | 0.1.0 → **工作区有未提交的 0.2.0 改动**（外部配置文件 + DESIGN.md，脚本重写 387 行） |
| `scripts/ci/validate-plugins.sh` | JSON 校验、脚本语法、双 manifest 版本一致、marketplace 登记一致性、`claude plugin validate --strict`、Codex marketplace 加载 |
| `GUIDE.md` | 完整初始化/发布/更新/安全规范（插件自包含、版本规则、验收标准） |

目标仓库已确立的硬约束（来自 GUIDE.md，迁移必须遵守）：

1. **插件自包含**：禁止 `../other-plugin/...`、`../../shared/...` 运行时引用；Claude Code 只复制单个插件目录。
2. **双平台独立 manifest / hook 配置**：字段、环境变量（`CLAUDE_PLUGIN_ROOT` vs `PLUGIN_ROOT`）、事件语义不一致，不共用一份。
3. **版本双 manifest 一致**，Marketplace 不重复声明版本。
4. **共享实现**三种合法途径：独立 npm 包、发布前复制到每个插件、构建步骤生成完整发布目录。
5. **CI 不能替代真实会话验收**：每插件双平台新会话触发、信任、退出码验证。

### 1.3 迁移目标

1. 把 harness-starter 中**可独立运行、可观察、适合事件驱动**的能力（hooks 及其脚本、状态存储、门禁逻辑）按插件分组迁入目标仓库；
2. 迁移不是复制粘贴，而是**按插件边界重构成双平台自包含插件**；
3. 迁移过程中**分阶段加强 hooks 基建**：共享库、测试、契约、安全基线、验收矩阵、发布治理；
4. 源仓库按迁移进度**逐项退役被迁走的 hooks**（另行走 harness-starter 自己的 MR 流程，不在本仓库内改动）。

### 1.4 迁移边界（不迁什么）

| 不迁移 | 原因 |
| --- | --- |
| `@harness/core` 组件契约工厂、`@harness/registry`、`@harness/workspace` 等 TypeScript 包体系 | 目标仓库是无构建产物的纯脚本插件仓库；契约以文档 + JSON Schema + 测试形式落地 |
| Skill 正文、`SKILL.md`、References、Instructions | 目标仓库是 hooks/scripts 仓库，不是 Skill 包仓库 |
| `runtime-*` 安装器、dist 投影、bootstrap | 属于 harness-starter 自己的安装链 |
| Langfuse 观测、publish-qiniu、migrate-ai-experts-v1 | 不属于插件能力面 |
| 238 个 Skill 的领域方法正文 | 只迁移其中"可观察不变量 → Hook"的部分 |

---

## 2. 分组原则（怎么把 235 个 hooks 归成插件）

### P1. 按事件面成本分组，不按 Skill 归属分组

每个注册的 hook 都会在对应事件上被宿主调用。PreToolUse / PostToolUse 是全局 matcher，**一个插件 = 一个事件面上的多道检查**，插件内部用 dispatcher 按文件类型/路径分派，避免每个检查单独注册、也避免一个文件改动触发 N 个进程启动。

### P2. 一个不变量只有一个拥有者

沿用 harness-starter 原则：Hook 归其强制执行的不变量所属插件。同一不变量在源仓库多个 Skill 间重复实现（如 file-budget-guard、encoding-guard、debt-guard 的跨语言复制），迁移时**收敛为单插件内的单实现**（源侧相应删除重复 hooks，防止双写漂移）。

### P3. 语言族守卫按语言分组，横切守卫按关注域分组

- 语言族守卫（syntax / encoding / lockfile / debt / env-detector / lint 集成）按语言族合并成一个插件（php、typescript、python、go、rust、jvm、web-frontend、infra-devops、mobile、misc-lang）。
- 横切守卫（git 交付、命令安全、执行纪律、完成门禁、上下文注入）按关注域分组。
- 理由：语言族插件的脚本内部共享同一套 check-runner；横切守卫共享同一套状态机/门禁逻辑。都满足"一个插件一个可解释职责"。

### P4. 插件内部分层

```text
plugins/<name>/
├── .claude-plugin/plugin.json
├── .codex-plugin/plugin.json
├── hooks/claude.json           # 平台事件绑定（薄）
├── hooks/codex.json
├── scripts/
│   ├── <name>-hook-<event>.mjs # 入口：读 stdin → 规范化 → 分派 → 输出
│   ├── checks/                 # 具体检查（按语言/规则）
│   └── lib/                    # 插件内共享实现（允许 vendor 自 shared/）
├── tests/                      # node:test，fixture 驱动
├── schemas/                    # 配置/回执 JSON Schema
├── templates/                  # 生成的产物模板（如适用）
├── README.md / DESIGN.md / CHANGELOG.md
```

### P5. 共享实现走 vendor 机制（符合 GUIDE.md §3）

- 仓库内维护 `shared/` 源码目录（自 harness-starter `hook-support` 移植的精简纯 JS 版）；
- 构建期由 `scripts/sync-shared-lib.mjs` 把插件声明需要的模块 **内联复制** 进各插件 `scripts/lib/`（带 `// vendored from shared/<file>@<hash>` 头注释）；
- CI 增加 **drift 门禁**：`node --test` 之外执行 `scripts/sync-shared-lib.mjs --check`，任何插件内 vendor 副本与 `shared/` 源码不一致即失败；
- 不引入 npm 包依赖、不引入构建链，保持仓库零依赖可运行。

---

## 3. 目标插件地图

> 数量 = 源仓库对应 Skill 的 `src/hooks/*.ts` 文件数（含辅助模块），迁移时按"不变量收敛"合并实现，最终脚本数通常更少。

### 3.1 仓库级基建（非插件）

| 组件 | 来源 | 说明 |
| --- | --- | --- |
| `shared/`（vendor 源） | `core/hook-support` 纯 JS 子集 | hook-io、bounded-jsonl、error-utils、file-stat-cache、state-store、git 工具、路径/所有权工具 |
| `scripts/sync-shared-lib.mjs` | 新建 | vendor 复制 + drift 校验 |
| `tests/helpers/hook-harness.mjs` | `core/hook-runtime/hook-testing.ts` | createHookEvent / invokeHook / fixture 事件样本库 |
| `schemas/hook-event.schema.json` 等 | `core/core/hook-contracts.ts` | 事件输入、回执、blockingContract 的 JSON Schema |
| CI 扩展 | 现有 `validate-plugins.sh` | 增加 node --test、drift 门禁、hook JSON schema 校验、安全基线扫描 |

### 3.2 插件清单（按建议迁移顺序）

| # | 插件 | 来源（harness-starter） | hooks 量 | 事件面 |
| --- | --- | --- | --- | --- |
| P0a | `process-confidence`（已有，收口） | 现仓库自身 | 6 | SessionStart / UserPrompt / PreToolUse / PostToolUse / Stop |
| P0b | `file-line-budget-guard`（已有，收口 0.2.0） | `code-comment-discipline` file-budget-guard | 1 | PostToolUse(Edit\|Write…) |
| P1 | `php-runtime-guards` | php-engineering(15)、laravel-patterns、thinkphp-maintenance、php-async-worker-runtime-patterns、symfony-bundle-boundary-governance | 21 | SessionStart(env) + PreToolUse(syntax/encoding/lockfile/debt) + PostToolUse(lint/phpstan) |
| P2 | `typescript-runtime-guards` | typescript-engineering(8)、nestjs-layering-patterns | 9 | 同上 |
| P3 | `python-runtime-guards` | python-engineering | 7 | 同上 |
| P4 | `go-runtime-guards` | go-engineering | 7 | 同上 |
| P5 | `rust-runtime-guards` | rust-engineering | 6 | 同上 |
| P6 | `jvm-runtime-guards` | jvm-engineering | 7 | 同上 |
| P7 | `web-frontend-guards` | vue、react、svelte、css、nuxt、tarojs、wechat-miniprogram、frontend-design-taste、godot | 18 | SessionStart(env) + PreToolUse(syntax/encoding) + PostToolUse(lint/debt) |
| P8 | `infra-devops-guards` | infrastructure-engineering、kubernetes-operations、opentofu-plan-safety、gh-fix-ci、pve-operations、network-path-diagnosis、k8s-stateful-storage-operations | 17 | PreToolUse(syntax/lint) + Bash 输出审计 |
| P9 | `mobile-guards` | ios-app-review-iap、android-apk-audit、flutter/dart-engineering、react-native-engineering | 8 | SessionStart(env) + PreToolUse(syntax/encoding) |
| P10 | `misc-lang-guards` | ruby、swift、dotnet、dart、elixir、nix、rlang、solidity、cpp、deno、windows、javascript、angular、motion-graphics | 26 | 同上 |
| P11 | `git-delivery-guards` | ci-gated-mr-workflow(8)、merge-conflict-resolution、svn-delivery-workflow、git-worktree-lifecycle | 13 | PreToolUse(Bash) + PostToolUse(Bash) + UserPrompt |
| P12 | `command-safety-guards` | command-safety-governance(4)、agentic-ai-security-assessment(4)、ethical-hacking-methodology、db-ha-replication(4)、lark-workspace-operations | 14 | PreToolUse(Bash/Write) + PostToolUse |
| P13 | `execution-discipline-guards` | execution-loop-governance(4)、reasoning-discipline、language-output-governance(4)、engineering-simplicity-discipline、feedback-reflection-workflow、runtime-governance(8)、long-task-context-governance(6)、find-skill(2) | 32 | SessionStart + UserPrompt + PostToolUse + Stop |
| P14 | `delivery-evidence`（完成门禁，与 process-confidence 生态协同） | agentic-fix-review-gate(5)、completion-gates 域（content-credibility、deck-storyboard、pptx、spec-workflow、training、video、tdd、design-doc 等 27 个） | 32 | Stop / PostToolUse / 按域 matcher |
| P15 | `context-rules` | agent-harness-design(2)、project-instruction-maintenance(3)、skill-routing-governance(7)、documentation-quality(2)、memory-governance、humanizer(2)、implementation-planning、plan-execution-workflow、project-instruction-maintenance | ~22 | SessionStart + UserPromptSubmit（注入/提醒类） |

> P14 与 P15 的"hooks 量"含大量源侧辅助模块（如 task-ledger-* 六个文件本质是一个状态机），迁移时按 P2 原则收敛。
> P1–P10 按语言族分批，每批完成后 hooks 基建里程碑推进一级（见 §5）。

### 3.3 迁移后仓库形态

```text
harness-start/plugins/
├── shared/                      # vendor 源（hook 基建）
├── plugins/<15 个插件>/         # 各自自包含
├── scripts/
│   ├── ci/validate-plugins.sh   # 扩展
│   └── sync-shared-lib.mjs      # vendor 同步 + drift 检查
├── schemas/                     # 仓库级共享 schema（事件/回执/配置）
├── tests/                       # 仓库级集成测试 + fixture 样本
├── docs/
│   ├── hooks-contracts.md       # 事件规范化、退出码、blockingContract 约定
│   ├── hooks-security-baseline.md  # GUIDE §18 的可执行化清单
│   └── acceptance-matrix.md     # 每插件双平台真实会话验收记录
└── GUIDE.md / README.md         # 更新插件清单
```

---

## 4. hooks 基建建设路线（迁移的"加强"主轴）

基建按里程碑 M0–M5 推进，每个里程碑对应一个可独立验收的增量，不随单一插件绑定。

### M0 · 共享 hook 运行时库（Phase 0）

从 `core/hook-support` 移植并精简为纯 JS（无 @harness 依赖）：

| shared 模块 | 移植来源 | 职责 |
| --- | --- | --- |
| `hook-io.mjs` | 各插件现用 stdin 解析 + `bounded-jsonl.ts` | 读 stdin（cap）、JSON 解析、双平台事件规范化（Claude/Codex 字段差异）、统一退出码（0 放行 / 2 拒绝 / 3 错误）、stdout 约定 |
| `error-utils.mjs` | `error-utils.ts` | 统一错误消息、栈裁剪、hook 上下文附加 |
| `file-stat-cache.mjs` | `file-stat-cache.ts` | 进程内 stat 缓存（size+mtime 签名） |
| `state-store.mjs` | `hook-state-store.ts` | 会话/项目级原子状态读写（含 fsync、权限收紧） |
| `git-utils.mjs` | `hook-bash-git-shell-utils.ts` | git root、HEAD 内容、diff 只读查询（execFile 白名单） |
| `paths.mjs` | `protected-paths.ts` 思路 | 插件根/数据目录解析、路径归一化、越界检测 |
| `ownership.mjs` | process-confidence `lib/ownership.mjs` 现有实现 | 会话所有权校验，提升为共享 |

验收：`shared/` 单测全绿；两个存量插件重构为经 `hook-io.mjs` 入口，行为回归通过。

### M1 · 测试基建（Phase 0）

- 移植 `hook-testing.ts` 为 `tests/helpers/hook-harness.mjs`：`createHookEvent`（录制 allow/deny/modify-input/add-context/report）、`invokeScript(fixture)`（起子进程喂 stdin、断言退出码与输出）。
- `tests/fixtures/` 放双平台真实事件样本（SessionStart / PreToolUse Edit / PostToolUse Bash 等），作为所有插件测试的公共 corpus。
- 根 `package.json`（仅 scripts 字段）：`"test": "node --test plugins/*/tests/ tests/"`，零依赖。
- CI：`validate-plugins.sh` 增加 `node --test` 步骤。

验收：每个插件必须带 `node --test` 可跑测试；核心事件面（拒绝/放行/注入/报告）各有 fixture 覆盖。

### M2 · 契约与 Schema（Phase 1 完成时）

- `docs/hooks-contracts.md`：把 `hook-contracts.ts` 语义文档化——规范化事件名 ↔ 双平台 hook 事件映射、`EventPayload` 关键字段、五种 HookResult 的落地方案（Claude 用退出码+stderr、Codex 用 JSON output 的对应关系）。
- `schemas/`：hook 输入事件、receipt、blockingContract 的 JSON Schema；`validate-plugins.sh` 增加对 hooks/*.json 的 schema 校验（事件名白名单、matcher 语法、timeout 上限、命令必须引用 `${CLAUDE_PLUGIN_ROOT}`/`${PLUGIN_ROOT}`）。
- fail-closed 约定：拒绝类 hook 的 stderr 必须输出 `blockingContract` 四要素（observedFacts / harm / unblockWhen / recovery），由测试断言。

验收：所有 P1–P10 插件的 hooks JSON 通过 schema 校验；拒绝路径输出符合约定。

### M3 · 安全基线自动化（Phase 2）

把 GUIDE §18 清单可执行化，CI 静态扫描每个插件：

- 命令可见性：hooks JSON 中 command 全部可见、无变量拼接的可疑模式；
- 无网络调用、无 `npm install` / `curl|sh` / 动态安装；
- 无 token/prompt/环境变量回显（正则扫描 stderr 模板）；
- 不写插件安装目录（除 `PLUGIN_DATA`/`CLAUDE_PLUGIN_DATA`）；
- 不依赖 cwd；每脚本有超时与错误恢复路径（schema 强制 timeout 字段）。

验收：扫描器零误报通过；新增插件必须过基线才能合入。

### M4 · 真实会话验收矩阵（Phase 3）

- `docs/acceptance-matrix.md`：每插件一行，记录双平台（Claude / Codex）各自的新会话触发、hook 信任、事件命中、退出码、持久化位置、回滚 tag。
- 发布流程强制：插件版本 bump 前必须先更新矩阵（CI 检查矩阵中该插件"已验收版本" ≥ manifest 版本）。

### M5 · 发布治理（Phase 4）

- 每插件强制 `CHANGELOG.md`（GUIDE §15.3 要求）；
- 发布 checklist 脚本化：`scripts/ci/release-check.sh`（双 manifest 版本一致、CHANGELOG 更新、矩阵验收、回滚 tag 存在）；
- 与 harness-starter 侧退役联动：迁移完成的 hooks 在源仓库登记退役清单（见 §6 Phase 4）。

---

## 5. 分阶段实施计划

### Phase 0 · 地基 + hooks 基建（M0、M1 + 存量收口）

**目标**：仓库获得可复用的 hook 基建；两个存量插件收口到新基线上；CI 具备测试与 drift 门禁。

任务：

1. 收口 `file-line-budget-guard` 未提交工作区：评审 0.2.0 外部配置设计（DESIGN.md + `.file-line-budget-guard.mjs`），补测试（内置规则、用户规则优先级、ratchet 冻结、skip/report/block 三模式），提交 + MR + 双平台真实会话验收（文件超限被拒）。
2. `process-confidence` 补全测试缺口（当前仅 2 个测试文件），hooks 入口统一走 `hook-io.mjs`。
3. 建立 `shared/` + `scripts/sync-shared-lib.mjs` + drift 门禁（CI）。
4. 建立 `tests/helpers/hook-harness.mjs` + fixture corpus + 根 package.json test 脚本。
5. 写 `docs/hooks-contracts.md` 初稿（事件映射 + 退出码约定）。
6. CI 扩展：`node --test`、vendor drift、hook JSON schema 初版。

**验收**：

- `bash scripts/ci/validate-plugins.sh` 全绿（含新增测试步骤）；
- 两个存量插件双平台真实会话验收通过并记录；
- 未提交工作区清零，master 上无未合并改动。

**hooks 建设增量**：M0 ✅ M1 ✅

### Phase 1 · 语言守卫插件（P1–P10，分 3 批）

**目标**：最大一批能力入仓，且所有语言守卫共享同一套 check-runner 模式。

批次（每批 = 一个 MR 或多个 MR，批内插件逐个合入）：

| 批 | 插件 | 说明 |
| --- | --- | --- |
| 1a | `php-runtime-guards`、`typescript-runtime-guards` | 源 hooks 最多的两个，先行验证 check-runner 模式（env-detector → 会话标记；syntax 检查器注册表；encoding/lockfile/debt 通用器） |
| 1b | `python-runtime-guards`、`go-runtime-guards`、`rust-runtime-guards`、`jvm-runtime-guards` | 复用 1a 的 runner，仅新增语言专属检查器 |
| 1c | `web-frontend-guards`、`infra-devops-guards`、`mobile-guards`、`misc-lang-guards` | 长尾收敛；重复实现（如多语言的 encoding/lockfile/debt）在 shared 中收口 |

每插件迁移必须完成 §6 清单。语言族插件的共性问题：

- env-detector 会话标记去重：同一 SessionStart 注入一次"当前栈"（复用 process-confidence 的 session-registry 模式），PreToolUse 检查按文件后缀查栈，避免 20 个 detector 各自写状态；
- 语法检查器统一由 `checks/syntax-runner.mjs` 分派（按扩展名 → 命令 → 超时 → 输出截断），不再每语言一套独立逻辑；
- lint 类（phpstan/ruff/eslint/actionlint/kubeconform/terraform fmt）遵循"仅提示+少量门禁"：PostToolUse 默认 report，只有配置开启才 block，且必须带 `blockingContract` 恢复路径。

**验收**：每批完成时，该批插件 CI 全绿、双平台会话验收通过、schema 与契约测试覆盖（M2 在 Phase 1 完成时达成）。

**hooks 建设增量**：M2 ✅（契约与 schema 固化）

### Phase 2 · 流程与纪律插件（P11–P13 + M3）

**目标**：横切守卫入仓；安全基线自动化生效。

| 插件 | 要点 |
| --- | --- |
| `git-delivery-guards` | 迁移 ci-gated-mr-workflow 的 8 个 git 守卫（分支命名、提交信息、heredoc、destructive、partial staging、add guard）+ merge-conflict / svn / worktree；注意与 `process-confidence` 的 Stop 门禁叠加时的输出次序 |
| `command-safety-guards` | cat-write / sed-inplace / dangerous-command / deny-escalation + secret-leak / secret-read / log-pii + 数据库与基础设施危险命令（mysql、redis-cli、kubectl、pve）；安全类拒绝必须 fail-closed 并带恢复路径 |
| `execution-discipline-guards` | edit-loop-detector、error-retry、remote-polling-budget、reasoning-depth、language-drift（含 bash/tool/stop 三出口）、simplicity 提示；与 process-confidence 共享 Stop 事件，注意 hook 顺序（priority 语义） |

**验收**：M3 安全基线扫描全绿；P11–P13 全部双平台验收；与 process-confidence 的事件叠加无冲突（同事件多插件按顺序执行，输出可辨识来源前缀）。

**hooks 建设增量**：M3 ✅

### Phase 3 · 完成门禁与上下文（P14–P15 + M4）

**目标**：完成类门禁与注入类 hooks 入仓，验收矩阵成为发布门禁。

- `delivery-evidence`：收敛各域 completion-gate（内容可信、deck/pptx、spec、training、video、tdd、design-doc、ADR 等）与 agentic-fix-review-gate 的 review 门禁；与 process-confidence 的 receipt/stage 模型对齐（gate 结果写入同一证据目录）。
- `context-rules`：收敛注入/提醒类（skill-routing 的 prompt-guidance、project-instructions 三件套、agent-harness 注入器、feedback-reflection、memory 提醒）；注入类 hook 必须遵守预算与去重（M0 的 state-store + context-budget 语义）。

**验收**：acceptance-matrix.md 覆盖全部 15 个插件；CI 校验矩阵与版本一致性（M4）。

**hooks 建设增量**：M4 ✅

### Phase 4 · 收口与治理（M5 + 源侧退役）

**目标**：全量插件在册；发布治理闭环；与 harness-starter 侧同步退役，杜绝双写漂移。

任务：

1. 生成 `docs/plugin-inventory.md`（插件 ↔ 源 Skill 映射 ↔ 退役状态），CI 校验与 marketplace 一致；
2. harness-starter 侧按本计划登记退役：每个已迁移 hook 在源仓库删除或标记 retired（走源仓库 MR + issue 记录，遵循跨仓生命周期治理：引用复扫、消费者清理）；
3. 每插件补齐 CHANGELOG 与 release checklist 执行记录；
4. 全仓 `bash scripts/ci/validate-plugins.sh` + 双平台全量真实会话回归；
5. 编写迁移复盘（收益/负迁移/未迁移清单及理由）。

**验收**：15 插件全部发布态；源仓库无"已迁移但仍活跃"的 hooks（复扫证明）；M5 ✅。

---

## 6. 单插件迁移清单（每个插件必须走完）

```text
[1] 来源分析
    读取源 Skill 的 hooks/*.ts 及其依赖的 hook-support 模块，列出：
    事件面、matcher、平台、fail-open/fail-closed、状态依赖、恢复路径。
[2] 事件面映射
    规范化事件名 → hooks/claude.json + hooks/codex.json（平台字段分开写，
    matcher 语法各自校验；timeout 按源值 + 余量）。
[3] 脚本移植
    scripts/ 下按 P4 分层；共享逻辑从 shared/ vendor（sync-shared-lib.mjs）；
    禁止跨插件引用；禁止依赖 cwd。
[4] 测试
    tests/*.test.mjs：正常放行 / 拒绝(含 blockingContract) / 注入 / 报告 /
    超时与错误路径；使用 tests/fixtures 公共事件样本。
[5] 文档
    README.md（安装、行为、配置、逃生）、DESIGN.md（如引入配置）、
    CHANGELOG.md（首个版本条目）。
[6] 登记与版本
    两个 marketplace.json 登记；双 manifest 版本一致（0.1.0 起步）。
[7] 门禁
    bash scripts/ci/validate-plugins.sh（JSON/语法/版本/登记/Claude 严格校验/
    Codex 加载/测试/drift/schema/安全基线）。
[8] 真实会话验收
    Claude Code 与 Codex 各开新会话：安装→信任→触发→退出码→持久化位置→
    记录到 acceptance-matrix.md。
[9] 发布
    commit + tag（<plugin>-v<version>）+ push + MR + master pipeline 跟踪；
    更新 README 插件清单。
[10] 源侧退役（仅 Phase 4 全面开启；中途单项迁移也可提前按 issue 登记）
    harness-starter 侧删除/标记对应 hooks，附引用复扫与 issue URL。
```

---

## 7. 风险与开放决策

| # | 风险/决策 | 说明 | 建议 |
| --- | --- | --- | --- |
| R1 | 插件粒度 | 语言族合并 vs 每语言一个插件 | 按 §3.2 语言族合并；若某语言 hook 数超过 30 再拆分。合入前用本计划评审 |
| R2 | 多 hook 进程开销 | 同事件多插件并发执行，Edit/Write 可能触发 3–5 个插件进程 | 语言守卫收敛为单插件 dispatcher；CI 基准记录单事件平均耗时，超阈值优化 |
| R3 | 双平台事件差异 | Codex 事件名/matcher/输出格式与 Claude 不同（如 Codex 无 MultiEdit；输出走 JSON） | hook-io.mjs 统一规范化层；契约文档维护映射表；schema 按平台分别校验 |
| R4 | vendor 漂移 | shared/ 与插件内副本不一致 | sync-shared-lib.mjs --check 入 CI，禁止手工改插件内 vendored 文件 |
| R5 | 与 process-confidence 重叠 | P13/P14 与 process-confidence 共享 Stop/PostToolUse 事件与证据目录 | 定义事件执行顺序（priority 前缀日志）；证据写入统一目录，receipt schema 共用 |
| R6 | 源侧双写漂移 | 迁移后源仓库 hooks 仍在活跃安装 | Phase 4 强制源侧退役 + 复扫；迁移完成即登记 issue，不等 Phase 4 |
| R7 | file-line-budget-guard 未提交工作区 | 当前 0.2.0 改动未合入 | Phase 0 第一优先级收口，防止与共享基建冲突 |
| R8 | 配置面扩张 | 每插件引入配置文件后生态碎片化 | 配置遵循 DESIGN.md 模式（项目根文件发现 + 内置 fallback），仓库级只提供 schema 校验 |
| R9 | 验收成本 | 每插件双平台真实会话验收耗时 | 验收矩阵分批执行；同一批插件复用一次会话做多事件触发 |

---

## 8. 附录：源 hooks 分布统计（2026-08-05 快照）

按关注域聚合（`skills/*/src/hooks/*.ts` 文件数）：

| 域 | 数量 | 代表 hooks |
| --- | --- | --- |
| completion-gates | 32 | content-credibility-completion-gate、pptx-completion-gate、spec-workflow-artifact-gate、tdd-sequence-completion-gate、delivery-closure-gate … |
| execution-discipline | 32 | edit-loop-detector、error-retry-guard、remote-polling-budget-guard、language-drift-*、task-ledger-*、verification-provenance-gate … |
| misc-lang | 24 | ruby/dotnet/dart/elixir/nix/rlang/solidity/cpp/deno/windows/javascript/angular 的 syntax/encoding/lockfile/env |
| php | 21 | php-syntax、php-encoding-guard、php-dependency-lockfile-guard、php-debt-guard、php-lint-phpstan(-stop)、php-protected-paths、laravel/thinkphp/webman/symfony env+guard |
| web-frontend | 18 | vue-sfc-edit-primer、vue-syntax、frontend-syntax-wxml/wxss/taro-dom、frontend-encoding-guard、stylelint-coverage-primer … |
| infra-devops | 17 | devops-syntax-{yaml,dockerfile,bash,zsh}、devops-lint-{actionlint,kubeconform,terraform-fmt}、devops-production-kubectl-guard、pve-destructive-operation-guard … |
| command-safety | 14 | cat-write-guard、sed-inplace-guard、dangerous-command-guard、deny-escalation-guard、security-secret-{leak,read}-guard、log-pii-guard、db-dangerous-sql-guard … |
| git-delivery | 13 | git-{add,branch-naming,commit-*,destructive,partial-staging}-guard、merge-conflict-guard、svn-* |
| typescript | 9 | typescript-syntax、any-type-guard、suppression-guard、typescript-lint-eslint、nestjs-env-detector |
| go | 7 | go-syntax、go-encoding-guard、go-debt-guard、go-lint-coverage-primer、go-tool-output-primer |
| jvm | 7 | java/kotlin syntax、jvm-encoding-guard、jvm-debt-guard、jvm-dependency-lockfile-guard |
| python | 7 | python-syntax、python-lint-ruff、python-debt-guard、python-dependency-lockfile-guard |
| rust | 6 | rust-syntax?、rust-encoding-guard、rust-debt-guard、rust-dependency-lockfile-guard、tauri-env-detector |
| mobile | 8 | ios-*, android-env-detector、flutter-env-detector、react-native-* |
| context-rules | 2+ | harness-overview-injector、subagent-principles-injector、project-instructions-* |
| 合计 | ~220 | 另有编码/债务/锁文件等跨语言重复实现，迁移时按 P2 收敛 |

---

## 9. 下一步

1. 评审本计划（插件粒度、阶段顺序、P14/P15 范围）；
2. 开工 Phase 0 任务 1：收口 `file-line-budget-guard` 0.2.0（最优先，防与基建冲突）；
3. Phase 0 任务 3–6 建立共享基建（M0/M1）；
4. Phase 1 批次 1a 以 `php-runtime-guards` 作为 check-runner 模式的样板插件。
