# 候选插件：`project-instruction-custody`

| 字段 | 裁定 |
| --- | --- |
| 形态 | 新插件，建议目录 `plugins/project-instruction-custody/` |
| 优先级 | P0 |
| 默认安装 | 可以；未触碰受管指令路径时必须 idle |
| 目标 | 根级项目指令被修改后，完成前验证 canonical source、软链接和受管区结构 |

## 为什么保留

`harness-starter` 的 `project-instruction-maintenance` 同时提供 reconcile、verify 和三个生命周期 Hook。当前 `ai-experts` 没有对应 runtime 组件，只在自身根指令中维护项目级合同，因此不能把它计作第二份实现。本仓的 `project-capability-governance` 只记录待人工采纳的能力提案，明确不保证已经修改的 `AGENTS.md` / `CLAUDE.md` 仍自洽。

源实现会在任意 workspace mutation 后要求项目指令评估。Marketplace 版本应收窄：只在根级指令文件本身被触碰后 arm，避免每次代码改动都增加 Stop 噪音。

## 最小产品合同

- 只识别 Git 根的 `AGENTS.md`、`CLAUDE.md`；若两者在变更前已共同以相对软链接指向 `README.md`，则 `README.md` 也是 canonical source。
- Hook 不自动修改用户文件。内置确定性 CLI 提供 `inspect`、`reconcile`、`verify`、`recover`，所有写操作使用 expected digest；Skill 只编排这些动作。
- `PostToolUse` 发现受管路径发生变化后记录 dirty state；状态绑定 session、workspace 与当前文件摘要。
- 确定性 verifier 直接检查文件类型、相对软链接目标、受管 block 唯一性、marker 顺序、目标存在性与摘要；CLI `verify` 可提前运行，但不是完成的人工前置步骤。
- `Stop` 在 dirty state 存在时直接运行同一个 verifier 并重新读取当前摘要：结构通过则签发 receipt 并闭环，失败则拒绝。删除、改成普通文件或验证后的再次修改都会使旧 receipt 过期。
- 不把“工具跑过”当作语义正确；receipt 只证明结构与配置合同通过。

```text
受管根文件发生实际字节或文件类型变化
  → session/workspace 标为 dirty
  → reconcile（可选）最小修正
  → Stop 调用 verifier 直接读取当前文件
  → 结构通过则签发摘要绑定回执，否则保持 dirty 并阻断
```

## Hook / Skill 分工

- `PostToolUse` 拥有 dirty revision，`Stop` 拥有最终结构验证和闭环决定；无论 agent 是否记得运行 Skill，受管文件变更都会进入同一检查链。
- `project-instruction-maintenance` Skill 是 inspect、reconcile、recover 和人工提前 verify 的编排入口，负责解释 canonical source 与恢复选择。
- CLI 拥有 expected-digest 写入和 verifier receipt；Skill 不能直接清 dirty、签发 receipt，或用“已检查”声明绕过 `Stop`。

## 边界与恢复

- 不扫描 `.claude/rules/**`、用户 home 指令、子目录说明文件或跨仓同步。
- 不在没有既有受管 marker 时擅自接管 README 正文。
- 不覆盖受管 block 外项目文本；`recover` 只能恢复插件自己保存、且摘要链可验证的私有修订。
- `README.md` 模式只由“两个平台指令文件已共同链接它”这一事实触发，不能由模型猜测。

## 实现准入与验收

- 未触碰受管路径、只改普通源码、只读指令文件：完全 idle；
- 合法修改 `AGENTS.md` 后，`Stop` 自动验证并允许；结构无效时拒绝；提前运行 CLI `verify` 后再改一字节必须使旧 receipt 失效并重新验证；
- `CLAUDE.md` 绝对链接、悬空链接、链接方向相反、重复 marker、嵌套 marker：拒绝并给出可恢复诊断；
- 两文件共同链接 README 的既有项目只维护 README 受管区，保留区外文本；
- 非 Git 目录或没有根级指令文件时 fail-open，不创建文件；
- Docker 两宿主覆盖修改、verify、Stop 与 honesty gate。

还要覆盖“不加载 Skill 仍自动验证”和“Skill 声称已 reconcile、但文件仍无效时拒绝”两条路径。

若无法在两个宿主可靠识别文件工具最终目标和 session，则只允许发布显式 CLI verifier，不得用 Skill 提醒冒充 Stop completion gate。
