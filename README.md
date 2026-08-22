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
| `evidence-based-research` | 保存网页或本地资料为可引用片段，要求每条结论绑定来源；证据封存后才允许交付 |
| `execution-discipline` | 在 agent 浪费整个会话前识别重复编辑、盲目重试命令和过度远端轮询 |
| `source-integrity` | 写入前阻断备份产物与明显 replacement character，写入后校验严格 UTF-8 与 BOM |
| `git-delivery` | 保护本地 Git 命令、原子提交、仓库状态和未解决合并冲突标记 |
| `engineering-quality` | 执行跨技术栈共享的文件行数预算与 Markdown 结构检查；语言和生态检查由领域插件负责 |
| `test-driven-development` | 先记录测试文件变化，再按 FQCN、module/package 身份或完整目录镜像允许 PHP、Python、JS、TS、Rust、Go 实现写入；已有对应测试时必须先改那些文件 |
| `command-safety` | 拒绝宽范围递归删除、无备份 `sed` 原地编辑和写入非临时路径的 `cat` heredoc 等高风险命令 |
| `android-engineering` | 编排 Android 工程方法，保护 Gradle lock/cache，并校验 Manifest、资源 XML 与关键 JSON |
| `go-engineering` | 编排 Go 工程方法，保护 `go.sum`，并对修改后的 Go 源码运行有界 `gofmt` 检查 |
| `ios-engineering` | 编排 iOS、SwiftUI、并发与测试方法，保护 SwiftPM/CocoaPods 状态并校验 Swift 与 plist |
| `java-engineering` | 编排 JVM、Spring Boot、JUnit 与 Jakarta 迁移，保护 Gradle 状态并校验 Maven XML |
| `kubernetes-operations` | 编排 Kubernetes/Helm 运维，保护 Helm 依赖产物并执行有界 dry-run、lint 与 JSON 校验 |
| `nix-engineering` | 编排 Nix 工程，保护 `flake.lock` 并执行有界 Nix 解析与 JSON 校验 |
| `php-engineering` | 编排 PHP 工程，保护 Composer lock/vendor 并执行 PHP 语法与 Composer 声明校验 |
| `python-engineering` | 编排 Python 工程，保护包管理器 lock/环境并执行语法、Ruff 与 JSON 校验 |
| `react-native-engineering` | 独立编排 bare React Native、导航与升级，保护 Codegen 产物并校验 Metro/TS/JSON |
| `rust-engineering` | 编排 Rust 工程，保护 `Cargo.lock` 并对修改后的 Rust 源码运行有界 `rustfmt` 检查 |
| `web-frontend-engineering` | 编排 React、Vue、Angular 与 TypeScript，保护 JS lock/node_modules 并执行语法、ESLint、JSON 校验 |
| `language-output` | 让主 agent 与 subagent 的散文遵循同一可配置会话语言；安装时跟随系统 locale，未配置时严格默认简体中文 |
| `intent-discovery` | 首个 prompt 自动前置探索项目事实、候选解释和反例；遇到实质新任务可由原生 Skill 路由复用，继续与纠正不重复探索 |
| `engineering-practice` | 提供第一方实现判断、只读代码审查与完成前验证方法；具体故障调试归 `software-debugging` |
| `professional-writing` | Orchestrates actionable responses and language-aware writing Skills, then reports deterministic AI-style signals after observed Markdown writes |
| `reasoning-methods` | 提供聚焦的第一性原理与自适应推理 Skill；按任务选择验证结构，不创建账本或把思考过程变成写入门禁 |
| `interface-craft` | 提供视觉方向、项目设计记忆、设计系统连续性、动效、严格渲染批判与 Web 风格 UI 文件机械检查 |
| `software-debugging` | 作为具体软件故障的唯一工作流，通过聚焦 Skill 和插件 CLI 创建 Debug Work Order，为多个缺陷分别归属证据，并用 Hook 门禁不安全修复循环 |
| `agent-activity-audit` | 将文件读写与 shell 命令统一记录到 `.agent-activity-audit/sessions/<session>.jsonl`，记录以 `kind` 区分 |
| `brand-logo-production` | 校验 Logo 工程的向量 owner、标准制图、几何/Fibonacci 映射、变体闭包和 release receipt |
| `poster-production` | 用统一编排 Skill、固定设计顾问、Satori/resvg writer、独立审查和 digest evidence 交付数字海报 |
| `presentation-production` | 校验 PptxGenJS 工程的页序、单页 owner、source-hash 预览、交付闭包和 release receipt |
| `diagram-production` | 从语义 JSON 或有限 Mermaid/draw.io 输入生成 SVG、PNG、自包含 HTML 与可选 draw.io，并用 probe、独立审查和摘要回执闭合交付 |
| `print-publication-production` | 校验静态印刷出版工程的章节、Paged Media CSS、四种 PDF role、preflight evidence 和 receipt |
| `video-production` | 校验 Remotion 工程的视音频帧区间、MP4/WAV proof、媒体边界和 release evidence |
| `music-production` | 编排 brief、外部中英文顾问、Tone.js 作曲与渲染，并用独立听审、一次性 writer 和 digest receipt 约束发布 |
| `work-reporting` | 从 Claude/Codex 会话生成引导式日报、周报和阶段总结，并用 SHA-256 封印确认正文、仅允许在标签后追加内容 |
| `spec-driven-development` | 编排社区 SDD 方法的当前上游版本，并由 Hook 独立校验当前 spec、plan 与 tasks |
| `ci-gated-delivery` | 编排短生命周期分支、独立审查、远端 CI、合并与合并后验证 |
| `repository-history-migration` | 在源仓只读、提交封存和目标验证约束下迁移 Git 历史 |
| `training-program-design` | 为起点差异明显的受众编排 brief、课程设计、材料生成、质量评审与摘要绑定的发布闭包 |

## 插件分类与设计

38 个插件按职责分为八类。每个插件可独立安装，不声明或读取其他本项目插件；领域插件之间也不存在依赖。每个插件捆绑自己的 Skill、脚本和 Hook，不依赖 `skill-deps.json` 或 `vendor-skills/`。

| 类别 | 插件 | 核心机制 |
| --- | --- | --- |
| 工程执行与安全 | `execution-discipline`、`source-integrity`、`git-delivery`、`engineering-quality`、`test-driven-development`、`command-safety` | 对命令、写入、测试顺序与跨技术栈共享质量实施可机械验证的硬门禁 |
| 工程领域 | `android-engineering`、`go-engineering`、`ios-engineering`、`java-engineering`、`kubernetes-operations`、`nix-engineering`、`php-engineering`、`python-engineering`、`react-native-engineering`、`rust-engineering`、`web-frontend-engineering` | 每个领域以自建编排 Skill、捆绑业务 Skill 与本地 Hooks 组成，独立拥有语言/生态检查和依赖产物保护 |
| 方法编排 | `intent-discovery`、`engineering-practice`、`professional-writing`、`reasoning-methods`、`software-debugging`、`spec-driven-development`、`interface-craft` | 内部 Skill 组织步骤；`professional-writing` 另在可观察 Markdown 写入后运行有界确定性扫描 |
| 证据与审计 | `evidence-based-research`、`agent-activity-audit`、`work-reporting` | 捕获可验证来源、统一记录活动或生成有证据约束的工作报告 |
| 领域生产 | `brand-logo-production`、`diagram-production`、`poster-production`、`presentation-production`、`print-publication-production`、`video-production`、`music-production` | 领域 SOP、受控 writer、独立审查与摘要绑定的发布闭包 |
| 项目与交付治理 | `ci-gated-delivery`、`repository-history-migration` | 管理远端交付状态机和跨仓历史迁移 |
| 输出治理 | `language-output` | 用平台独立 Hook 维持会话语言，不依赖其他插件 |
| 培训赋能 | `training-program-design` | 用混合水平受众方法、同源材料、只读评审与阶段门禁闭合培训设计和改编 |

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
├── src/                         # TypeScript 源码；entries/hooks|cli|mcp 为多入口
├── dist/                        # 已提交的 Node ESM bundle；插件安装后直接运行
├── skills/                      # 捆绑编排与业务 Skill
├── acceptance/cases/            # 宿主验收用例（case.toml + prompt.md + expect.sh + workspace/）
└── tests/*.test.ts              # 与源码同名或同职责的离线测试
```

纯内容插件可以没有 `src/` 和 `dist/`。代码插件的运行时依赖由 esbuild 打进各自 bundle，仅保留 Node.js 内置模块为 external，因此单独复制任一插件目录即可安装和运行。

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

`npm run build` 会从每个 `src/entries/**/*.ts` 生成对应的 `dist/**/*.mjs`；每个生成文件都写入 `harness-source-hash`，摘要覆盖插件自身 `src/**/*.ts` 与共享 `core/src/**/*.ts` 的相对路径和文件字节。提交前必须把这些产物一并提交。`npm run ensure:dist` 以内存重建并只刷新不一致的插件；`npm run check:dist` 做同样的逐字节检查但不会改写工作区。验证脚本还会校验 JSON、bundle 语法、双平台 manifest 版本、离线单元测试、双宿主 acceptance case 结构、惰性日志诚实性和 Claude/Codex marketplace 加载。

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
