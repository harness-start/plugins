# Claude Code / Codex 多插件仓库初始化指南

## 1. 目标

本文说明如何初始化一个 Git 仓库，同时作为：

- Claude Code Plugin Marketplace；
- Codex Plugin Marketplace；
- 多个独立插件的源码仓库；
- hooks 与 scripts 的统一维护仓库。

本仓库的工作方向是“重 hooks，轻 skill + script”：Hook 负责自动触发、门禁、反馈和状态推进；插件内 Script 负责确定性执行；Skill 只在配置、诊断、例外或恢复必须由用户或 agent 明确发起时出现。这里的“重/轻”指职责和激活方式，不按文件数量或代码行数衡量。完整边界见 [`docs/architecture.md`](docs/architecture.md)。

两套平台共享插件业务脚本，但分别维护 Marketplace 索引、Plugin manifest 和 Hook 配置。Claude Code 与 Codex 的 manifest 字段、环境变量和生命周期事件并不完全一致，因此不要尝试用一份 manifest 覆盖两个平台。

Claude Code 和 Codex 都支持在一个 Marketplace 中登记多个插件：

- [Claude Code Marketplace 官方文档](https://code.claude.com/docs/en/plugin-marketplaces)
- [Codex Plugin Packaging 官方文档](https://developers.openai.com/plugins/build/plugins#build-your-own-curated-plugin-list)

## 2. 前置要求

本地需要：

```text
Git
Node.js 20+
Claude Code CLI
Codex CLI
jq（推荐）
```

确认版本：

```bash
git --version
node --version
claude --version
codex --version
jq --version
```

确认插件命令存在：

```bash
claude plugin --help
codex plugin --help
```

本文示例中的 hook 脚本使用 Node.js，因此目标机器也必须安装 Node.js。

## 3. 仓库结构

推荐结构：

```text
harness-start/
├── README.md
├── LICENSE
├── .gitignore
│
├── .claude-plugin/
│   └── marketplace.json
│
├── .agents/
│   └── plugins/
│       └── marketplace.json
│
└── plugins/
    ├── session-hooks/
    │   ├── README.md
    │   ├── .claude-plugin/
    │   │   └── plugin.json
    │   ├── .codex-plugin/
    │   │   └── plugin.json
    │   ├── hooks/
    │   │   ├── claude.json
    │   │   └── codex.json
    │   ├── scripts/
    │   │   ├── session-start.mjs
    │   │   ├── checks/                 # 按需：纯判定
    │   │   └── lib/                    # 按需：本插件最小辅助函数
    │   ├── skills/                     # 按需：显式配置/诊断入口
    │   ├── tests/
    │   └── acceptance/
    │       ├── README.md
    │       └── cases/
    │
    └── policy-checks/
        ├── README.md
        ├── .claude-plugin/
        │   └── plugin.json
        ├── .codex-plugin/
        │   └── plugin.json
        ├── hooks/
        │   ├── claude.json
        │   └── codex.json
        ├── scripts/
        │   └── policy-check.mjs
        ├── tests/
        └── acceptance/
```

每个插件必须是自包含目录。不要让一个插件通过以下方式引用另一个插件：

```text
../other-plugin/scripts/tool.sh
../../shared/script.mjs
```

Claude Code 安装插件时会将单个插件目录复制到缓存，插件目录外的文件不会一起复制。

如果多个插件出现相似实现，当前默认是在各插件中保留实际使用的最小本地函数。不要为复用新增根级 npm 包、安装步骤、同步脚本、代码生成或发布目录构建，也不要依赖安装目录外的运行时相对路径。只有重复已经造成可观察的行为漂移，并且新的分发方式仍能保持插件独立安装和直接运行时，才单独评审共享层。

### 3.1 Hook、Script 与 Skill 的选择

| 载体 | 使用条件 | 约束 |
| --- | --- | --- |
| Hook | 能力绑定宿主生命周期，输入、判定和输出可机械验证 | 同插件同事件只保留少量 dispatcher；明确 matcher、超时和错误策略 |
| Script | Hook 或显式工具需要确定、可测试的执行逻辑 | 位于插件目录内；入口处理 I/O，检查函数尽量纯；不安装依赖 |
| Skill | 配置、诊断、窄例外或恢复需要显式意图和操作指导 | 可选；不复制 Hook 判定，不成为 Hook 生效的前置条件 |
| CLI / MCP | 工作流创建、查询或逃生操作需要明确调用 | 不根据模糊 prompt 偷偷创建状态 |

开放式推理、外部协调和无界探索留在 agent 工作流中，不放进每次事件自动执行的 Hook。

### 3.2 插件内分层

- `hooks/*.json` 只描述平台事件、matcher、入口命令、状态提示和超时。
- 生命周期入口负责读取 stdin、规范化事件、调度检查并适配平台输出。
- `scripts/checks/` 保存可独立测试的判定；`scripts/lib/` 只保留本插件实际引用的辅助函数。
- Skill、CLI 和 Hook 可以共享同一配置或状态模型，但不能各自维护一份规则。
- schema、templates、skills、CLI 和持久状态目录都按实际消费者增加，不为结构完整而创建空目录。

## 4. 初始化仓库

创建仓库：

```bash
mkdir harness-start
cd harness-start

git init -b master

mkdir -p .claude-plugin
mkdir -p .agents/plugins

mkdir -p plugins/session-hooks/.claude-plugin
mkdir -p plugins/session-hooks/.codex-plugin
mkdir -p plugins/session-hooks/hooks
mkdir -p plugins/session-hooks/scripts

mkdir -p plugins/policy-checks/.claude-plugin
mkdir -p plugins/policy-checks/.codex-plugin
mkdir -p plugins/policy-checks/hooks
mkdir -p plugins/policy-checks/scripts
```

建议在根目录创建 `.gitignore`：

```gitignore
.DS_Store
node_modules/
*.log

# Local plugin/cache state
.codex/
.claude/settings.local.json

# Generated artifacts
dist/
coverage/
```

## 5. Claude Code Marketplace

创建 `.claude-plugin/marketplace.json`：

```json
{
  "name": "harness-start",
  "description": "Harness Start plugins for Claude Code and Codex.",
  "owner": {
    "name": "Harness Start",
    "email": "devtools@example.com"
  },
  "plugins": [
    {
      "name": "session-hooks",
      "source": "./plugins/session-hooks",
      "description": "Run company initialization logic when a session starts."
    },
    {
      "name": "policy-checks",
      "source": "./plugins/policy-checks",
      "description": "Apply deterministic policy checks during agent execution."
    }
  ]
}
```

其中：

- `name` 是 Marketplace 标识；
- `plugins[]` 中每项代表一个可独立安装的插件；
- `source` 相对于仓库根目录；
- 插件名称必须唯一；
- 名称建议只使用小写字母、数字和连字符。

Claude Code 用户从 **公开 GitHub** 安装时使用：

```bash
# 推荐：一键安装/更新 marketplace 与全部插件
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash

# 或手动：
claude plugin marketplace add harness-start/plugins
claude plugin install session-hooks@harness-start
```

完整 HTTPS 源（与 GitHub 简写等价）：

```bash
claude plugin marketplace add https://github.com/harness-start/plugins.git
```

## 6. Codex Marketplace

创建 `.agents/plugins/marketplace.json`：

```json
{
  "name": "harness-start",
  "interface": {
    "displayName": "Harness Start"
  },
  "plugins": [
    {
      "name": "session-hooks",
      "source": {
        "source": "local",
        "path": "./plugins/session-hooks"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    },
    {
      "name": "policy-checks",
      "source": {
        "source": "local",
        "path": "./plugins/policy-checks"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

Codex 用户安装时使用：

```bash
codex plugin marketplace add harness-start/plugins
codex plugin add session-hooks@harness-start
```

也可以写成：

```bash
codex plugin add session-hooks \
  --marketplace harness-start
```

## 7. 创建双平台插件 manifest

以下以 `session-hooks` 为例。

### 7.1 Claude Code manifest

创建 `plugins/session-hooks/.claude-plugin/plugin.json`：

```json
{
  "name": "session-hooks",
  "version": "0.1.0",
  "description": "Run company initialization logic when a Claude Code session starts.",
  "author": {
    "name": "Harness Start",
    "email": "devtools@example.com"
  },
  "hooks": "./hooks/claude.json"
}
```

Claude Code 的 manifest 在默认目录自动发现模式下可以省略，但双平台、多插件、可发布仓库应显式保留。

### 7.2 Codex manifest

创建 `plugins/session-hooks/.codex-plugin/plugin.json`：

```json
{
  "name": "session-hooks",
  "version": "0.1.0",
  "description": "Run company initialization logic when a Codex session starts.",
  "author": {
    "name": "Harness Start",
    "email": "devtools@example.com"
  },
  "hooks": "./hooks/codex.json",
  "interface": {
    "displayName": "Session Hooks",
    "shortDescription": "Initialize company agent sessions.",
    "developerName": "Harness Start",
    "category": "Productivity"
  }
}
```

Codex 要求插件包含 `.codex-plugin/plugin.json`。`skills/`、`SKILL.md`、MCP 和 hooks 都是可选组件。对于 hook-only 插件，不需要创建 `SKILL.md`；只有显式配置、诊断或恢复流程确实需要操作指导时才增加 Skill。

## 8. 创建平台独立的 Hook 配置

业务脚本可以共享，但 hook 配置建议分开。

### 8.1 Claude Code hook

创建 `plugins/session-hooks/hooks/claude.json`：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/session-start.mjs\""
          }
        ]
      }
    ]
  }
}
```

Claude Code 插件目录环境变量：

```text
CLAUDE_PLUGIN_ROOT
CLAUDE_PLUGIN_DATA
```

- `CLAUDE_PLUGIN_ROOT` 指向当前安装版本的插件目录；
- `CLAUDE_PLUGIN_DATA` 是宿主提供的插件数据目录，本仓库插件不把生产状态写到那里。

插件自己产生的会话状态、回执和捕获文件写在当前工作目录下该插件拥有的 `.state/`（例如 `.reasoning-methods/.state/`），并带 `*` 的 `.gitignore`。不要写入插件安装目录。

### 8.2 Codex hook

创建 `plugins/session-hooks/hooks/codex.json`：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "AI_EXPERTS_SESSION_ID=\"${AI_EXPERTS_SESSION_ID:-hook}\" AI_EXPERTS_TRIGGER_FROM=\"session-hooks:session-start\" node \"${PLUGIN_ROOT}/dist/hooks/session-start.mjs\"",
            "statusMessage": "Initializing company session"
          }
        ]
      }
    ]
  }
}
```

Codex 插件目录环境变量：

```text
PLUGIN_ROOT
PLUGIN_DATA
```

Codex 还提供 `CLAUDE_PLUGIN_ROOT` 和 `CLAUDE_PLUGIN_DATA` 兼容变量，但新插件应优先使用 Codex 原生变量。参见 [Codex Hooks 官方文档](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks)。

Codex 安装或启用插件不会自动信任其中的 hooks。用户必须审查并信任当前 hook 定义后，hook 才会执行。

## 9. 创建双平台共享的插件内业务脚本

创建 `plugins/session-hooks/src/entries/hooks/session-start.ts`：

```typescript
let rawInput = "";

for await (const chunk of process.stdin) {
  rawInput += chunk;
}

try {
  JSON.parse(rawInput || "{}");
} catch (error) {
  process.stderr.write(
    `[session-hooks] Invalid hook input: ${error.message}\n`,
  );
  process.exit(2);
}

process.stderr.write("[session-hooks] SessionStart hook completed\n");
```

这个脚本：

- 同时兼容 Claude Code 和 Codex；
- 从标准输入读取 hook 事件；
- 验证输入为 JSON；
- 不依赖当前工作目录；
- 不写入插件安装目录；
- 不输出凭据或完整事件内容。

当一个事件包含多条检查时，Hook 配置仍只注册一个入口。入口按明确顺序调用 `src/checks/` 中的函数，并聚合 report 或执行 first-deny-wins；不要为每条规则启动一个 Hook 进程。平台输出差异留在入口或 `hook-io` 适配层，业务检查不读取 `CLAUDE_PLUGIN_ROOT`、`PLUGIN_ROOT` 等平台变量。完成源码后从仓库根运行 `npm run build -- --plugin session-hooks`，并提交生成的 `dist/hooks/session-start.mjs`。

如果需要持久化数据：

```javascript
import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";

const dataDirectory =
  process.env.PLUGIN_DATA ??
  process.env.CLAUDE_PLUGIN_DATA;

if (!dataDirectory) {
  throw new Error("Plugin data directory is unavailable");
}

await mkdir(dataDirectory, {
  recursive: true,
  mode: 0o700,
});

await appendFile(
  join(dataDirectory, "events.log"),
  `${new Date().toISOString()} SessionStart\n`,
  {
    encoding: "utf8",
    mode: 0o600,
  },
);
```

不要把 token、用户 prompt、完整工具参数或环境变量直接写入日志。

## 10. 为第二个插件复用打包模式

`policy-checks` 使用相同结构：

```text
plugins/policy-checks/
├── .claude-plugin/plugin.json
├── .codex-plugin/plugin.json
├── hooks/claude.json
├── hooks/codex.json
├── src/entries/hooks/policy-check.ts
├── tests/policy-check.test.ts
└── dist/hooks/policy-check.mjs
```

这里复用的是目录和契约模式，不是跨插件运行时文件。每个插件独立维护：

- 插件名称；
- 插件版本；
- 插件说明；
- 双平台 manifest；
- 双平台 hook 定义；
- 插件内脚本、测试和发布记录；
- 双宿主验收用例；
- 按需提供的 Skill、CLI、schema 和状态模型。

## 11. 本地静态验证

先检查所有 JSON：

```bash
find .claude-plugin .agents/plugins plugins \
  -type f \
  -name '*.json' \
  -print0 |
while IFS= read -r -d '' file; do
  echo "Validating $file"
  jq empty "$file"
done
```

检查 TypeScript、bundle 语法和已提交产物的新鲜度：

```bash
npm run typecheck
npm run lint
npm run check:dist
npm test
```

检查两个 manifest 的版本是否一致：

```bash
for plugin in plugins/*; do
  claude_version="$(
    jq -r '.version' "$plugin/.claude-plugin/plugin.json"
  )"

  codex_version="$(
    jq -r '.version' "$plugin/.codex-plugin/plugin.json"
  )"

  if [ "$claude_version" != "$codex_version" ]; then
    echo "Version mismatch: $plugin"
    exit 1
  fi
done
```

## 12. Claude Code 验证

验证整个 Marketplace：

```bash
claude plugin validate --strict .
```

验证单个插件：

```bash
for plugin in plugins/*; do
  claude plugin validate --strict "$plugin"
done
```

预期结果：

```text
✔ Validation passed
```

本地添加 Marketplace：

```bash
claude plugin marketplace add .
```

安装插件：

```bash
claude plugin install session-hooks@harness-start
```

然后启动新 Claude Code 会话，触发 `SessionStart`。

查看已登记的 Marketplace：

```bash
claude plugin marketplace list --json
```

## 13. Codex 验证

当前 Codex CLI 没有与 `claude plugin validate` 完全等价的独立 validator，因此需要结合以下检查：

- JSON 静态检查；
- Marketplace 加载；
- 插件列表检查；
- 本地安装；
- 新会话真实 hook 验证。

添加本地 Marketplace：

```bash
codex plugin marketplace add . --json
```

确认 Marketplace：

```bash
codex plugin marketplace list
```

确认其中的插件可发现：

```bash
codex plugin list \
  --marketplace harness-start \
  --available \
  --json
```

安装：

```bash
codex plugin add session-hooks@harness-start --json
```

安装后启动一个新的 Codex 会话：

```bash
codex
```

审查并信任插件 hook，然后确认 `SessionStart` hook 在调试日志中成功完成。

只看到“插件已安装”不能证明 hook 已执行；必须在新会话中完成实际触发验证。

## 14. 从远程 Git 仓库测试

**使用者安装只使用公开 GitHub：** `https://github.com/harness-start/plugins`  
（维护者内部推送 remotes 勿写入面向用户的 README / install 文案。）

使用者一键安装：

```bash
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash
```

Claude Code（手动）：

```bash
claude plugin marketplace add harness-start/plugins
claude plugin install session-hooks@harness-start
```

Codex（手动）：

```bash
codex plugin marketplace add harness-start/plugins --ref master
codex plugin add session-hooks@harness-start
```

大型仓库可以使用 sparse checkout。

Claude Code：

```bash
claude plugin marketplace add harness-start/plugins \
  --sparse .claude-plugin plugins
```

Codex：

```bash
codex plugin marketplace add harness-start/plugins \
  --ref master \
  --sparse .agents/plugins \
  --sparse plugins
```

## 15. 插件版本发布与使用者更新

### 15.1 更新链路

插件更新分成四个独立环节：

```text
发布者生成新版本
        ↓
推送到 Marketplace 对应的 Git ref
        ↓
使用者刷新 Marketplace
        ↓
更新已安装插件并启动新会话验收
```

只推送代码并不能保证所有使用者立即运行新版本。发布者必须生成可识别的新版本；使用者必须刷新对应 Marketplace，并让插件宿主重新载入安装缓存。

两套平台当前的更新入口不同：

| 平台 | 手动更新入口 | 自动更新 |
| --- | --- | --- |
| Claude Code | `claude plugin update` | 可按 Marketplace 开启，启动时刷新 Marketplace 并更新已安装插件 |
| Codex | `codex plugin marketplace upgrade` | 当前官方仓库 Marketplace 文档没有承诺与 Claude Code 等价的启动时自动更新，应按手动或受管任务执行 |

### 15.2 版本规则

每个插件独立使用语义化版本：

```text
MAJOR.MINOR.PATCH
```

例如：

```text
0.1.0
0.1.1
0.2.0
1.0.0
```

版本必须同时更新：

```text
plugins/<name>/.claude-plugin/plugin.json
plugins/<name>/.codex-plugin/plugin.json
```

两个 manifest 的 `name` 和 `version` 必须一致：

```json
{
  "name": "session-hooks",
  "version": "0.2.0"
}
```

不要在 Marketplace 条目中重复声明插件版本，以免 Marketplace 和两个 manifest 出现三处版本漂移。

Claude Code 按以下优先级解析版本：

1. 插件 `.claude-plugin/plugin.json` 中的 `version`；
2. Marketplace 插件条目中的 `version`；
3. 插件 Git source 的 commit SHA。

本文采用显式版本，因此每次发布都必须修改 `.claude-plugin/plugin.json` 的 `version`。如果代码已经推送，但版本仍是旧值，Claude Code 会认为插件没有更新并跳过升级。

Codex 的 `.codex-plugin/plugin.json` 也应同步升级版本。更新完成后通过 `codex plugin list --json` 检查实际 materialized plugin 的版本，不要只检查 Git 仓库内容。

### 15.3 发布者发布新版本

以 `session-hooks` 从 `0.1.0` 升级到 `0.2.0` 为例。

先修改两个 manifest：

```text
plugins/session-hooks/.claude-plugin/plugin.json
plugins/session-hooks/.codex-plugin/plugin.json
```

将两处版本都改为：

```json
{
  "version": "0.2.0"
}
```

如果只是升级已有插件，不需要修改两个 Marketplace 的 `plugins[]`。只有新增、删除、重命名插件或更改插件 source 时，才需要修改 Marketplace 索引。

发布前检查版本：

```bash
plugin=plugins/session-hooks

claude_version="$(
  jq -r '.version' "$plugin/.claude-plugin/plugin.json"
)"

codex_version="$(
  jq -r '.version' "$plugin/.codex-plugin/plugin.json"
)"

test "$claude_version" = "$codex_version"
test "$claude_version" = "0.2.0"
```

执行完整验证：

```bash
claude plugin validate --strict .
claude plugin validate --strict plugins/session-hooks

node --check \
  plugins/session-hooks/dist/hooks/session-start.mjs
```

完成本地双平台安装和真实 hook 回归后，再提交并推送：

```bash
git add \
  plugins/session-hooks/.claude-plugin/plugin.json \
  plugins/session-hooks/.codex-plugin/plugin.json \
  plugins/session-hooks/hooks \
  plugins/session-hooks/src \
  plugins/session-hooks/tests \
  plugins/session-hooks/dist \
  plugins/session-hooks/CHANGELOG.md

git commit -m "feat(session-hooks): release 0.2.0"
git tag session-hooks-v0.2.0

git push origin master
git push origin session-hooks-v0.2.0
```

如果仓库没有 `plugins/session-hooks/CHANGELOG.md`，应在首次正式发布前创建。至少记录：

- 版本号和发布日期；
- 行为变化；
- 是否修改 hooks；
- 是否需要重新授权；
- 破坏性变化和迁移方法；
- 回滚目标版本或 tag。

推送后确认远端分支和 tag 已包含新版本：

```bash
git ls-remote origin \
  refs/heads/master \
  refs/tags/session-hooks-v0.2.0
```

### 15.4 Git ref 与发布通道

使用者只能更新到其 Marketplace source 所跟踪的 ref。

例如，使用者通过以下命令添加 Marketplace：

```bash
codex plugin marketplace add \
  harness-start/plugins \
  --ref master
```

那么 `marketplace upgrade` 会刷新 `master`。如果 Marketplace 固定在不会移动的 tag 或 SHA，发布新 tag 后，原有使用者不会自动切换到新 tag。

生产环境建议使用可移动的稳定分支：

```text
master    日常开发或 latest
stable    已验收的生产版本
```

发布流程可以先更新 `master`，完成回归后再将 `stable` 快进到相同提交。不要强制改写共享发布分支。

### 15.5 Claude Code 使用者手动更新

先刷新 Marketplace 索引：

```bash
claude plugin marketplace update harness-start
```

再更新指定插件：

```bash
claude plugin update \
  session-hooks@harness-start
```

如果要更新多个插件，逐个执行：

```bash
for plugin in session-hooks policy-checks; do
  claude plugin update \
    "$plugin@harness-start"
done
```

检查安装结果：

```bash
claude plugin list --json |
jq '.[] | select(
  .name == "session-hooks" and
  .marketplace == "harness-start"
)'
```

不同 Claude Code 版本的 JSON 字段可能变化。如果过滤结果为空，先执行以下命令查看真实输出结构：

```bash
claude plugin list --json | jq .
```

更新完成后：

1. 如果 Claude Code 提示运行 `/reload-plugins`，按提示执行；
2. 对 hooks、MCP、LSP 或后台进程的变更，结束旧会话并启动新会话；
3. 重新触发受影响的 hook；
4. 确认新版本行为和日志；
5. 如果 hook 定义发生变化，重新审查其命令和权限。

更新发生在会话中途时，已经启动的 hook、monitor、MCP server 或 LSP server 可能继续使用旧版本目录。新会话验收是正式更新流程的一部分。

### 15.6 Claude Code 自动更新

Claude Code 可以按 Marketplace 开启自动更新。启用后，Claude Code 在启动时刷新该 Marketplace，并更新其中已经安装的插件。

启用方法：

1. 在 Claude Code 中运行 `/plugin`；
2. 打开 `Marketplaces`；
3. 选择 `harness-start`；
4. 选择 `Enable auto-update`。

第三方和本地开发 Marketplace 默认通常不会开启自动更新，需要使用者或管理员显式启用。更新完成后，如果出现 `/reload-plugins` 提示，应执行 reload 或启动新会话。

团队也可以在 `.claude/settings.json` 中声明 Marketplace 并开启自动更新：

```json
{
  "extraKnownMarketplaces": {
    "harness-start": {
      "source": {
        "source": "github",
        "repo": "harness-start/plugins"
      },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "session-hooks@harness-start": true
  }
}
```

私有仓库的后台自动更新不能弹出交互式 Git 凭据提示。应通过受控环境变量提供只读 token，例如 GitHub 的 `GITHUB_TOKEN` 或 `GH_TOKEN`、GitLab 的 `GITLAB_TOKEN` 或 `GL_TOKEN`。不要把 token 写进仓库或 Marketplace 文件。

### 15.7 Codex 使用者更新

Codex CLI 当前没有单独的 `codex plugin update <plugin>` 命令。Git Marketplace 的更新入口是：

```bash
codex plugin marketplace upgrade \
  harness-start \
  --json
```

这个命令刷新已配置的 Git Marketplace snapshot。当前 Codex CLI 还会刷新该 Marketplace 对应的已安装插件缓存。

检查 Marketplace 和已安装插件：

```bash
codex plugin marketplace list

codex plugin list \
  --marketplace harness-start \
  --available \
  --json |
jq .
```

应检查以下事实：

- Marketplace 已解析到新的 Git commit；
- `session-hooks` 仍处于 installed/enabled 状态；
- 本地物化版本已经是 `0.2.0`；
- 没有 marketplace load error；
- 新插件目录中包含预期的 hooks 和 scripts。

然后完全退出旧 Codex 会话并启动新会话：

```bash
codex
```

如果新版本修改了 hook 定义，原来的信任记录不应被当成对新定义的授权。重新核对命令、脚本路径和权限后，再信任当前 hook。

当前官方文档没有承诺 repo Marketplace 会像 Claude Code 一样在每次启动时自动更新。团队如果要求强制及时更新，应通过登录脚本、设备管理或受控运维任务定期执行：

```bash
codex plugin marketplace upgrade harness-start
```

该任务应记录退出码和输出；失败时保留旧版本，不要静默删除再安装。

### 15.8 更新通知模板

发布者完成远端验证后，应向使用者发送包含版本和命令的通知。例如：

```text
session-hooks 0.2.0 已发布。

主要变化：
- SessionStart 增加工作区策略检查；
- hook 定义已变化，需要重新审查；
- 最低 Node.js 版本仍为 20。

Claude Code：
claude plugin marketplace update harness-start
claude plugin update session-hooks@harness-start

Codex：
codex plugin marketplace upgrade harness-start

更新后请启动新会话并确认版本为 0.2.0。
回滚版本：session-hooks-v0.1.0
```

通知中不要只写“请更新最新版”。必须提供：

- 插件名称和目标版本；
- 变更摘要；
- 是否涉及 hook 权限变化；
- 两个平台的准确命令；
- 更新后验收方法；
- 回滚版本。

### 15.9 更新验收

一次更新只有同时满足以下条件才算完成：

- 远端目标 ref 包含新版本；
- Claude Code 的已安装版本已更新；
- Codex 的已物化插件版本已更新；
- 两个平台都已启动新会话；
- 修改过的 hook 已重新审查；
- 真实事件能够触发新 hook；
- hook 返回预期退出码；
- 持久化数据位于工作区插件拥有的 `.state/`，而不是 `PLUGIN_DATA` 或 `CLAUDE_PLUGIN_DATA`；
- 旧版本仍有明确回滚 tag。

不要用以下证据单独判定更新成功：

- Git push 成功；
- Marketplace refresh 命令退出为零；
- 插件列表中仍能看到插件名称；
- 旧会话中的 hook 仍然可以运行。

### 15.10 更新失败与回滚

更新失败时先记录：

```bash
claude plugin list --json
codex plugin marketplace list
codex plugin list --available --json
```

检查使用者跟踪的 Marketplace source、ref、远端 commit、双 manifest 版本和 Marketplace load error。

不要首先删除插件。删除可能同时移除缓存、持久化数据或本地启用状态。只有确认刷新和版本解析无法恢复后，才在备份配置和插件数据的前提下执行卸载、重新安装。

回滚应将稳定发布 ref 指回已验收提交，或者发布一个版本号更高的修复版本。对于已经广泛分发的版本，推荐发布新的补丁版本，而不是复用旧版本号或强制改写 tag。

## 16. 添加新插件

新增插件 `audit-hooks` 时：

```bash
mkdir -p plugins/audit-hooks/.claude-plugin
mkdir -p plugins/audit-hooks/.codex-plugin
mkdir -p plugins/audit-hooks/hooks
mkdir -p plugins/audit-hooks/scripts
mkdir -p plugins/audit-hooks/tests
mkdir -p plugins/audit-hooks/acceptance/cases
```

然后：

1. 先写清插件拥有的不变量，以及为什么它需要自动 Hook，而不是普通 agent 工作流。
2. 为每个事件确定 matcher、超时、阻断或报告语义、错误策略和恢复路径。
3. 创建 Claude Code 与 Codex manifest，以及各自的 Hook 配置。
4. 创建每个生命周期事件的 dispatcher；多条规则在插件进程内分派。
5. 把可独立验证的判定放入 `scripts/checks/`，只按实际依赖增加 `scripts/lib/`。
6. 仅在显式配置、诊断、例外或恢复需要操作指导时创建 `skills/<name>/SKILL.md`。
7. 在 `.claude-plugin/marketplace.json` 与 `.agents/plugins/marketplace.json` 中登记同名插件。
8. 把所需方法写进本插件 `skills/`，并带上许可证/NOTICE。不要添加 `skill-deps.json`。
9. 添加离线单测、`acceptance/README.md` 和至少一个双宿主真实会话用例。
10. 运行仓库验证，再分别安装并做 Claude Code / Codex 新会话验收。

同一个 Marketplace 内不能出现重名插件。

### 16.1 插件必须自包含

每个已发布插件必须捆绑自己的 Skill、脚本和双平台 Hook。禁止 `skill-deps.json`、`vendor-skills/` 和安装期 `npx skills add`。有用的社区方法应复制进该插件 `skills/` 并带上许可证/NOTICE。

## 17. CI 示例

GitHub Actions 与 GitLab CI 共用同一套校验脚本，避免双平台流水线漂移：

```text
scripts/ci/validate-plugins.sh
.github/workflows/validate-plugins.yml
.gitlab-ci.yml
```

默认分支为 `master`。两个入口都调用 `scripts/ci/validate-plugins.sh`，校验内容包括：

- JSON 与 manifest 可解析；
- 插件脚本语法；
- 仓库中不存在 `skill-deps.json` 或 `vendor-skills/`；
- 双平台 `plugin.json` 版本一致；
- **`plugins/*` 与两个 `marketplace.json` 互相登记且 source 路径正确**（防止新增插件忘记发布到 marketplace）；
- `claude plugin validate --strict`；
- Codex 本地加载 marketplace，并确认插件可发现。

GitHub Actions 入口：

```yaml
name: Validate plugins

on:
  pull_request:
  push:
    branches:
      - master

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    env:
      CLAUDE_CODE_VERSION: "2.1.170"
      CODEX_VERSION: "0.146.0"
      MARKETPLACE_NAME: harness-start
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: sudo apt-get update && sudo apt-get install -y jq
      - run: bash scripts/ci/validate-plugins.sh
```

GitLab CI 入口：

```yaml
default:
  image: node:20-bookworm

variables:
  CLAUDE_CODE_VERSION: "2.1.170"
  CODEX_VERSION: "0.146.0"
  MARKETPLACE_NAME: "harness-start"
  CODEX_HOME: "${CI_PROJECT_DIR}/.ci-codex-home"

stages:
  - validate

validate:plugins:
  stage: validate
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "master"
  before_script:
    - apt-get update
    - apt-get install -y --no-install-recommends jq ca-certificates git
  script:
    - bash scripts/ci/validate-plugins.sh
```

CI 可以证明：

- JSON 和 manifest 可解析；
- Claude validator 通过；
- Codex 能加载 Marketplace；
- 脚本没有基础语法错误；
- 每个 `plugins/*` 都已登记进 Claude 与 Codex 的 `marketplace.json`。

CI 不能替代真实 hook 验收。发布前还应分别启动 Claude Code 和 Codex 新会话，确认 hook 被信任、触发并正确退出。

## 18. 安全要求

每个 hook/plugin 合并前必须检查：

- Hook 运行的命令是否完全可见；
- 是否使用插件根目录环境变量定位文件；
- 是否验证标准输入；
- 是否限制文件读写范围；
- 是否会向网络发送数据；
- 是否打印 token、prompt、环境变量或工具参数；
- 是否在 hook 执行期间安装依赖；
- 是否依赖当前工作目录；
- 是否支持目标操作系统；
- 是否有超时、错误码和恢复路径。

执行约束：

- Hook 只做确定性、短时操作；
- 同一插件、同一事件优先使用一个 dispatcher，避免每条规则启动一个进程；
- 不在 hook 中执行交互命令；
- 不在 hook 中运行 `npm install`、`curl | sh` 等动态安装；
- 不写入插件安装目录；
- 持久化状态写入工作区插件拥有的 `.state/`，不写入 `PLUGIN_DATA`、`CLAUDE_PLUGIN_DATA` 或插件安装目录；
- macOS/Linux、Windows 专用命令分别维护；
- 插件更新后重新审查 hook；
- 私有插件仓库使用最小化 Git 读取权限。

## 19. 验收标准

仓库初始化完成必须同时满足：

- `.claude-plugin/marketplace.json` 可解析；
- `.agents/plugins/marketplace.json` 可解析；
- 两个 Marketplace 中插件名称和数量一致；
- 每个插件有独立目录；
- 每个插件有 Claude Code manifest；
- 每个插件有 Codex manifest；
- 双 manifest 名称和版本一致；
- hook 配置不混用平台专属字段；
- 同一事件的多条检查由少量 dispatcher 调度，检查顺序和聚合语义明确；
- scripts 不引用插件目录外文件；
- Skill 是可选显式操作面，不复制 Hook 判定，也不是 Hook 生效的前置条件；
- 阻断、报告、上下文注入和状态推进分别有可验证的成功与失败路径；
- `claude plugin validate --strict .` 通过；
- Codex 能加载本地 Marketplace；
- 两个平台都能独立安装目标插件；
- 两个平台的新会话都真实触发 hook；
- 更新插件后可通过 Marketplace 获取新版本。

## 20. 官方资料

- [Claude Code：创建插件](https://code.claude.com/docs/en/plugins)
- [Claude Code：插件参考](https://code.claude.com/docs/en/plugins-reference)
- [Claude Code：创建和发布 Marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude Code：发现、安装与自动更新插件](https://code.claude.com/docs/en/discover-plugins)
- [Codex：插件概览](https://learn.chatgpt.com/docs/plugins)
- [Codex：打包插件](https://developers.openai.com/plugins/build/plugins)
- [Codex：Lifecycle Hooks](https://learn.chatgpt.com/docs/hooks)
