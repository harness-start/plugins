# Agent Prompt：harness-starter → harness-start/plugins 迁移（实现级）

> 给 coding agent 的**可执行工作单**。  
> 任务不是「列文件名再抄一遍 TypeScript」，而是：  
> **读透源 hook 的判定语义 → 对照目标仓已有插件的分层 → 重组成双平台自包含纯 JS 插件 → 按样板写测试并跑绿。**

路径：

| 角色 | 路径 |
| --- | --- |
| 源仓 | `/srv/workspaces/work/infra/harness-starter` |
| 目标仓 | `/srv/workspaces/work/harness-start/plugins` |
| 分组计划（背景） | `docs/migration-plan.md` |
| 仓库规范 | `GUIDE.md` |

**强制样板（写代码前必须打开对照，禁止凭空设计）：**

| 类型 | 打开这些目录 |
| --- | --- |
| 多 check 语言守卫 | `plugins/php-runtime-guards/`、`plugins/go-runtime-guards/` |
| 仅 Pre deny 路径 | `plugins/laravel-runtime-guards/` |
| 会话/状态机类 | `plugins/process-confidence/` |
| 行预算 | `plugins/file-line-budget-guard/` |

快照日期：2026-08-06。改 marketplace / 加插件前 `ls plugins/` 再核一次。

---

## 0. 任务参数（缺一则只做分析、不写代码）

| 参数 | 必填示例 |
| --- | --- |
| `LIST_ID` | `P12-batch1` |
| `PLUGIN_NAME` | `command-safety-guards` |
| `PLUGIN_VERSION` | `0.1.0` |
| `SOURCE_HOOKS` | 见 §6 勾选的**绝对或 skills/ 相对路径列表** |
| `EXEMPLAR` | 默认 `go-runtime-guards`（结构更短）或 `php-runtime-guards`（检查最多） |
| `OUT_OF_SCOPE` | 本批不迁的同源 hooks |
| `ALLOW_SOURCE_RETIRE` | 固定 `no` |

---

## 1. 先搞懂两边架构（迁移前必读）

### 1.1 源仓：一个 hook 文件 = 一个 `defineHook` 进程语义

源侧典型形态（摘自真实文件）：

```ts
// skills/command-safety-governance/src/hooks/cat-write-guard.ts
export const catWriteGuardHook = defineHook({
  id: "cat-write-guard",
  on: HookEventName.ToolBefore,          // → 目标 PreToolUse
  filter: { tools: [KnownTool.Bash] },
  failureMode: "fail-closed",
  blockingContract: { observedFacts, harm, unblockWhen, recovery },
  handle,                                // 读 event.tool.input.command
});

async function handle(event) {
  if (!RE.test(command)) return;
  if (isTmp) { event.report(...); return; }
  event.deny([...].join("\n"));          // 运行时封装好的 API
}
```

语言 lockfile 更「工厂化」：

```ts
// skills/go-engineering/src/hooks/go-dependency-lockfile-guard.ts
export const goDependencyLockfileGuardHook = defineDependencyLockfileGuard({
  lockfileNames: ["go.sum"],
  label: "Go",
  bypassPatterns: [[/\bgo\s+get\b.*-mod=mod\b/, "…"]],
});
// 真正逻辑在 core/hook-support/src/dependency-lockfiles.ts
```

债务类：

```ts
// skills/php-engineering/src/hooks/php-debt-guard.ts
on: HookEventName.ToolAfter,             // → 目标 PostToolUse
handle: collectNetNewDebtFindings(...)   // @harness/hook-support
event.deny(...)                          // 源侧 After 也可 deny
```

**源仓隐藏依赖（迁时必须拆开，不能 import）：**

| 源 API | 在哪 | 目标仓怎么落地 |
| --- | --- | --- |
| `defineHook` / `HookEvent` / `event.deny` / `event.report` | `@harness/core` | **不要**移植 defineHook。入口脚本自己 `readStdinJson` + `writeJson(preToolDeny\|additionalContextOutput)` |
| `defineDependencyLockfileGuard` | `hook-support/dependency-lockfiles.ts` | 抄 **已迁** `plugins/go-runtime-guards/scripts/checks/lockfile.mjs` 改 `LOCKFILE_NAMES` |
| `collectNetNewDebtFindings` | `hook-support/debt-guard-utils.ts` | 抄 `plugins/*/scripts/lib/debt-utils.mjs` + `checks/debt.mjs` 改 `PATTERNS` / 扩展名 |
| `getEventTargetFilePaths` | hook-support | `extractFilePath` + `patchTargetPaths`（`lib/patch-utils.mjs`） |
| `splitShellLogicalLines` / `tokenizeShell` | hook-support | 若源用了：要么精简移植进本插件 `lib/shell-tokenize.mjs`，要么对简单 RE 守卫先不移植完整 tokenizer（见 §3.2） |
| `readOperationalFacts` | hook-support 状态库 | **高成本**：`deny-escalation-guard` 依赖跨 hook 运营事实；首批可 **OUT_OF_SCOPE**，或先做进程内/文件状态（对齐 process-confidence 的 state 思路），禁止假装已有全局 operational facts |

### 1.2 目标仓：一个插件 = 一两个入口进程 + 多个纯函数 check

对照 **真实已存在** 的 `php-runtime-guards`：

```text
plugins/php-runtime-guards/
├── .claude-plugin/plugin.json      # hooks: ./hooks/claude.json
├── .codex-plugin/plugin.json       # hooks: ./hooks/hooks.json  + interface
├── hooks/
│   ├── claude.json                 # ${CLAUDE_PLUGIN_ROOT}
│   └── hooks.json                  # ${PLUGIN_ROOT}  ← Codex 用这个名字
├── scripts/
│   ├── php-hook-pre-tool.mjs       # 唯一 Pre 入口：分派 checks，first deny wins
│   ├── php-hook-post-tool.mjs      # 唯一 Post 入口：合并 reports
│   ├── checks/*.mjs                # 纯函数：collect* / *DenyMessage / matches+check
│   └── lib/
│       ├── hook-io.mjs             # stdin/stdout + preToolDeny + additionalContext
│       ├── matchers.mjs            # isWriteTool / isShellTool / normalizeToolName
│       ├── patch-utils.mjs         # Codex Bash 内嵌 apply_patch 抽路径
│       ├── debt-utils.mjs / git-utils.mjs / process-utils.mjs …
└── tests/
    ├── pre-tool.test.mjs           # collector 单测 + spawn 入口
    └── post-tool.test.mjs
```

**Pre 入口真实控制流**（`php-hook-pre-tool.mjs`，必须照这个形状写新插件）：

1. `readStdinJson()`；`__parseError` → exit 0  
2. `extractToolName` / `extractToolInput`；非 write 且非 shell → exit 0  
3. **fail-closed 检查按序**；任一 `collect*` 命中 → `writeJson(preToolDeny(msg))`；exit 0  
4. 可选 report（如 truncation）→ `writeJson(additionalContextOutput("PreToolUse", msg))`  
5. 干净路径：无 stdout，exit 0  
6. `main().catch(() => process.exit(0))` — 未捕获异常也 fail-open 于进程崩溃维度（deny 类逻辑本身 fail-closed）

**Post 入口真实控制流**（`go-hook-post-tool.mjs`）：

1. 解析工具与 targets（file_path + shell 里的 patch 路径）  
2. 对每个存在的文件跑 encoding / debt；对 primary 跑 syntax 子进程  
3. 报告拼成一段 → `additionalContextOutput("PostToolUse", …)`  
4. **Post 不做 deny**（双平台 Post 不能当硬拦截用）

### 1.3 语义对照表（源 → 目标，强制）

| 源 | 目标 |
| --- | --- |
| `HookEventName.ToolBefore` | hooks JSON `PreToolUse` + `*-hook-pre-tool.mjs` |
| `HookEventName.ToolAfter` | hooks JSON `PostToolUse` + `*-hook-post-tool.mjs` |
| `HookEventName.SessionStart` / Stop / Prompt | 对标 `process-confidence` 多入口；不要塞进 pre-tool |
| `event.deny(text)` | `writeJson(preToolDeny(text))` 且 text 内含 `blockingContract:` 四行（见 laravel/go lockfile 文案） |
| `event.report(text)` | `writeJson(additionalContextOutput(eventName, text))` |
| `filter.tools: [Bash]` | matcher 字符串含 `Bash\|bash\|Shell\|shell\|…`；入口里 `isShellTool` |
| `filter.tools: [Edit,Write,…]` | matcher 含 Write/Edit/MultiEdit/ApplyPatch/apply_patch；`isWriteTool` |
| 源 After + `event.deny`（如 php-debt） | **降级为 Post report**（与 php/go 现状一致），README 写明「硬门禁不在 Post」 |
| 一个 Skill 多个 hook 文件 | **合成 1 个插件、1 个 Pre 入口、N 个 checks/**，不要 N 个 command hook 注册（migration-plan P1） |
| `priority` 数字 | 目标用入口内 **调用顺序** 表达（先 deny 后 report） |
| `platforms: [Claude, Codex]` | 两份 hooks JSON + 一份 scripts |
| `@harness/*` | 禁止出现在目标 import |

### 1.4 平台 I/O 契约（测试必须锁住）

Deny 输出形状（与 `php`/`go` 测试一致）：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "…含 blockingContract…"
  }
}
```

Report：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "…"
  }
}
```

入口子进程：`spawn(process.execPath, [script])`，stdin 写 JSON，断言 `code === 0`（deny 也是 0 + JSON，不是 exit 2——与当前样板一致）。

hooks matcher **原样复制样板**（不要自己发明子集）：

```text
apply_patch|ApplyPatch|Bash|bash|Edit|exec|exec_command|local_shell|MultiEdit|NotebookEdit|Shell|shell|shell_command|Write
```

---

## 2. 强制工作法：分析 → 重组设计 → 实现 → 测试

### Phase A — 源实现解剖（每个 SOURCE_HOOK 一张表）

对列表中每一个 `.ts`，读完整 `handle` / factory 配置，填：

| 字段 | 写什么（禁止空话） |
| --- | --- |
| 文件 | `skills/.../hooks/xxx.ts` |
| 事件 | ToolBefore / ToolAfter / … |
| 工具 | Bash only / Write 族 / 两者 |
| 判定输入 | `command` 字符串？`file_path`+content？patch 文本？git HEAD？ |
| 命中条件 | **贴正则或伪代码**，含排除条件（tmp、pipe、backup suffix…） |
| 决策 | deny / report / 条件分支（如 tmp 仅 report） |
| 文案要点 | 标题标签、`blockingContract` 四要素原文或等价 |
| 外部依赖 | 纯 RE / hook-support 工厂 / 读磁盘 / 读 operational facts / 跑子进程 |
| 依赖可迁性 | 低（纯逻辑）/ 中（工厂可抄样板）/ 高（状态库、跨 hook） |
| 目标 check 文件名 | 预定 `scripts/checks/<name>.mjs` |
| 导出函数名 | 对齐样板：`collectX` + `xDenyMessage` 或 `matches`+`check`+`formatReport` |

**同时打开 1 个样板插件**，在分析表加一列「对标文件」：

- Bash deny → 对标 `laravel` protected-paths 的 message 形状 + `php-hook-pre-tool` 的 dispatch  
- lockfile → 对标 `go-runtime-guards/scripts/checks/lockfile.mjs`  
- debt/encoding → 对标 `go-runtime-guards/scripts/checks/debt.mjs` + `encoding.mjs`  
- 状态机 → 对标 `process-confidence/scripts/lib/*`

Phase A 产出不完整 → **禁止 Phase B**。

### Phase B — 重组设计（写代码前输出目录树）

必须输出将要创建的树，例如 P12 batch1：

```text
plugins/command-safety-guards/
├── .claude-plugin/plugin.json
├── .codex-plugin/plugin.json
├── hooks/claude.json
├── hooks/hooks.json
├── scripts/
│   ├── cmd-safety-hook-pre-tool.mjs    # 唯一入口
│   ├── checks/
│   │   ├── cat-write.mjs
│   │   ├── sed-inplace.mjs
│   │   ├── dangerous-command.mjs
│   │   └── (deny-escalation 若本批不做则不要建空文件)
│   └── lib/
│       ├── hook-io.mjs                 # 从 EXEMPLAR 复制，勿改公共 API
│       └── matchers.mjs                # 从 EXEMPLAR 复制
├── tests/pre-tool.test.mjs
├── README.md
└── CHANGELOG.md
```

**入口内 check 顺序**（P12 建议，仿 php first-deny-wins）：

1. `dangerous-command`（破坏面最大）  
2. `sed-inplace`  
3. `cat-write`  
4. （后续）secret / escalation  

### Phase C — 实现规则（对着样板抄结构）

1. **复制 lib，不重写 hook-io**  
   ```bash
   # 在目标仓根
   EX=plugins/go-runtime-guards
   NEW=plugins/$PLUGIN_NAME
   mkdir -p $NEW/scripts/lib $NEW/scripts/checks $NEW/tests
   cp $EX/scripts/lib/hook-io.mjs $EX/scripts/lib/matchers.mjs $NEW/scripts/lib/
   # 若 check 需要 patch / git / debt：
   # cp $EX/scripts/lib/patch-utils.mjs debt-utils.mjs git-utils.mjs process-utils.mjs …
   ```
2. **check 文件零 I/O 到 stdout**；只导出纯函数。stdout 只允许入口 `writeJson`。  
3. **正则与排除逻辑从源 `handle` 原样搬**（变量名可 JS 化），不要「凭记忆重写规则」导致行为漂移。  
4. **deny 文案**：源中文/英文说明可保留；**必须追加**与 go lockfile 同结构的：
   ```text
   blockingContract:
     observedFacts: …
     harm: …
     unblockWhen: …
     recovery: …
   ```
   若源已有 `blockingContract` 对象，把四字段编进字符串（见 cat-write 的 contract + deny 长文合并）。  
5. **manifest** 抄 `go-runtime-guards` 的 plugin.json，改 name/description/version。  
6. **hooks JSON** 抄 go 的 claude.json / hooks.json，只改 script 文件名与 statusMessage。  
7. **marketplace** 两处各加一条（与现有 php/go 条目同级字段）。

### Phase D — 测试（对照 `go-runtime-guards/tests/pre-tool.test.mjs`）

每个 deny check 最少：

```js
// 1) collector 正例
test("cat-write: heredoc redirect is hit", () => {
  assert.equal(catWriteHit(`cat > src/a.php <<'EOF'\nx\nEOF`), true);
});
// 2) 排除
test("cat-write: pipe heredoc allowed", () => {
  assert.equal(catWriteHit(`cat <<EOF | sh\nEOF`), false);
});
// 3) 文案
test("cat-write: message has blockingContract", () => {
  assert.match(catWriteDenyMessage("…"), /blockingContract/);
  assert.match(catWriteDenyMessage("…"), /observedFacts/);
});
// 4) 入口 spawn
test("entry: denies cat heredoc write", async () => {
  const { code, stdout } = await runHook(PRE, {
    tool_name: "Bash",
    tool_input: { command: "cat > /repo/a.txt <<'EOF'\nhi\nEOF" },
  });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
});
// 5) 清洁路径
test("entry: clean bash exits empty", async () => {
  const { code, stdout } = await runHook(PRE, {
    tool_name: "Bash",
    tool_input: { command: "ls -la" },
  });
  assert.equal(code, 0);
  assert.equal(stdout, "");
});
// 6) 小写工具名（Codex）
test("entry: tool_name bash still denies", async () => { /* shell 小写 */ });
```

跑：

```bash
cd /srv/workspaces/work/harness-start/plugins
find plugins/$PLUGIN_NAME/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
node --test plugins/$PLUGIN_NAME/tests/*.test.mjs
bash scripts/ci/validate-plugins.sh   # 环境允许时
```

---

## 3. 按源模式的重组配方（照方抓药）

### 3.1 配方 L — Lockfile 工厂（源：`defineDependencyLockfileGuard`）

| 步骤 | 动作 |
| --- | --- |
| 读源 | `lockfileNames`、`label`、`bypassPatterns`、文案用的 generatedBy |
| 复制 | `plugins/go-runtime-guards/scripts/checks/lockfile.mjs` → 本插件或语言插件 `checks/lockfile.mjs` |
| 改 | `LOCKFILE_NAMES`、`lockfileDenyMessage` 标题、`generatedBy` 字符串 |
| 入口 | 已有语言插件：挂进现有 `*-hook-pre-tool.mjs` 的 lock 段；新建则仿 `go-hook-pre-tool.mjs`（**整文件只有 lock 一段**） |
| 测试 | 抄 `go-runtime-guards/tests/pre-tool.test.mjs`，换 lock 文件名 |

**已落地对照：** go.sum / poetry.lock 等均在各 `*-runtime-guards` 的 `checks/lockfile.mjs`。

### 3.2 配方 B — Bash 字符串守卫（源：独立 `defineHook` + RE）

代表：`cat-write-guard.ts`、`sed-inplace-guard.ts`。

| 源结构 | 目标结构 |
| --- | --- |
| 文件顶层 RE / `test(cmd)` | `export function hit(command)` 或 `collectHits(command)` |
| `isInTmp` / `isPipeInput` | 同文件 private 函数，逻辑不删 |
| `event.report` 分支 | 入口里：若 hit && soft → `additionalContextOutput`；若 hit && hard → `preToolDeny` |
| `event.deny` | `preToolDeny(denyMessage(command, reason))` |

**不要**为每个 Bash 守卫注册单独 hooks.json 条目。全部进同一个 `cmd-safety-hook-pre-tool.mjs`。

`dangerous-command-guard.ts` 更重：自带 wrapper 剥离、`tokenizeShell` 依赖。重组策略：

1. 优先把源文件里 **判定函数**（`commandInvocation`、危险目标检测）整段搬到 `checks/dangerous-command.mjs`，去掉 `@harness/*` import。  
2. `splitShellLogicalLines` / `tokenizeShell`：从  
   `SOURCE_ROOT/core/hook-support/src/` 对应模块 **读懂后精简移植** 到 `scripts/lib/shell-parse.mjs`（仅本插件需要的函数，不整包 vendor）。  
3. 若单批时间不够：可先移植「明显 rm -rf /」等高频 RE 子集，但必须在 README `Known gaps` 写明与源完整解析的差异——**默认要求完整语义**，子集只在用户参数允许时。

### 3.3 配方 D — Debt / Debug（源：ToolAfter + net-new）

| 源 | 目标 |
| --- | --- |
| `PATTERNS: DebtPattern[]` | `checks/debt.mjs` 内 `PATTERNS` 常量 |
| `collectNetNewDebtFindings` | `lib/debt-utils.mjs` 的 `readDebtTextPair` + 本地 count 差分（见 go `debt.mjs`） |
| `event.deny` on After | **改为 report**（平台限制），标签保留 `[Xxx Debt Guard]` |
| 扩展名过滤 | `shouldScanFile(filePath, { extensions: […] })` |

对标文件：`plugins/go-runtime-guards/scripts/checks/debt.mjs` + `lib/debt-utils.mjs`。

### 3.4 配方 P — Protected paths

对标：`plugins/laravel-runtime-guards/scripts/checks/protected-paths.mjs`  
模式数组 + `protectedPathViolation` + `protectedPathDenyMessage`；入口对 `extractWriteTargets` 循环。

### 3.5 配方 E — Encoding / Syntax 子进程

对标：`go`/`php` 的 `encoding.mjs`、`syntax.mjs`  
`matches` → `check`（可 async）→ `formatReport`；缺二进制 skip。

### 3.6 配方 S — 有状态 / 跨 hook（高成本）

代表：`deny-escalation-guard.ts`（`readOperationalFacts`）、task-ledger 一族、process-confidence。

1. 先读 `plugins/process-confidence/scripts/lib/session-state.mjs` 等，看目标仓已有状态落盘约定。  
2. 源依赖「dispatch 层写 operational facts」——**目标仓插件运行时没有等价全局层**。  
3. 迁移选项（Phase A 必须选一个写进设计）：  
   - **延期**（推荐进 OUT_OF_SCOPE）  
   - **插件内自建 JSONL 状态**（PLUGIN_DATA 目录），只统计本插件历史 deny  
   - **与 process-confidence 协作**（读其 receipt 目录——需稳定 schema，禁止脆相对路径）  

禁止：空实现却登记 hook。

### 3.7 配方 I — 注入 / Primer（SessionStart、UserPrompt）

源：`*-env-detector.ts`、`harness-overview-injector.ts`。  
对标：`process-confidence` 的 session-start / user-prompt 入口。  
输出：`additionalContext` 或平台等价注入；要做去重（session 级 state），避免每次 prompt 灌屏。

---

## 4. 完整范例：P12-batch1 `command-safety-guards`（按此做即达标）

### 4.1 源解剖结论（已读文件，agent 仍需自己打开核对）

| 源文件 | 事件 | 输入 | 核心逻辑 | 目标 check | 难度 |
| --- | --- | --- | --- | --- | --- |
| `skills/command-safety-governance/src/hooks/cat-write-guard.ts` | ToolBefore / Bash | `command` | `CAT_HEREDOC_WRITE_RE`；pipe 放行；`/tmp` report；否则 deny | `checks/cat-write.mjs` | 低 |
| `…/sed-inplace-guard.ts` | ToolBefore / Bash | `command` | 裸 `sed -i` / `--in-place`；排除 `.bak`/空后缀 | `checks/sed-inplace.mjs` | 低 |
| `…/dangerous-command-guard.ts` | ToolBefore / Bash | `command` | tokenize + 剥 sudo/env/xargs；拦宽路径 `rm -rf` 等 | `checks/dangerous-command.mjs` + 可能 `lib/shell-parse.mjs` | 中高 |
| `…/deny-escalation-guard.ts` | ToolBefore / 多工具 | 状态 | `readOperationalFacts`，≥3 回合 deny 熔断 | **本批 OUT_OF_SCOPE** | 高 |

### 4.2 目标导出 API（建议固定，测试按此写）

**`checks/cat-write.mjs`**

```js
export function catWriteClassification(command)
// → { action: "allow" } | { action: "report", reason } | { action: "deny", reason }
export function catWriteDenyMessage(command)
export function catWriteReportMessage(command)
```

把源里的 `CAT_HEREDOC_WRITE_RE` / `isInTmp` / `isPipeInput` **逐行搬入**。

**`checks/sed-inplace.mjs`**

```js
export function sedInplaceHit(command) // boolean
export function sedInplaceDenyMessage(command, detail?)
// SED_INPLACE_PATTERNS[].test 逻辑原样
```

**`checks/dangerous-command.mjs`**

```js
export function dangerousCommandHits(command) // string[] reasons or []
export function dangerousCommandDenyMessage(hits)
// 从源移植 commandInvocation + 危险目标判定
```

**`scripts/cmd-safety-hook-pre-tool.mjs`**（结构对齐 php pre）：

```js
const event = await readStdinJson();
// …
if (!isShell && !isWrite) process.exit(0); // escalation 批再开 write；batch1 以 shell 为主
const command = extractShellCommand(...) ?? "";
// 1 dangerous → deny
// 2 sed → deny
// 3 cat → deny | report
process.exit(0);
```

### 4.3 参数表（调度者可直接贴）

```text
LIST_ID=P12-batch1
PLUGIN_NAME=command-safety-guards
PLUGIN_VERSION=0.1.0
SOURCE_ROOT=/srv/workspaces/work/infra/harness-starter
TARGET_ROOT=/srv/workspaces/work/harness-start/plugins
SOURCE_HOOKS=
  skills/command-safety-governance/src/hooks/cat-write-guard.ts
  skills/command-safety-governance/src/hooks/sed-inplace-guard.ts
  skills/command-safety-governance/src/hooks/dangerous-command-guard.ts
EXEMPLAR=plugins/php-runtime-guards
OUT_OF_SCOPE=
  deny-escalation-guard.ts（依赖 operational facts）
  agentic-ai-security-assessment/*、db-ha-replication/*、…
ALLOW_SOURCE_RETIRE=no
```

### 4.4 本批 DoD

- [ ] 三 check + 一 pre 入口 + 双 hooks JSON + 双 manifest + 双 marketplace  
- [ ] lib 从 exemplar 复制，无 `@harness`  
- [ ] `node --test`：每 check 正例/反例 + blockingContract + 入口 deny + 清洁 bash + 小写 `bash`  
- [ ] README 写 Migrated from 三文件映射 + Known gaps（escalation）  
- [ ] 不改源仓  

---

## 5. 完整范例：给已有语言插件「补一个未迁 check」

场景：`LIST_ID=P4-补迁-go-tool-output-primer`，插件已存在。

1. 读源 `skills/go-engineering/src/hooks/go-tool-output-primer.ts` 全文。  
2. 判定是 Pre report 还是 Post report；看是否只匹配 go 文件/go 命令。  
3. 打开 `plugins/go-runtime-guards/scripts/go-hook-post-tool.mjs`（或 pre），**在 reports 数组管道中加一段**，不要新建 hooks 注册。  
4. 新增 `checks/tool-output-primer.mjs`，测试加在 `tests/post-tool.test.mjs`。  
5. 更新 README 行为表与 CHANGELOG。  
6. **禁止**再登记第二个 marketplace 插件名。

---

## 6. 迁移清单（状态 + 源文件；执行时只勾一项）

### 6.1 状态图例

✅ 已落地 · 🟡 部分/收口 · ⬜ 未建 · ⛔ 不迁

### 6.2 基建

| ID | 状态 | 做什么 | 对标 |
| --- | --- | --- | --- |
| INFRA-1 | ⬜ | `shared/` 从 hook-support 抽纯 JS | 现各插件 `scripts/lib` 重复副本 |
| INFRA-2 | ⬜ | `sync-shared-lib.mjs --check` | GUIDE 共享三种途径之「复制」 |
| INFRA-3 | ⬜ | `tests/helpers/hook-harness.mjs` | 抽 go/php 测试里的 `runHook` |
| INFRA-4～7 | ⬜/🟡 | schema、hooks-contracts、CI node--test、acceptance 门禁 | `scripts/ci/validate-plugins.sh`、`docs/acceptance-matrix.md` |

### 6.3 插件总序与状态

| ID | 插件 | 状态 | 重组策略 | 优先对标 |
| --- | --- | --- | --- | --- |
| P0a | process-confidence | 🟡 | 补测试；入口统一 hook-io | 自身 |
| P0b | file-line-budget-guard | 🟡 | 补 `tests/`；Codex `hooks/codex.json`→与主流 `hooks.json` 对齐评估 | php post 单脚本 |
| P1 | php-runtime-guards | 🟡 | 已有 dispatcher；补 phpstan/env 用配方 E/I | 自身 |
| P1b–e | laravel/thinkphp/webman/symfony | ✅/🟡 | 路径/框架规则已按配方 P | laravel protected-paths |
| P2–P6 | ts/python/go/rust/jvm-runtime-guards | 🟡 | 核心 L+D+E 已有；补 env/lint 用 §5 | go-runtime-guards |
| P7 | web-frontend-guards | ⬜ | **新建**；encoding+syntax 为主，env 第二批 | php 双入口 |
| P8 | infra-devops-guards | ⬜ | **新建**；syntax + dangerous deny + lint report | php pre + go post |
| P9 | mobile-guards | ⬜ | **新建** | go |
| P10 | misc-lang-guards | ⬜ | **新建**或按语言拆 MR；lockfile 用配方 L 批量 | go lockfile |
| P11 | git-delivery-guards | ⬜ | **新建**；Bash 族配方 B + 部分状态 | php pre |
| **P12** | **command-safety-guards** | ⬜ | **新建；见 §4 完整范例** | php pre |
| P13 | execution-discipline-guards | ⬜ | 配方 S+I；与 process-confidence 事件叠加 | process-confidence |
| P14 | delivery-evidence | ⬜ | Stop 门禁；证据目录对齐 process-confidence | process-confidence |
| P15 | context-rules | ⬜ | 注入类配方 I | process-confidence session-start |

**推荐下一刀：`P12-batch1`（§4）。**

### 6.4 源 hooks 明细与落点（重组视图）

#### P1 php 族

| 源 `php-engineering/hooks/*` | 目标现状 | 重组动作 |
| --- | --- | --- |
| composer-repositories / unicode-escape / dependency-lockfile / protected-paths / test-output-truncation | 已在 `php-runtime-guards/checks/*` | 无 |
| php-syntax / syntax-composer / encoding / debt / debug-statement | 已在 post checks | 无 |
| composer-hook-utils | 已内联 | 无 |
| php-env-detector | 未迁 | 新 check + SessionStart 入口或并入 pre report；配方 I |
| php-lint-phpstan / phpstan-stop / phpstan-hook-state | 未迁 | post report + 可选 stop 入口；状态用 PLUGIN_DATA；对照 process-confidence 再定 |
| symfony 三 hooks | 已在 symfony-runtime-guards | 无 |
| laravel/thinkphp/webman 仅 env | 不迁 env；路径守卫为新建 | 保持 |

#### P2–P6 语言插件（模式相同）

每语言源 hooks ≈ lockfile + encoding + debt + syntax + env +（可选 lint/primer）。  
目标已实现前四类（rust 无独立 syntax 文件则在 post 启发式）。  
**补迁时只加 check + 改入口 dispatch，禁止新插件名。**

| 语言插件 | 源 Skill | 未迁代表 |
| --- | --- | --- |
| typescript-runtime-guards | typescript-engineering, nestjs-layering-patterns | env, eslint, nestjs-env；确认 any/suppression 是否已进 debt |
| python-runtime-guards | python-engineering | env, ruff, coverage-primer |
| go-runtime-guards | go-engineering | env, lint-coverage-primer, tool-output-primer |
| rust-runtime-guards | rust-engineering | env, tauri-env, debug-statement |
| jvm-runtime-guards | jvm-engineering | java/kotlin env |

#### P7 web-frontend-guards ⬜ — 建议首批文件

| 源 | 建议 check | 配方 |
| --- | --- | --- |
| frontend-design-taste/frontend-encoding-guard.ts | encoding.mjs | E |
| wechat…/frontend-syntax-wxml.ts wxss.ts | syntax-wxml.mjs … | E |
| tarojs…/frontend-syntax-taro-dom.ts | syntax-taro.mjs | E |
| svelte-engineering/svelte-syntax.ts | syntax-svelte.mjs | E |
| nuxt-engineering/vue-syntax.ts | syntax-vue.mjs | E |
| wechat…/wechat-miniprogram-config-guard.ts | miniprogram-config.mjs | B/P |
| 全部 `*-env-detector.ts` | 第二批 SessionStart | I |
| vue-sfc-edit-primer / stylelint primer | 第二批 report | I |

入口：`web-hook-pre-tool.mjs`（config deny）+ `web-hook-post-tool.mjs`（encoding/syntax）。  
对标目录：复制 `php-runtime-guards` 整树再删 PHP checks。

#### P8 infra-devops-guards ⬜ — 建议首批

| 源 | 动作 |
| --- | --- |
| devops-syntax-yaml/dockerfile + linux-syntax-bash/zsh | post/pre syntax 配方 E |
| infrastructure-encoding-guard | encoding |
| devops-dangerous-infra-guard / devops-production-kubectl-guard / pve-destructive-operation-guard | pre deny 配方 B |
| *lint* / terraform-fmt / actionlint / kubeconform | post report，缺二进制 skip |
| infrastructure-dependency-lockfile-guard | 配方 L |

#### P9 mobile-guards ⬜

ios encoding/lint/objc patterns；dart lockfile+syntax；env 第二批。对标 go。

#### P10 misc-lang-guards ⬜

批量 lockfile（ruby/dotnet/…）= 多次配方 L 可同插件多 `LOCKFILE_NAMES` 或 checks 参数化。  
encoding/syntax/env 分批。

#### P11 git-delivery-guards ⬜

| 源 | 动作 |
| --- | --- |
| git-destructive / partial-staging / add / commit-* / branch-naming | pre Bash 配方 B；从 ci-gated-mr-workflow hooks 搬 RE |
| merge-conflict-guard | pre 读文件或 patch 内容 |
| svn-* / git-stale-lock | 第二批 |
| context-injector | 配方 I，注意与 process-confidence 重复 |

#### P12 command-safety-guards ⬜

见 **§4**。后续批：

| 批 | 源 |
| --- | --- |
| batch2 | agentic-ai-security-assessment：secret-leak/read, log-pii, insecure-tls |
| batch3 | db-ha-replication 四 hooks |
| batch4 | ethical-hacking active-test-scope；lark-cli-confirmation-audit |
| batch5 | deny-escalation（配方 S） |

#### P13 execution-discipline-guards ⬜

| 源簇 | 动作 |
| --- | --- |
| execution-loop-governance 四件 | 状态计数；PLUGIN_DATA；对照 process-confidence |
| language-output-governance | bash/tool report + stop gate |
| runtime-governance | 门禁与 syntax-json/xml；provenance |
| long-task-context-governance | **收敛** support/types 进 lib，不要 6 个 hook 注册 |
| find-skill 二守卫 | pre deny 配方 B |

#### P14 delivery-evidence ⬜

各 `*-completion-gate.ts` + agentic-fix-review-gate → Stop/Post 检查证据文件是否存在；**状态与目录对齐 process-confidence receipt**。先读 `plugins/process-confidence/docs/` 与 `schemas/`。

#### P15 context-rules ⬜

injector/reminder/prompt-guidance → SessionStart/UserPrompt；预算去重；skill-routing 的 registry 多文件收成 lib。

#### P0b 旁支

| 源 | 动作 |
| --- | --- |
| file-budget-guard.ts | 已有脚本；补测试 |
| backup-artifact-guard / debt-marker-guard | 评估并入 P0b 或 P12/语言 debt，防双写 |

### 6.5 单任务勾选（复制到交付报告）

```text
[ ] LIST_ID / PLUGIN_NAME / SOURCE_HOOKS 已填且来自 §6
[ ] Phase A 每源文件解剖表完成（含正则/依赖/对标路径）
[ ] Phase B 目录树与 check 顺序已写出
[ ] 从 EXEMPLAR 复制 lib，无 @harness import
[ ] checks 纯函数；入口唯一分派；first deny wins
[ ] 双 manifest + hooks/claude.json + hooks/hooks.json
[ ] 双 marketplace 登记
[ ] 测试：collector + message + spawn deny + clean + 小写工具名
[ ] node --check && node --test 实际全绿（贴输出）
[ ] README Migrated from + Known gaps；CHANGELOG
[ ] 未改 SOURCE_ROOT
```

---

## 7. 反模式（出现即返工）

| 反模式 | 正确 |
| --- | --- |
| 把 `.ts` 改后缀当 `.mjs` 仍 `import @harness` | 拆 defineHook，用 hook-io |
| 每个源 hook 注册一条 hooks command | 一插件一事件一进程 |
| 不读 go/php 样板自己发明 JSON 形状 | 抄 preToolDeny / 测试断言 |
| Post 里 deny | 只 report；硬拦放 Pre |
| 清单一次做 P12 全部含 escalation | 按 batch；高依赖延期 |
| 只写 checks 不写 spawn 测试 | 入口契约必测 |
| 伪造 acceptance-matrix 真机结果 | 标 ⏳ |
| 新建 `shared` 运行时引用 | 复制进插件内 lib |

---

## 8. 启动话术（调度者）

```text
按 docs/migration-agent-prompt.md 执行 LIST_ID=P12-batch1。
必须先完成 §2 Phase A 源解剖表（对照 §1 架构与 §4 范例），再按 §3 配方实现。
实现必须复制 plugins/php-runtime-guards 或 go-runtime-guards 的 lib/入口形态，
禁止 @harness 依赖。测试对齐 go-runtime-guards/tests/pre-tool.test.mjs。
跑通 node --test 并贴输出。SOURCE_HOOKS 不得超出 §4.3。不要改 harness-starter。
```

换任务时只改 `LIST_ID` 与参数表；**重组方法仍以 §1–§3 为准，清单 §6 只解决「迁谁」。**
