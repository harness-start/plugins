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

# 跳过社区 Skill 依赖，适用于离线或没有 npx 的环境
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash -s -- --skip-skill-deps
```

即使在本地 clone 中运行 `bash scripts/install-all.sh`，安装器默认仍会使用公开 GitHub Marketplace。要加载当前工作区尚未发布的修改，请使用下方的[本地开发命令](#本地开发)。

要求：`bash`、可访问 GitHub 的网络，以及 Claude Code CLI 和/或 Codex CLI。建议安装 `jq`。社区 Skill 依赖还需要 Node.js 与 `npx`。

安装后：

- **Claude Code：** 启动新会话，或在提示时执行 `/reload-plugins`，使 Hook 生效。
- **Codex：** 通过 `/hooks` 审查并信任插件 Hook。安装成功不表示 Hook 已受信任或正在运行。
- **社区 Skill：** 插件可声明 `skill-deps.json`；`install-all.sh` 会把这些依赖安装或更新到全局 Skill scope，即执行 `npx skills add … --global`。

`--language <profile>` 接受 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR` 或 `th-TH`。传入后，安装器会将 profile 写入每个已安装宿主自己的配置目录。不传时，安装器按 `LC_ALL`、`LC_MESSAGES`、`LANG` 的顺序读取系统 locale，并映射到支持的 profile；无法映射或系统使用 `C`/`POSIX` locale 时使用 `en-US`。项目的 `.language-output-governance.mjs` 优先于用户级安装偏好。

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

## 架构

本仓库由可独立安装的插件组成。Hook 只负责生命周期中可机械验证的触发、门禁、反馈和状态推进；开放式推理、配置、诊断与恢复由 Skill 或普通 agent 工作流承接。插件内脚本保持确定、可测试和自包含。具体边界、取舍与开放问题见[工作架构](docs/architecture.md)。

## 仓库结构

```text
.
├── .claude-plugin/marketplace.json    # Claude Code marketplace
├── .agents/plugins/marketplace.json   # Codex marketplace
├── core/src/                          # 构建时内联到插件的共享 TypeScript 逻辑
├── plugins/                           # 自包含插件目录
├── package.json                       # 根级 TypeScript、esbuild、测试与 lint 命令
├── scripts/install-all.sh             # marketplace 与全部插件的一键安装脚本
├── scripts/ci/validate-plugins.sh     # GitHub/GitLab 共用 CI 检查
├── docs/architecture.md               # Working harness architecture
├── .github/workflows/validate-plugins.yml
├── .gitlab-ci.yml
└── GUIDE.md                           # 完整初始化与发布指南
```

默认分支：`master`

每个插件都必须自包含。源码可以通过 `@harness/core/*` 复用根级逻辑，但 esbuild 会把它内联进插件自己的 `dist/`；运行时不得引用自身目录外的文件，因为 Claude Code 会将单个插件目录复制到缓存。仓库不是 npm workspace，也不使用 monorepo 包链接。

本仓库还提交了仅对当前项目生效的 Claude Code 与 Codex `PreToolUse` Hook。它们会拒绝文件工具、补丁或显式 shell 命令直接写入 `plugins/<name>/dist/`；应修改 `src/` 后执行 `npm run build`。Codex 首次加载项目 Hook 时仍需按宿主提示审查并信任配置。

`GUIDE.md` 中的 `session-hooks`、`policy-checks` 等名称只用于示例。真实插件位于 `plugins/`，并同时登记在两个 marketplace 索引中。

## 插件列表

| 插件 | 说明 |
| --- | --- |
| `research-provenance-guard` | 保存网页或本地资料为可引用片段，要求每条结论绑定来源；证据封存后才允许交付 |
| `execution-loop-guard` | 在 agent 浪费整个会话前识别重复编辑、盲目重试命令和过度远端轮询 |
| `source-sanity-guard` | 阻断源码目录中的备份产物和明显的 replacement character 解码损坏 |
| `git-delivery-guards` | 保护本地 Git 命令、原子提交、仓库状态和未解决合并冲突标记 |
| `code-quality-guard` | 写入后执行有界的 JS/TS、Python 和 PHP 语法、lint 与静态分析检查 |
| `tdd-guard` | 先记录测试文件变化，再按 FQCN、module/package 身份或完整目录镜像允许 PHP、Python、JS、TS、Rust、Go 实现写入；已有对应测试时必须先改那些文件 |
| `encoding-guard` | AI 写入后阻断带 BOM 或不符合严格 UTF-8 的文本文件 |
| `markdown-format-guard` | 写入后检查 Markdown 标题结构和常见格式规则 |
| `file-line-budget-guard` | 在 Edit/Write 后按语言实施棘轮式文件行数预算 |
| `protected-file-guard` | 阻断文件工具直接修改依赖 lockfile 和包管理器拥有的第三方依赖目录 |
| `command-safety-guards` | 拒绝宽范围递归删除、无备份 `sed` 原地编辑和写入非临时路径的 `cat` heredoc 等高风险命令 |
| `language-output-governance` | 让主 agent 与 subagent 的散文遵循同一可配置会话语言；安装时跟随系统 locale，未配置时严格默认简体中文 |
| `intent-clarify-gate` | 首个 prompt 自动前置探索项目事实、候选解释和反例；按复杂度并发只读 subagent，汇总后直接继续 |
| `reasoning-discipline` | 提供聚焦的第一性原理与自适应推理 Skill；按任务选择验证结构，不创建账本或把思考过程变成写入门禁 |
| `debugging-workflow-guard` | 通过聚焦 Skill 创建 Debug Work Order，为多个缺陷分别归属证据，并用 Hook 门禁不安全修复循环 |
| `file-access-audit` | 将结构化 agent 文件读写记录到项目本地 `.file-access-audit/sessions/<session>.jsonl` |
| `command-exec-audit` | 将 agent shell 命令、状态和耗时记录到项目本地 `.command-exec-audit/sessions/<session>.jsonl` |
| `logo-project-delivery-guard` | 校验 Logo 工程的向量 owner、标准制图、几何/Fibonacci 映射、变体闭包和 release receipt |
| `poster-project-delivery-guard` | 校验 React/Satori 海报工程的 layer 顺序、role、成对 SVG/PNG proof 和 release freshness |
| `pptx-project-delivery-guard` | 校验 PptxGenJS 工程的页序、单页 owner、source-hash 预览、交付闭包和 release receipt |
| `print-publication-delivery-guard` | 校验静态印刷出版工程的章节、Paged Media CSS、四种 PDF role、preflight evidence 和 receipt |
| `video-project-delivery-guard` | 校验 Remotion 工程的视音频帧区间、MP4/WAV proof、媒体边界和 release evidence |
| `tonejs-music-production` | 用确定性数学模型生成并优化 Tone.js 乐谱，离线渲染 WAV，并绑定听审、音频指标与 release receipt |
| `work-report-insights` | 从 Claude/Codex 会话生成引导式日报、周报和阶段总结，并用 SHA-256 封印确认正文、仅允许在标签后追加内容 |

## 插件分类与设计

25 个插件按实现机制分为六类。分类依据是各插件内的 Hook 配置、校验脚本与 Skill 资产，具体机制见每个插件的 `README.md`。

| 类别 | 插件 | 核心机制 |
| --- | --- | --- |
| 纯 Hook 校验器 | `encoding-guard`、`markdown-format-guard`、`file-line-budget-guard`、`protected-file-guard`、`source-sanity-guard`、`git-delivery-guards`、`code-quality-guard`、`tdd-guard`、`command-safety-guards`、`execution-loop-guard` | 在 `PreToolUse` / `PostToolUse` / `Stop` 拦截文件写入与 shell 命令，静态校验后放行或 `exit(2)` 阻断 |
| 纯 Skill 方法 | `reasoning-discipline` | 根据问题选用第一性原理、精确、因果、决策或事实核验结构；用反例和外部证据提高结论质量，不持久化私有思考过程 |
| Hook + Skill 工作流 | `intent-clarify-gate`、`debugging-workflow-guard`、`research-provenance-guard` | 首轮方法注入，或显式工作流的磁盘状态机与证据链；开放式判断留给 Skill，机械生命周期留给 Hook |
| 审计 / 日志 | `file-access-audit`、`command-exec-audit` | 向项目本地 append-only JSONL 记录活动，Hook 同时保护 trail 不被改写 |
| 项目交付守卫 | `logo-project-delivery-guard`、`poster-project-delivery-guard`、`pptx-project-delivery-guard`、`print-publication-delivery-guard`、`video-project-delivery-guard`、`tonejs-music-production` | contract 文件 + SHA-256 receipt 绑定交付物新鲜度，输出经受控 writer 工具生成 |
| 治理类 | `project-capability-governance`、`language-output-governance`、`work-report-insights` | 提案格式与采用流程、会话语言、报告封印与追加 |

### Subagent 原则

本仓库不提供中央 subagent 编排或生命周期审计插件。领域 Skill 可以在任务适合拆分时，用完整自然语言请求宿主创建普通子 agent；子 agent 的输出只是建议或候选材料，父 agent 必须核对证据、运行验证并承担最终交付责任。模型、思考深度、权限、并发和启停由 Claude Code / Codex 宿主管理，不在跨平台 Hook 中模拟身份、reservation、nonce、mailbox 或审批权。

某些领域 Hook 仍会在 `SubagentStop` 上执行与主 agent 相同的语言或交付物检查。这表示“同一领域规则覆盖子会话”，不表示仓库接管子 agent 的调度或生命周期。

### 通用结构

每个插件必须自包含：Claude Code 会把单插件目录复制到缓存，运行时不得引用自身目录之外的文件。

```text
plugins/<name>/
├── .claude-plugin/plugin.json   # Claude manifest（指向 hooks/claude.json）
├── .codex-plugin/plugin.json    # Codex manifest（版本必须与 Claude 一致）
├── hooks/claude.json            # 可选 Claude Hook 配置
├── hooks/codex.json             # 可选 Codex Hook 配置
├── src/                         # TypeScript 源码；entries/hooks|cli|mcp 为多入口
├── dist/                        # 已提交的 Node ESM bundle；插件安装后直接运行
├── skills/                      # 可选 Skill，大部分插件附带
├── acceptance/cases/            # 宿主验收用例（case.toml + prompt.md + expect.sh + workspace/）
├── tests/*.test.ts              # 与源码同名或同职责的离线测试
└── skill-deps.json              # 可选社区 Skill 依赖声明
```

纯内容插件可以没有 `src/` 和 `dist/`。代码插件的运行时依赖由 esbuild 打进各自 bundle，仅保留 Node.js 内置模块为 external，因此单独复制任一插件目录即可安装和运行。

两个宿主的字段名、环境变量与生命周期事件不同，因此 marketplace 索引、插件 manifest 与 Hook 配置按平台分别维护，业务脚本在插件目录内共享。Hook 事件覆盖：`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`Stop`、`SubagentStart`、`SubagentStop`、`PreCompact`、`PostCompact`。

### 设计约定

- **Hook IO 协议**：事件 JSON 从 stdin 读入，stdout 输出放行/阻断决策，stderr 输出给人读的消息；解析失败一律 fail-open。阻断走 `exit(2)` 加结构化 `blockingContract`（observedFacts / harm / unblockWhen / recovery）；`PreToolUse` 阻断输出 `permissionDecision: "deny"`。
- **证据**：工作流插件用磁盘回执和 SHA-256 receipt 绑新鲜度；交付前要求回执和 trail 对得上。Hook 被调用、格式对、或多走几轮模型，都不算做完。
- **fail-open / fail-closed**：解析失败和证据缺失就放行；写入安全、trail 完整性和交付新鲜度出问题就拦住。
- **可配置**：多数守卫支持项目级配置（如 `.encoding-guard.mjs`、`.language-output-governance.mjs`），解析失败回退内置规则。
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

`npm run build` 会从每个 `src/entries/**/*.ts` 生成对应的 `dist/**/*.mjs`；提交前必须把这些产物一并提交。`npm run check:dist` 以内存重建结果逐字节检查仓库中的产物，不会改写工作区。验证脚本还会校验 JSON、bundle 语法、双平台 manifest 版本、离线单元测试、双宿主 acceptance case 结构、惰性日志诚实性和 Claude/Codex marketplace 加载。

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

## 社区 Skill 依赖

部分插件依赖公开 Agent Skill，例如 `work-report-insights` → `grill-me`。在插件目录声明：

```text
plugins/<name>/skill-deps.json
```

```json
{
  "skills": [
    {
      "name": "grill-me",
      "source": "https://github.com/mattpocock/skills",
      "description": "可选说明"
    }
  ]
}
```

`scripts/install-all.sh` 会收集 catalog 中每个插件的 `skill-deps.json`。本地 clone 直接读取文件，curl 一键安装则从 GitHub raw 读取；随后按 Skill 名称去重，并执行：

```bash
npx --yes skills add <source> --skill <name> --global --yes -a claude-code -a codex
```

| Flag / 环境变量 | 作用 |
| --- | --- |
| `--skip-skill-deps` | 不安装 Skill 依赖 |
| `HARNESS_SKIP_SKILL_DEPS=1` | 与上项相同 |
| `--list-only` | 同时输出解析后的 `name<TAB>source` |

插件没有社区 Skill 依赖时不需要 `skill-deps.json`。该文件可选，存在时 CI 会校验 schema。

## 添加插件

操作步骤见 `GUIDE.md` 第 16 节。新插件必须同时登记在：

- `.claude-plugin/marketplace.json`
- `.agents/plugins/marketplace.json`

若插件依赖 skills.sh 或 GitHub Skill 仓库中的公开 Skill，添加 `plugins/<name>/skill-deps.json`，让 `install-all.sh` 将其安装到全局 scope；宿主验收 (`scripts/acceptance`) 在跑每个 live case 时也会按同一清单把 skill-deps 装进 case 隔离的 `HOME`。

## 相关文档

- [工作架构](docs/architecture.md)
- [仓库初始化与插件开发指南](GUIDE.md)
- [双宿主验收](docs/host-acceptance.md)
- [验收矩阵](docs/acceptance-matrix.md)
- [Artifact 交付守卫](docs/artifact-delivery-guards.md)
- [Claude Code 插件 Marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- [Codex 插件打包](https://developers.openai.com/plugins/build/plugins#build-your-own-curated-plugin-list)
- [Codex Hook](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks)

## 宿主验收：Claude Code、Codex 与 DeepSeek

实时验收只能在 Docker 中运行，镜像位于 `docker/host-acceptance`。从宿主执行 `./scripts/acceptance/run.sh` 时，smoke 和 live case 都会构建并运行该镜像，覆盖 Claude 与 Codex；单元测试和 honesty gate 仍可直接在宿主运行。每个 live case 只启用当前插件，并同步安装其 `skill-deps.json` 中声明的社区 Skill。

验收要求 `.env` 包含 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL=deepseek-v4-flash`：

```bash
./scripts/acceptance/run.sh --smoke                         # DeepSeek smoke，Docker
./scripts/acceptance/run.sh                                 # 全部插件 × Claude/Codex，Docker
./scripts/acceptance/run.sh --plugin command-safety-guards  # 单个插件，Docker
./scripts/acceptance/run.sh --honesty-only                  # 只运行惰性预期门禁，不启动 Docker
bash scripts/acceptance/test-skill-deps-install.sh          # skill-deps 安装辅助（无 API）

# 项目级场景：install-all 装全量插件 + 社区 skill，再跑开放 brief
./scripts/acceptance/run-project.sh --honesty-only
./scripts/acceptance/run-project.sh --case logo-design/01-goal-e2e-delivery --host claude
```

项目级用例见 `acceptance/scenarios/`；宿主验收说明见 [host-acceptance](docs/host-acceptance.md)。
