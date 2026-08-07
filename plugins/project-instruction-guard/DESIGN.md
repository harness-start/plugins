# project-instruction-guard 设计

## 责任边界

插件治理根级项目指令的结构、受管区和本轮验证时序。它不解释业务规则是否正确，不自动解决互相冲突的规则，也不扫描或重写项目中的其他说明文件。

Hook 负责观察与门禁，Skill/CLI 负责写入。Hook 自己不改项目文件；CLI 的每次变更都需要从 inspect 得到的 `stateDigest`，因此并发变化会以 CAS 失败结束。

## 状态机

```text
SessionStart inspect
       |
       +-- invalid ------------------------------+
       |                                         |
       +-- valid -- project mutation --> dirty --+--> Stop block
                                      |          |
                                      +--> current verify --> clean --> Stop allow
```

验证 receipt 必须来自插件自身 CLI 的精确、单一命令；命令不能包含管道、重定向、命令替换或前后 shell 子命令。receipt 要求正确 schema/toolId、当前 root 和 `stateDigest`、五分钟内时间戳、覆盖 invocation/provenance/result 的观察摘要，以及非空 session provenance。changed/rollback 还必须用 `verifiesInvocationId` 和 `revisionId` 连接最后一次写入 receipt。宿主 session 字段只用于审计，不跨 Claude/Codex adapter 强制比较名称不同的 session 标识。

普通 Stop 成功后清理当前 session/repository 的短期状态。递归 Stop 只 fail-open 当前重试，不清除未解决状态。状态位于宿主插件数据目录，按 session 和 Git root 摘要隔离，原子写入并使用短期锁；不保存项目内容或命令输出。超过 24 小时或无法解析的既有状态会保守恢复为 dirty，要求一次当前验证，而不是静默重置为 clean。

## 写入与修订

reconcile 有两种模式：

- 自动模式：建立默认受管区，并在可安全判定时迁移旧 `CLAUDE.md` 文本。
- candidate 模式：候选文件必须保留受管区以外的所有字节，只允许替换受管内容。

写入前把将被替换的根文件保存到 Git 私有路径 `harness-start/project-instruction-guard/revisions/<revisionId>/manifest.json`。流程采用临时文件、`fsync`、权限恢复和 rename；写后重新 inspect，失败则回滚。revision manifest 不进入工作树。

rollback 仅接受 after digest 仍匹配当前状态的头 revision，避免旧快照覆盖后续项目文本。rollback 本身生成新的 revision，并记录 `parentRevisionId`；verify 检查 revision 已提交、after digest 匹配当前状态以及 rollback lineage。

## 安全与兼容

- 只接受常规文件或精确相对 symlink；异常 symlink、目录和设备文件需要人工处理。
- UTF-8 解码采用 fatal 模式；拒绝 BOM。
- 只对新增或迁移进受管区的内容做敏感信息检查，避免把项目自有区的既存文本误报为迁移阻塞。
- `README.md` 共享模式允许大体量外部内容，但整个源仍限制为 1 MiB；受管区单独限制为 32 KiB/400 行。
- 非 Git 工作区静默跳过。配置加载失败时保持 `mode=block`。

## 双宿主边界

Claude 使用 `CLAUDE_PLUGIN_ROOT`，Codex 使用 `PLUGIN_ROOT`；hook 清单分别维护。两者共享业务脚本，并通过 `AI_EXPERTS_SESSION_ID` 和 `AI_EXPERTS_TRIGGER_FROM` 记录运行来源。
