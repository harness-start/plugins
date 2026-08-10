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

# 从本地 clone 安装
bash scripts/install-all.sh
bash scripts/install-all.sh --dry-run

# 跳过社区 Skill 依赖，适用于离线或没有 npx 的环境
bash scripts/install-all.sh --skip-skill-deps
```

要求：`bash`、可访问 GitHub 的网络，以及 Claude Code CLI 和/或 Codex CLI。建议安装 `jq`。社区 Skill 依赖还需要 Node.js 与 `npx`。

安装后：

- **Claude Code：** 启动新会话，或在提示时执行 `/reload-plugins`，使 Hook 生效。
- **Codex：** 通过 `/hooks` 审查并信任插件 Hook。安装成功不表示 Hook 已受信任或正在运行。
- **社区 Skill：** 插件可声明 `skill-deps.json`；`install-all.sh` 会把这些依赖安装或更新到全局 Skill scope，即执行 `npx skills add … --global`。

`--language <profile>` 接受 `zh-CN`、`en-US`、`ja-JP`、`ko-KR` 或 `th-TH`。传入后，安装器会将 profile 写入每个已安装宿主自己的配置目录。不传时，`language-output-governance` 使用内置 `zh-CN` 默认值。项目的 `.language-output-governance.mjs` 优先于用户级安装偏好。

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

## 仓库结构

```text
.
├── .claude-plugin/marketplace.json    # Claude Code marketplace
├── .agents/plugins/marketplace.json   # Codex marketplace
├── plugins/                           # 自包含插件目录
├── scripts/install-all.sh             # marketplace 与全部插件的一键安装脚本
├── scripts/ci/validate-plugins.sh     # GitHub/GitLab 共用 CI 检查
├── .github/workflows/validate-plugins.yml
├── .gitlab-ci.yml
└── GUIDE.md                           # 完整初始化与发布指南
```

默认分支：`master`

每个插件都必须自包含。运行时不得引用自身目录外的文件，因为 Claude Code 会将单个插件目录复制到缓存。

`GUIDE.md` 中的 `session-hooks`、`policy-checks` 等名称只用于示例。真实插件位于 `plugins/`，并同时登记在两个 marketplace 索引中。

## 插件列表

| 插件 | 说明 |
| --- | --- |
| `research-provenance-guard` | 通过 `research-evidence-workflow` 编排硬研究：项目工作流、MCP 捕获与 anchor、typed claim、seal 和 seal 后 handoff |
| `artifact-evidence-guard` | 在 `Stop` 校验明确声明的 artifact 路径、大小、SHA-256 与格式；证据缺失或无法确定时 fail-open |
| `git-state-evidence-guard` | 在 `Stop` 校验明确声明的 HEAD、分支或 detached 状态及工作树清洁状态；证据缺失或无法确定时 fail-open |
| `execution-loop-guard` | 在 agent 浪费整个会话前识别重复编辑、盲目重试命令和过度远端轮询 |
| `source-sanity-guard` | 阻断源码目录中的备份产物和明显的 replacement character 解码损坏 |
| `git-delivery-guards` | 保护本地 Git 命令、原子提交、仓库状态和未解决合并冲突标记 |
| `code-quality-guard` | 写入后执行有界的 JS/TS、Python 和 PHP 语法、lint 与静态分析检查 |
| `encoding-guard` | AI 写入后阻断带 BOM 或不符合严格 UTF-8 的文本文件 |
| `markdown-format-guard` | 写入后检查 Markdown 标题结构和常见格式规则 |
| `file-line-budget-guard` | 在 Edit/Write 后按语言实施棘轮式文件行数预算 |
| `protected-file-guard` | 阻断文件工具直接修改依赖 lockfile 和包管理器拥有的第三方依赖目录 |
| `command-safety-guards` | 拒绝宽范围递归删除、无备份 `sed` 原地编辑和写入非临时路径的 `cat` heredoc 等高风险命令 |
| `language-output-governance` | 让主 agent 与 subagent 的散文遵循同一可配置会话语言，默认简体中文 |
| `subagent-workflow-guard` | 提供带 scope 的 handoff application、Hook-capable dispatch 一次性回执，以及 sealed review/closure 校验 |
| `subagent-lifecycle-audit` | 以 append-only 形式记录 subagent 启停和生命周期缺口，不保存工作内容 |
| `intent-clarify-gate` | grill-me 式意图澄清期间门禁业务写入，直到 `done` 或选择完成项 |
| `first-principles-gate` | 第一性原理分析期间门禁业务写入，直到结构化磁盘 ledger 完成并关闭会话 |
| `reasoning-discipline-guard` | 通过宽泛 Skill 建立五阶段推理工作流，并在输出结论前要求有序 challenge 和 cross-check 回执 |
| `debugging-workflow-guard` | 通过聚焦 Skill 创建 Debug Work Order，为多个缺陷分别归属证据，并用 Hook 门禁不安全修复循环 |
| `behavioral-regression-guard` | 用语言无关 Skill 设计主用例、对抗用例和兼容性用例，并将 RED/GREEN 回执绑定到不变验证资产与新鲜生产文件字节 |
| `goal-task-gate` | 响应宿主 `/goal` prompt，强制 `.goal-task/` 下 append-only 决策轨迹，并仅在 `GOAL_TASK_DONE` trailer 与 close 行一致时完成 |
| `file-access-audit` | 将结构化 agent 文件读写记录到项目本地 `.file-access-audit/sessions/<session>.jsonl` |
| `command-exec-audit` | 将 agent shell 命令、状态和耗时记录到项目本地 `.command-exec-audit/sessions/<session>.jsonl` |
| `compact-context-journal` | 在上下文压缩前后持久记录已确认需求，强制先读 Recovery Card 再恢复修改 |
| `logo-project-delivery-guard` | 校验 Logo 工程的向量 owner、标准制图、几何/Fibonacci 映射、变体闭包和 release receipt |
| `poster-project-delivery-guard` | 校验 React/Satori 海报工程的 layer 顺序、role、成对 SVG/PNG proof 和 release freshness |
| `pptx-project-delivery-guard` | 校验 PptxGenJS 工程的页序、单页 owner、source-hash 预览、交付闭包和 release receipt |
| `print-publication-delivery-guard` | 校验静态印刷出版工程的章节、Paged Media CSS、四种 PDF role、preflight evidence 和 receipt |
| `video-project-delivery-guard` | 校验 Remotion 工程的视音频帧区间、MP4/WAV proof、媒体边界和 release evidence |
| `tonejs-music-production` | 用确定性数学模型生成并优化 Tone.js 乐谱，离线渲染 WAV，并绑定听审、音频指标与 release receipt |

## 前置条件

- Git
- Node.js 20+
- Claude Code CLI 和/或 Codex CLI，用于安装与宿主检查
- `jq`，建议安装

## 本地静态检查

GitHub Actions 与 GitLab CI 都运行同一脚本：

```bash
bash scripts/ci/validate-plugins.sh
```

脚本会校验 JSON、全部插件 JavaScript 语法、双平台 manifest 版本、离线单元测试、双宿主 acceptance case 结构、惰性日志诚实性和 Claude/Codex marketplace 加载。它还要求每个 `plugins/*` 目录同时登记在两个 marketplace 索引中，并拒绝孤立索引条目。

宿主已安装时运行：

```bash
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
```

## 本地 Marketplace 开发

```bash
# Claude Code
claude plugin marketplace add "$(pwd)"
claude plugin install <plugin-name>@harness-start

# Codex
codex plugin marketplace add . --json
codex plugin list --marketplace harness-start --available --json
codex plugin add <plugin-name>@harness-start --json
```

## 社区 Skill 依赖

部分插件依赖公开 Agent Skill，例如 `intent-clarify-gate` → `grill-me`。在插件目录声明：

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

若插件依赖 skills.sh 或 GitHub Skill 仓库中的公开 Skill，添加 `plugins/<name>/skill-deps.json`，让 `install-all.sh` 将其安装到全局 scope。

## 相关文档

- [Artifact 交付守卫](docs/artifact-delivery-guards.md)
- [Claude Code 插件 Marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- [Codex 插件打包](https://developers.openai.com/plugins/build/plugins#build-your-own-curated-plugin-list)
- [Codex Hook](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks)

## 宿主验收：Claude Code、Codex 与 DeepSeek

实时验收只能在 Docker 中运行，镜像位于 `docker/host-acceptance`。从宿主执行 `./scripts/acceptance/run.sh` 时，smoke 和 live case 都会构建并运行该镜像，覆盖 Claude 与 Codex；单元测试和 honesty gate 仍可直接在宿主运行。

验收要求 `.env` 包含 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL=deepseek-v4-flash`：

```bash
./scripts/acceptance/run.sh --smoke                         # DeepSeek smoke，Docker
./scripts/acceptance/run.sh                                 # 全部插件 × Claude/Codex，Docker
./scripts/acceptance/run.sh --plugin command-safety-guards  # 单个插件，Docker
./scripts/acceptance/run.sh --honesty-only                  # 只运行惰性预期门禁，不启动 Docker
```

详见 [宿主验收文档](docs/host-acceptance.md)。
