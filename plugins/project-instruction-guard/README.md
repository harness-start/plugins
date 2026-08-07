# project-instruction-guard

`project-instruction-guard` 为 Claude Code 和 Codex 维护 Git 根目录的项目指令源。它在会话开始时发现结构漂移，在项目文件变化后要求一次匹配当前状态的验证，并通过 `project-instruction-maintenance` Skill 提供带 CAS、修订记录和回滚的安全修复流程。

## 默认契约

插件默认对所有 Git 仓库启用 `block` 模式，并接受两种结构：

- `AGENTS.md` 是根级常规文件，`CLAUDE.md` 是精确的相对 symlink `AGENTS.md`。
- `README.md` 是共享根级常规文件，`AGENTS.md` 与 `CLAUDE.md` 都是精确的相对 symlink `README.md`。

指令源必须包含一组有序且唯一的受管标记：

```text
<!-- ai-experts:project-instructions:start -->
<!-- ai-experts:project-instructions:end -->
```

自动流程只改受管区；项目自有内容保持逐字节不变。源码上限为 1 MiB，受管区上限为 32 KiB/400 行，并拒绝 BOM、非法 UTF-8、未解决合并标记、常见凭据和个人绝对路径。

## 工作方式

| 阶段 | 行为 |
| --- | --- |
| SessionStart | 检查结构；异常时注入当前 source、findings 与 `stateDigest` |
| PostToolUse | 记录成功的文件/命令变更；只接受插件自身 CLI 的新鲜验证 receipt |
| Stop | 结构异常或最后一次变化之后缺少匹配验证时阻断完成态 |

`BLOCKED` 和 `NEEDS_CONTEXT` 可用于真实的用户决策阻塞。宿主标记的递归 Stop 重试不会再次阻断，但未完成状态仍保留，后续普通 Stop 仍会检查。

## 项目配置

在 Git 根目录创建 `.project-instruction-guard.mjs`：

```js
export default {
  mode: "report",
};
```

`mode` 支持：

- `block`：默认，Stop 强制闭环。
- `report`：报告相同问题但不阻断。
- `off`：不注入、不记录、不阻断。

配置是项目拥有、通过 `import()` 加载的可信可执行配置；除 `mode` 外的字段会使配置回退到严格默认值。

## 手动验证

优先调用插件自带的 `project-instruction-maintenance` Skill。CLI 的 inspect、reconcile、verify、rollback receipt 和恢复契约见 [DESIGN.md](./DESIGN.md)。

```bash
node --test plugins/project-instruction-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin project-instruction-guard
```

Version: `0.1.0`
