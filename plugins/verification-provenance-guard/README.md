# verification-provenance-guard

`verification-provenance-guard` 要求 Claude Code 和 Codex 在发生变更，或声称测试、产物、Git、CI 结论时，提供可机器核验的 `verification-evidence/v1` 证据。

标签不是证据。`[本地实测]` 必须匹配最后一次变更后的成功命令 receipt 或当前 Git 状态；`[产物实测]` 必须匹配 workspace 内文件的字节数和 SHA-256；`[远端 CI]` 必须匹配本会话捕获的结构化 GitLab/GitHub 结果。

## 默认流程

1. SessionStart 注入简要证据协议。
2. PostToolUse 记录工作区 revision 和有界结构化 receipt。
3. 使用插件自带的 `verification-evidence-reporting` Skill 生成结论与 manifest。
4. Stop 独立解析、核验；无证据、过期证据或摘要不符时阻断。
5. `done`/`done_with_concerns` 成功放行后清空会话状态；阻断和 `needs_context` 保留状态。

普通问答不会被要求输出 manifest。完整模板见 [Skill](./skills/verification-evidence-reporting/SKILL.md)，运行时与安全边界见 [DESIGN.md](./DESIGN.md)。

## 项目配置

在 Git 根目录创建 `.verification-provenance-guard.mjs`：

```js
export default {
  mode: "block", // block | report | off
  trigger: "mutation-or-claim", // mutation-or-claim | claim-only | always
  artifact: { maxBytes: 64 * 1024 * 1024 },
  stop: { maxBlocks: 2 },
  claims: {
    additionalPatterns: [/数据库迁移已验证/u],
  },
  commands: {
    testPatterns: [/\bmy-test-runner\b/u],
    verificationPatterns: [/\bmy-static-check\b/u],
  },
};
```

配置文件是项目拥有、通过 `import()` 加载的可信可执行配置。无效字段使用有界默认值并告警；配置加载失败时保留默认守卫。

## 验证

```bash
node --test plugins/verification-provenance-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin verification-provenance-guard
```

Version: `0.1.0`
