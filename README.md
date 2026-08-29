# harness-start

Marketplace ID：`harness-start` · 显示名称：**Harness Start**

Harness Start 是同时面向 Claude Code 与 Codex 的双平台插件 marketplace。

> [!WARNING]
> 本仓库仍在持续开发，具体实现与行为可能随时变化。

**公开安装源：** [https://github.com/harness-start/plugins](https://github.com/harness-start/plugins)

两个宿主共享插件业务脚本。由于字段名、环境变量和生命周期事件不同，marketplace 索引、插件 manifest 与 Hook 配置按平台分别维护。

## 一键安装

以下命令会添加或更新 marketplace，并为 `PATH` 中可用的 Claude Code 与 Codex CLI 安装或更新全部插件：

```bash
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash
```

常用变体：

```bash
# 只安装 Claude Code 插件
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash -s -- --claude-only

# 只安装 Codex 插件
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash -s -- --codex-only

# 缺少某个宿主 CLI 时跳过，不让安装失败
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash -s -- --skip-missing-hosts

# 选择默认回复语言，默认仍为简体中文
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash -s -- --language en-US

```

即使在本地 clone 中运行 `bash scripts/install-all.sh`，安装器默认仍会使用公开 GitHub Marketplace。要加载当前工作区尚未发布的修改，请使用下方的[本地开发命令](#本地开发)。

要求：`bash`、可访问 GitHub 的网络，以及 Claude Code CLI 和/或 Codex CLI。建议安装 `jq`。

安装后：

- **Claude Code：** 启动新会话，或在提示时执行 `/reload-plugins`，使 Hook 生效。
- **Codex：** 通过 `/hooks` 审查并信任插件 Hook。安装成功不表示 Hook 已受信任或正在运行。
- **Skill / Hook：** 每个已发布插件自带所需 Skill、脚本和 Hook。安装器不再下载或 `npx skills add` 社区 Skill。

`--language <code>` 接受 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR` 或 `th-TH`。传入后，安装器会将语言代码写入每个已安装宿主自己的配置目录。不传时，安装器按 `LC_ALL`、`LC_MESSAGES`、`LANG` 的顺序读取系统 locale，并映射到支持的语言；无法映射或系统使用 `C`/`POSIX` locale 时使用 `en-US`。项目的 `.language-output.mjs` 优先于用户级安装偏好。

### 手动安装

以下命令与安装脚本的 marketplace 操作等价：

```bash
# Claude Code
claude plugin marketplace add harness-start/plugins
# 已添加时更新 marketplace
claude plugin marketplace update harness-start
# 每个插件执行一次，也可直接使用 install-all.sh
claude plugin install <name>@harness-start

# Codex
codex plugin marketplace add harness-start/plugins --ref master
# 已添加时升级 marketplace
codex plugin marketplace upgrade harness-start
codex plugin add <name>@harness-start --json
```

## 完整卸载

以下命令会为当前可用的 Claude Code 与 Codex CLI 卸载 `harness-start` 下的全部插件，移除 marketplace，并删除安装器写入的宿主级语言偏好文件：

```bash
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/uninstall-all.sh | bash
```

常用变体：

```bash
# 只卸载 Claude Code 插件
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/uninstall-all.sh | bash -s -- --claude-only

# 只卸载 Codex 插件
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/uninstall-all.sh | bash -s -- --codex-only

# 只查看将执行的删除操作
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/uninstall-all.sh | bash -s -- --dry-run
```

要求：`bash`、`jq`，以及至少一个可用的宿主 CLI。缺少的宿主会自动跳过；两个宿主都不可用时脚本失败。Claude Code 插件如果通过 `--scope project` 或 `--scope local` 安装，增加 `--scope project` 或 `--scope local`，并在原项目目录执行。本地 clone 可直接运行 `bash scripts/uninstall-all.sh`。

脚本只删除宿主安装状态和安装器写入的偏好文件，不跨项目搜索或删除项目拥有的 `.language-output.mjs`、`.language-output/` 运行状态或其他项目文件。单个插件仍可使用 `claude plugin uninstall <name>@harness-start --scope user --yes` 或 `codex plugin remove <name>@harness-start --json` 卸载；还有其他 Harness Start 插件时不要移除 marketplace。

## 架构

本仓库由可独立安装的插件组成。Hook 只负责生命周期中可机械验证的触发、门禁、反馈和状态推进；开放式推理、配置、诊断与恢复由 Skill 或普通 agent 工作流承接。插件内脚本保持确定、可测试和自包含。具体边界、取舍与开放问题见[工作架构](docs/architecture.md)。Skill / Hook 协作准则见 [Skill 与 Hook 协作准则](docs/skill-hook-collaboration.md)。

## 仓库结构

```text
.
├── .claude-plugin/marketplace.json    # Claude Code marketplace
├── .agents/plugins/marketplace.json   # Codex marketplace
├── core/src/                          # 构建时内联到插件的共享 TypeScript 逻辑
├── plugins/                           # 自包含插件目录
├── package.json                       # 根级 TypeScript、esbuild、测试与 lint 命令
├── scripts/install-all.sh             # marketplace 与全部插件的一键安装脚本
├── scripts/uninstall-all.sh           # 全部插件、marketplace 与安装器偏好的一键卸载脚本
├── scripts/ci/validate-plugins.sh     # GitHub/GitLab 共用 CI 检查
├── docs/architecture.md               # Working harness architecture
├── .github/workflows/validate-plugins.yml
├── .gitlab-ci.yml
└── GUIDE.md                           # 完整初始化与发布指南
```

默认分支：`master`

每个插件都必须自包含。源码可以通过 `@harness/core/*` 复用根级逻辑，但 esbuild 会把它内联进插件自己的 `dist/`；运行时不得引用自身目录外的文件，因为 Claude Code 会将单个插件目录复制到缓存。仓库不是 npm workspace，也不使用 monorepo 包链接。

本仓库还提交了仅对当前项目生效的 Claude Code 与 Codex `PreToolUse` Hook。它们会拒绝文件工具、补丁或显式 shell 命令直接写入 `plugins/<name>/dist/`；应修改 `src/` 后执行 `npm run build`。执行当前项目的 `git push` 或 `git send-pack` 前，Hook 会运行 `npm run ensure:dist`：产物不一致时自动重建并停止本次推送，待新 `dist/` 提交后重试；产物一致时直接放行。Codex 首次加载项目 Hook 时仍需按宿主提示审查并信任配置。

`GUIDE.md` 中的 `session-hooks`、`policy-checks` 等名称只用于示例。真实插件位于 `plugins/`，并同时登记在两个 marketplace 索引中。

## 插件列表

| 插件 | 说明 |
| --- | --- |
| `session-governance` | 会话意图、推理方法、工程实践、执行纪律与语言输出治理 |
| `activity-audit` | 受保护的会话级命令与文件活动审计 |
| `workspace-integrity` | 命令、源码、生成文件、依赖锁与工作区完整性保护；不公开语言百科 Skill，不自动运行语言 lint/format |
| `engineering-workflow` | 与语言无关的调试、规格驱动、测试驱动和实现方法 |
| `delivery-governance` | Git、CI、仓库历史迁移与 Kubernetes 交付治理 |
| `knowledge-work` | 证据研究、专业写作和工作报告 |
| `interface-design` | 跨框架界面设计、视觉批判与机械质量门禁 |
| `artifact-production` | Logo、图表、海报、演示、印刷、视频、音乐和培训制品生产 |

## 插件分类与设计

Marketplace 固定发布以上 8 个 owner；一键安装始终安装全部插件，没有能力 profile、按角色分支或 FDE/OPC 运行时模式。FDE、OPC 只是同一套能力的使用者。

每个 owner 都是可独立安装、升级和回滚的自包含插件。原有细粒度实现已拆入 owner 的 `src/domains/`，共享同一个 Hook、CLI、测试、验收、Skill、license 和构建边界。每个生命周期事件由 owner 的单一 dispatcher 在进程内调度领域处理器；对外需要确定性工具的 owner 统一提供：

```text
node "${PLUGIN_ROOT}/dist/cli/harness.mjs" <resource> <action> [arguments]
```

各 owner 捆绑自己的 Skill、Hook、Script、领域实现和验收材料，不声明跨 owner 运行时依赖，也不依赖 `skill-deps.json` 或 `vendor-skills/`。

### Subagent 原则

本仓库不提供中央 subagent 编排或生命周期审计插件。领域 Skill 可以在任务适合拆分时，用完整自然语言请求宿主创建普通子 agent；子 agent 的输出只是建议或候选材料，父 agent 必须核对证据、运行验证并承担最终交付责任。模型、思考深度、权限、并发和启停由 Claude Code / Codex 宿主管理，不在跨平台 Hook 中模拟身份、reservation、nonce、mailbox 或审批权。

某些领域 Hook 仍会在 `SubagentStop` 上执行与主 agent 相同的语言或交付物检查。这表示“同一领域规则覆盖子会话”，不表示仓库接管子 agent 的调度或生命周期。

### 通用结构

每个插件必须自包含：Claude Code 会把单插件目录复制到缓存，运行时不得引用自身目录之外的文件。

```text
plugins/<name>/
├── .claude-plugin/plugin.json   # Claude manifest（指向 hooks/claude.json）
├── .codex-plugin/plugin.json    # Codex manifest（版本必须与 Claude 一致）
├── hooks/claude.json            # 双平台 Hook 之一
├── hooks/codex.json             # 双平台 Hook 之一
├── routes/                      # owner dispatcher 与统一 CLI 的内部路由
├── src/                         # owner 入口与 src/domains/ 领域实现
├── dist/                        # 已提交的 owner Node ESM bundle
├── skills/                      # 捆绑编排与业务 Skill
├── acceptance/cases/            # 宿主验收用例（case.toml + prompt.md + expect.sh + workspace/）
└── tests/*.test.ts              # 与源码同名或同职责的离线测试
```

owner 与领域实现的运行时依赖都由 esbuild 打进 owner 的单一 bundle，仅保留 Node.js 内置模块为 external，因此单独复制任一 owner 目录即可安装和运行。领域实现位于 `src/domains/`，不拥有独立 `dist/`、Skill 根、测试根、验收根或宿主注册面，也不能被其他 owner 引用。宿主 manifest、Hook 注册、CLI 和 MCP 暴露统一归 owner。测试 fixture 为模拟消费者环境而创建的 `.claude/` 或 `.codex/` 不属于注册面，不做无差别删除。

两个宿主的字段名、环境变量与生命周期事件不同，因此 marketplace 索引、插件 manifest 与 Hook 配置按平台分别维护，业务脚本在插件目录内共享。Hook 事件覆盖：`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`Stop`、`SubagentStart`、`SubagentStop`、`PreCompact`、`PostCompact`。

### 设计约定

- **Hook IO 协议**：事件 JSON 从 stdin 读入，stdout 输出结构化 Hook 结果（deny / block / `additionalContext`），stderr 输出仅供人读的诊断；解析失败一律 fail-open。阻断走 `exit(2)` 加结构化 `blockingContract`（observedFacts / harm / unblockWhen / recovery）；`PreToolUse` 阻断输出 `permissionDecision: "deny"`。
- **证据**：工作流插件用磁盘回执和 SHA-256 receipt 绑新鲜度；交付前要求回执和 trail 对得上。Hook 被调用、格式对、或多走几轮模型，都不算做完。
- **fail-open / fail-closed**：解析失败和证据缺失就放行；写入安全、trail 完整性和交付新鲜度出问题就拦住。
- **可配置**：多数守卫支持项目级配置（如 `.source-integrity.mjs`、`.language-output.mjs`），解析失败回退内置规则。
- **验证配套**：每个插件至少一个 TypeScript 离线测试与一套 acceptance cases；CI 统一运行 typecheck、ESLint、`check:dist`、单元测试和 `scripts/ci/validate-plugins.sh`，宿主验收通过 `scripts/acceptance`（Docker 内）执行。

## 前置条件

- Git
- Node.js 20.19+
- Claude Code CLI 和/或 Codex CLI，用于安装与宿主检查
- FFmpeg，用于 Logo 预览以及视音频类插件的本地生成与验证
- `jq`，建议安装

## 本地静态检查

GitHub Actions 与 GitLab CI 都运行同一脚本：

```bash
npm ci
npm run build
npm run verify
bash scripts/ci/validate-plugins.sh
```

`npm run build` 会从每个 owner 的 `src/entries/**/*.ts` 构建一份 owner 运行时；每个生成文件都写入 `harness-source-hash`，摘要覆盖该 owner 的全部 `src/**/*.ts` 与共享 `core/src/**/*.ts`。提交前必须把这些产物一并提交。`npm run ensure:dist` 以内存重建并只刷新不一致的 owner；`npm run check:dist` 做同样的逐字节检查但不会改写工作区。验证脚本还会校验 JSON、bundle 语法、双平台 manifest 版本、离线单元测试、双宿主 acceptance case 结构、惰性日志诚实性和 Claude/Codex marketplace 加载。

宿主已安装时运行：

```bash
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
```

## 本地开发

请从仓库根目录运行以下命令。它们加载当前工作区，而不是公开 GitHub Marketplace。

Claude Code 可直接加载插件目录，无需安装；同一会话中的后续修改可通过 `/reload-plugins` 生效：

```bash
claude --plugin-dir "$PWD/plugins/<plugin-name>"
```

Codex 需要把仓库本身注册为本地 Marketplace。不要传 `--ref`，该选项只适用于 Git Marketplace 来源：

```bash
codex plugin marketplace add "$PWD" --json
codex plugin list --marketplace harness-start --available --json
codex plugin add <plugin-name>@harness-start --json
```

如果已从 GitHub 注册过 `harness-start`，请先删除原 Marketplace 条目再添加本地来源；Marketplace 名称不能重复。

## 添加插件

操作步骤见 `GUIDE.md` 第 16 节。新插件必须同时登记在：

- `.claude-plugin/marketplace.json`
- `.agents/plugins/marketplace.json`

每个插件必须自带全部所需 Skill、脚本和双平台 Hook。禁止新增 `skill-deps.json` 或 `vendor-skills/`。

## 相关文档

- [工作架构](docs/architecture.md)
- [Skill 与 Hook 协作准则](docs/skill-hook-collaboration.md)
- [仓库初始化与插件开发指南](GUIDE.md)
- [双宿主验收](docs/host-acceptance.md)
- [验收矩阵](docs/acceptance-matrix.md)
- [Artifact 交付守卫](docs/artifact-delivery-guards.md)
- [Claude Code 插件 Marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- [Codex 插件打包](https://developers.openai.com/plugins/build/plugins#build-your-own-curated-plugin-list)
- [Codex Hook](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks)

## 宿主验收：Claude Code、Codex 与 DeepSeek

实时验收只能在 Docker 中运行，镜像位于 `docker/host-acceptance`。从宿主执行 `./scripts/acceptance/run.sh` 时，smoke 和 live case 都会构建并运行该镜像，覆盖 Claude 与 Codex；单元测试和 honesty gate 仍可直接在宿主运行。每个 live case 只启用当前插件；不再安装社区 Skill。

验收要求 `.env` 包含 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL=deepseek-v4-flash`：

```bash
./scripts/acceptance/run.sh --smoke                         # DeepSeek smoke，Docker
./scripts/acceptance/run.sh                                 # 全部插件 × Claude/Codex，Docker
./scripts/acceptance/run.sh --plugin command-safety  # 单个插件，Docker
./scripts/acceptance/run.sh --honesty-only                  # 只运行惰性预期门禁，不启动 Docker
bash scripts/acceptance/test-skill-deps-install.sh          # 确认仓库无 skill-deps/vendor-skills

# 项目级场景：install-all 装全量插件，再跑开放 brief
./scripts/acceptance/run-project.sh --honesty-only
./scripts/acceptance/run-project.sh --case logo-design/01-goal-e2e-delivery --host claude
```

项目级用例见 `acceptance/scenarios/`；宿主验收说明见 [host-acceptance](docs/host-acceptance.md)。
