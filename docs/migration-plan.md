# ai-experts → harness-start/plugins 迁移设计

> 状态：实现收口中 · 2026-08-06
>
> 源快照：`infra/ai-experts@00d2945da025a13545ef086436617da1cb399ef9`
>
> 目标：把可观察、适合 hook 事件驱动的能力改写为 Claude Code 与 Codex 可直接加载的自包含插件。

## 1. 当前架构

目标仓库没有安装、编译、打包或发布目录生成阶段。宿主从插件 manifest 读取平台专属 hook 配置，直接执行已提交的 Node.js `.mjs` 文件：

```text
marketplace
  → plugins/<name>/.claude-plugin/plugin.json
    → hooks/claude.json
      → node "${CLAUDE_PLUGIN_ROOT}/scripts/<entry>.mjs"

marketplace
  → plugins/<name>/.codex-plugin/plugin.json
    → hooks/codex.json
      → node "${PLUGIN_ROOT}/scripts/<entry>.mjs"
```

每个插件只携带独立运行所需内容：

```text
plugins/<name>/
├── .claude-plugin/plugin.json
├── .codex-plugin/plugin.json
├── hooks/claude.json
├── hooks/codex.json
├── scripts/
│   ├── <lifecycle-entry>.mjs
│   ├── checks/*.mjs
│   └── lib/*.mjs              # 仅保留本插件实际引用的函数
├── tests/*.test.mjs
├── acceptance/cases/*
└── README.md / CHANGELOG.md
```

只有插件确实持久化结构化数据时才保留 `schemas/`。没有实际消费者的抽象层、公共 fixture、同步脚本或生成目录不作为迁移交付物。

## 2. 迁移边界

迁移的是行为，不是源仓库的包结构或依赖闭包。

保留：

- 双平台 manifest 与平台专属 hook 配置；
- 按生命周期合并的少量入口脚本；
- 与目标不变量直接相关的检查、状态和解析逻辑；
- 离线单测、双宿主验收用例和必要文档；
- 可机械核验的源 hook ID → 目标插件映射。

禁止：

- `vendor/`、`node_modules/`、`dist/`、`build/`、`generated/`；
- package manager lockfile；
- 把源 `.ts/.tsx` 改后缀后直接提交；
- `@harness/*` 或其他只有源 monorepo 才能解析的 import；
- 为迁移新增 install、compile、bundle、sync 或 codegen 阶段；
- 跨插件运行时相对引用。

源实现依赖较重时，先提取判定语义，再在目标插件内实现最小纯 JavaScript 子集。目标代码按实际 import 使用关系裁剪，不复制整套支持库。

## 3. 重组规则

### 3.1 按事件生命周期合并

同一插件、同一事件只注册少量 dispatcher。多个源 hook 在 `PreToolUse`、`PostToolUse`、`SessionStart`、`UserPromptSubmit` 或 `Stop` 入口内按顺序执行，不为每个源 hook 启动一个进程。

### 3.2 一个不变量只有一个目标拥有者

源侧重复的 encoding、lockfile、syntax、debt、environment detector 等模式，在对应目标插件中收敛为一份实现。横切能力按 command safety、git delivery、execution discipline、delivery evidence、context rules 分组。

### 3.3 双平台机制分开

Claude Code 与 Codex 的 manifest、根目录变量、事件名和输出结构分别维护。共享的是检查语义，不混用平台入口或环境变量。

Codex 的 `PostToolUse` 发现问题时使用该宿主定义的退出码 `2` + `stderr` 反馈：操作已经完成，不会回滚；Codex 用检查结果替换原工具结果并继续修正。Claude Code 仍使用 `additionalContext`。这一差异只存在于输出适配层。

### 3.4 不增加隐式工具链

lint 或语言工具只在项目本地或 `PATH` 中已经存在时调用；缺失时跳过或报告。hook 不执行安装，也不生成依赖目录。

## 4. 覆盖范围

固定源清单包含 202 个 hook ID。机器可读映射见 [migration-parity.json](migration-parity.json)：

- 200 个标记为 `target-native`，由目标插件的合并入口和检查逻辑承载；
- 2 个标记为 `excluded-by-plan`：
  - `php-laravel-env-detector`
  - `php-webman-env-detector`

这两个仅做框架环境提示；目标已有 Laravel/Webman 路径守卫，当前计划明确不迁框架专属 env detector。任何新增排除项都必须更新固定清单、理由和摘要校验。

目标 Marketplace 当前登记 21 个自包含插件，其中既包含迁移目标，也包含原有的 `process-confidence` 和 `file-line-budget-guard` 等基础插件。迁移映射按源 hook 实际归属记录，不用复制源目录来证明完整性。

## 5. 基础能力的实际落点

| 原计划诉求 | 当前落点 |
| --- | --- |
| 公共运行库 | 每插件 `scripts/lib/` 只保留自身实际引用的最小函数；无仓库级运行时依赖 |
| 同步公共副本 | 不需要；CI 直接拒绝 vendor、生成目录和源码依赖 |
| 公共测试 helper | 不作为前置；每插件用 `node:test` 和少量本地 subprocess helper 验证真实入口 |
| Hook 契约 | 双平台 hook JSON、入口测试、blocking contract 断言和真实宿主验收共同约束 |
| Schema | 仅为实际持久化数据保留，例如 `process-confidence` 的 run/receipt |
| CI | `scripts/ci/validate-plugins.sh` 统一执行 JSON、语法、单测、验收诚实性、版本、Marketplace 和双宿主加载检查 |
| 迁移完整性 | `scripts/ci/validate-migration-parity.mjs` 校验 202 个 ID、固定排除项和精简运行策略 |

因此不再实施旧的 `shared/`、`sync-shared-lib.mjs`、根 `package.json` 或构建期复制方案。

## 6. 验证与完成标准

日常离线验证：

```bash
AI_EXPERTS_SESSION_ID='<session>' \
AI_EXPERTS_TRIGGER_FROM='goal' \
SKIP_HOST_INSTALL=1 \
bash scripts/ci/validate-plugins.sh
```

完整双宿主验收必须在仓库规定的 Docker 环境运行：

```bash
./scripts/acceptance/run.sh
```

迁移完成需要同时满足：

1. `docs/migration-parity.json` 保持 202 个唯一源 hook ID，摘要不漂移；
2. 每个目标插件具有双 manifest、平台 hook 配置、可执行 `.mjs` 入口、离线测试和双宿主验收用例；
3. 所有注册入口存在并通过 `node --check`，每插件 `node --test` 全绿；
4. 仓库不存在禁止的依赖目录、构建产物、lockfile、源 TypeScript 或 `@harness/*` import；
5. Claude Code 与 Codex 的 Marketplace 加载、真实会话触发和验收断言通过；
6. MR pipeline 通过，合并后主分支再次验证。

## 7. 风险与控制

| 风险 | 控制 |
| --- | --- |
| 合并实现只登记 ID、没有真实语义 | 单测覆盖正例/反例与入口输出；双宿主验收命中实际事件 |
| 为追求复用重新引入构建阶段 | CI 禁止 vendor、生成目录、lockfile 与源码依赖；设计明确 direct-node-mjs |
| 插件内样板膨胀 | 按 import/export 审计未使用函数；只保留实际入口依赖 |
| Claude/Codex 配置串用 | 双 manifest 与 hook 配置分别校验，入口命令使用各自根变量 |
| 可选 lint 工具导致隐式安装 | 只使用已经存在的本地或 `PATH` 工具，缺失不安装 |
| P13/P14 与 process-confidence 状态重叠 | 只通过稳定 receipt/schema 或插件数据目录协作，不读取脆弱相对路径 |

## 8. 收口顺序

1. 审计 202 个源 hook 的目标语义与反例，不以文件数量判断完成度；
2. 补齐真正缺失的检查或测试，不新增形式化占位文件；
3. 跑全量离线 CI 与 Docker 双宿主验收；
4. 检查 MR pipeline，合并后复验；
5. 源仓库的退役或删除另走独立授权与 MR，不在本仓迁移中隐式执行。
