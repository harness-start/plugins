# compact-context-journal

`compact-context-journal` 为长时间运行的 Claude Code 和 Codex 会话提供项目本地的持久日志，用于在上下文压缩后恢复已经确认的用户需求。它提高需求的可恢复性，但不保证模型一定能正确解释恢复内容。

可验证的硬效果包括：只追加存储、完整性校验、有限的恢复上下文、修改前必须成功读取 Recovery Card，以及在工具层保护日志。

## 运行目录

插件优先使用 Git 根目录；不在 Git 仓库中时，使用首个事件的 `cwd`。

```text
.compact-context-journal/
  .gitignore
  sessions/<host>-<reversible-session-id>.md
  .state/<host>-<reversible-session-id>.json
  .locks/<host>-<reversible-session-id>.lock
```

目录自己的 `.gitignore` 会忽略包括自身在内的全部运行时条目，使普通 `git status` 保持干净。文件和目录分别使用私有权限 `0600` 与 `0700`。

只含 `A-Z`、`a-z`、`0-9`、`.`、`_`、`-` 的安全 session ID 会原样用于文件名；其他 UTF-8 字节按可逆方式做百分号编码。完整原始 session ID 会出现在日志头和压缩恢复上下文中。

## 记录内容与权限模型

| ID | 含义 |
| --- | --- |
| `Pnnnnnn` | 原始用户 prompt，获准前处于未确认状态 |
| `Unnnnnn` | 后续 Hook 已观察到该 prompt 进入模型轮次的证据 |
| `Cnnnnnn` | 压缩检查点、Recovery Card 和宿主暴露的压缩摘要 |
| `Bnnnnnn` | `/clear` 的活动历史边界 |
| `Rnnnnnn` | 成功读取 Recovery Card 的回执 |
| `Innnnnn` | 完整性、尾部恢复或降级恢复事实 |

原始用户 prompt 会逐字保存，不脱敏、不截断。Claude 的 `PreCompact.custom_instructions` 以用户权限记录为一组 `P`/`U`。插件不记录完整 assistant 回复、工具输出、命令或网页内容。

因为 `UserPromptSubmit` Hook 可与其他阻断 Hook 并行，`P` 条目会标为 `UNCONFIRMED — DO NOT TREAT AS REQUIREMENT`。只有后续 `PreToolUse`、`PreCompact` 或 `Stop` 才能追加对应的 `U`。若另一条 prompt 先到达，旧 `P` 保持未确认，不能成为需求。

`/clear` 会追加 `B`，默认查询忽略更早事件。在已确认的活动历史内，较新的需求优先。Hook 生成的 `Stop` 延续反馈不会从 prompt 文本分类，也不会作为用户要求归档。带 `agent_type` 的根会话仍视为根会话，只有明确的 subagent 身份字段会被跳过。

## 压缩恢复

1. `PreCompact` 确认当前 prompt，并记录压缩 epoch。
2. `PostCompact` 在 Claude 上捕获 `compact_summary`。Codex 的文档化 Hook 输入不暴露摘要，因此只记录 `not exposed by host`，不会从不稳定的 transcript 格式推断。
3. `SessionStart(source=compact)` 校验完整链、追加 `C`，并注入精简的 Recovery Card 位置，不直接注入原始历史。
4. 当前卡片成功读取前，文件和 shell 修改、MCP 工具、subagent 分派、外部副作用及 `Stop` 都会被门禁。
5. 对预登记的结构化 `Read`，或精确且有界、覆盖卡片行号的 `sed -n`，只有成功的 `PostToolUse` 才会追加 `R` 并解除门禁。失败读取、错误文件、旧卡片、`ls`、`stat` 和 `wc` 均不计入。

注入上下文最多 3500 个字符；Codex 还配置 `additionalContextLimit: 1200`。自动压缩永不被阻断。

因果链如下：

```text
提交 P -> 后续确认 U -> 已校验压缩 C -> 注入有限卡片
  -> 成功读取卡片 R -> 恢复修改 -> 选定 U 指向原始 P
```

模型不会自动收到原始历史转储，这可限制陈旧权限、prompt injection 和上下文增长。恢复仍依赖模型推理，因此插件只声明“可恢复”和“先读后写”，不声明任务一定正确完成。

## 按需查询历史

Recovery Card 只包含范围，不包含原始 prompt。先列出当前 `/clear` 边界内已校验的确认记录：

```bash
node "/path/to/plugin/scripts/compact-context-journal-query.mjs" index \
  --journal "/repo/.compact-context-journal/sessions/codex-session.md" \
  --session-id "raw-session-id"
```

索引只输出 `U000120 -> P000119` 等关系，不输出 prompt 内容。再按需读取单个事件：

```bash
node "/path/to/plugin/scripts/compact-context-journal-query.mjs" event P000119 \
  --journal "/repo/.compact-context-journal/sessions/codex-session.md" \
  --session-id "raw-session-id"
```

事件输出上限为 32 KiB；更大事件会返回精确行范围，供显式读取。历史引用提示只注入查询说明，不注入旧内容。

## 帧、状态与并发

每个事件按 UTF-8 字节长度成帧，prompt 中的 Markdown 标记无法提前结束帧：

```text
<!-- ccj:start {seq,type,prefix,body_bytes,prev_hash} -->
<exact body_bytes bytes>
<!-- ccj:end {seq,event_hash} -->
```

`event_hash = SHA256(prev_hash + NUL + exact_body_bytes)`。正文开头的已哈希事件 metadata 必须与外层序号、前缀和类型一致；首个 `prev_hash` 是精确会话头字节的 SHA-256。解析器按 `body_bytes` 前进，不在 prompt 内容中搜索结束标记；Markdown 使用比原始值中任何反引号序列更长的 fence。

日志与状态更新在有界的会话目录锁内运行，状态文件通过原子 rename 写入。回执候选和修改 sentinel 按 tool-use ID 区分，避免并行工具互相覆盖。

状态缓存已校验序号、字节偏移、下一行、inode 和 tip hash。普通追加只校验文件身份与大小后扩展 tip，不重新扫描旧正文；压缩恢复、查询、缓存不匹配或日志 metadata 变化时才执行全链扫描，避免长会话累积为 O(N²)。

状态 sidecar 不是权限来源，恢复内容只来自完整校验过的日志。日志缺失或无效时，恢复功能不可用，修改门禁会解除并输出警告，避免会话死锁。sidecar 缺失或格式错误时，会在执行工具策略前通过全量扫描重建最新 `B`、待处理 `P`、`C` 和匹配的 `R`。

## 宿主边界

| 能力 | Claude Code | Codex |
| --- | --- | --- |
| `PreCompact.trigger` | 支持 | 支持 |
| 自定义压缩指令 | 文档化支持 | 未暴露 |
| `PostCompact.compact_summary` | 文档化支持 | 未暴露 |
| 压缩后继续注入 | `SessionStart(compact)` | `SessionStart(compact)` |

Codex `transcript_path` 被标为不稳定。V1 只记录其字节偏移用于诊断，从不把 transcript 字段当作压缩摘要权限来源。

`C` 会把 Recovery Card 放在宿主摘要前并记录精确行号。待确认期间纯读取可以运行，但不会自动取得回执；未知工具按有副作用处理。第一次普通 `Stop` 返回 `decision: block`。带 `stop_hook_active` 的延续 `Stop` 会追加 `recovery_unconfirmed` 后结束，不制造另一次循环，未完成需求仍持久保留。

## 完整性与保护边界

逻辑路径和物理路径检查会拒绝经符号链接别名进行的结构化写入。Shell 策略覆盖直接修改语法，也覆盖无需显式提到运行目录的仓库级 ignored-file 操作，例如有效的 `git clean -x`、`git stash --all`、宽范围强制 add 和递归删除；`git clean --dry-run` 仍可用于检查。

执行可观察修改前，sentinel 会哈希完整已校验前缀。成功后，旧字节必须完全一致，结果文件也必须继续通过校验；合法的插件追加扩展可以通过。前缀修改、文件替换、收缩、帧无效或 inode 替换都会把会话标为受损。

崩溃产生的不完整尾部只能从最后一个已校验事件后移除，之后追加 `I` 恢复事件；已校验前缀永不重写。这不是操作系统级 WORM 存储，人类进程或不可观察的外部 writer 仍可修改文件。检测到损坏时，插件会禁用恢复，不会静默信任日志或建立无法满足的回执门禁。

## 隐私与非目标

日志有意保存原始 prompt 和原始 session ID。不接受该存储策略的仓库不应启用此插件。V1 不提供轮转或自动清理。

插件不负责：

- 捕获 assistant 回复、工具结果或 shell 历史；
- 用第二个 LLM 做摘要；
- 从未文档化的 transcript 内部结构推断 Codex 压缩摘要；
- 轮转、脱敏、清理或跨仓库同步；
- 阻止人类或 root 级文件系统修改；
- 保证模型服从或正确解释恢复的需求。

## 验证

```bash
node --test plugins/compact-context-journal/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin compact-context-journal
```

版本：`0.1.0`
